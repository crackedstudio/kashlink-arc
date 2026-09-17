// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

/**
 * @title KashLinkEscrow
 * @notice Holds USDC for KashLinks — money sent as a link — on Arc.
 *
 * A link is a throwaway key pair. The private key travels in the link URL; its address is the link's
 * id here. The sender deposits USDC against that id, and whoever holds the link claims it by sending
 * a transaction *from* the link address. On Arc the native token is USDC, so the link address can pay
 * for its own claim: `create` forwards a small stipend to it for exactly that. No relayer, no gas
 * token, no signature scheme.
 *
 * Amounts everywhere are native USDC, 18 decimals — `msg.value` units, not the 6-decimal ERC-20 view.
 *
 * What the owner can do: change the fee rate (capped at 5%), the fee floor, and the treasury address,
 * and hand ownership over. What the owner cannot do: touch escrowed funds, pause claims, or change the
 * code. There is no upgrade path by design.
 */
contract KashLinkEscrow {
    enum Status {
        None,
        Pending,
        Claimed,
        Refunded
    }

    /// @dev Packed into two slots: (sender, amount) and (expiry, status).
    struct Link {
        address sender;
        uint96 amount;
        uint64 expiry;
        Status status;
    }

    /// @notice Native USDC forwarded to the link address at creation so it can pay to claim.
    /// @dev 0.01 USDC. A claim costs ~60k gas; at Arc's 20 gwei floor that is 0.0012 USDC, so this
    ///      leaves room for a few retries if the fee market moves. Whatever is left stays in the
    ///      link address as dust.
    uint96 public constant STIPEND = 0.01 ether;

    /// @notice Upper bound on the fee rate the owner can set, in basis points.
    uint16 public constant MAX_FEE_BPS = 500;

    mapping(address linkId => Link) public links;

    address public owner;
    address public pendingOwner;

    /// @notice Where fees go. Must be set whenever `feeBps` is non-zero.
    address public treasury;
    /// @notice Fee rate in basis points of the link amount. Zero switches fees off entirely.
    uint16 public feeBps;
    /// @notice Optional floor on the fee, native units; zero means a flat percentage. Only applies
    ///         while `feeBps` is non-zero.
    uint96 public feeMin;

    uint256 private _entered = 1;

    event LinkCreated(address indexed linkId, address indexed sender, uint256 amount, uint64 expiry);
    event LinkClaimed(address indexed linkId, address indexed to, uint256 amount);
    event LinkRefunded(address indexed linkId, address indexed sender, uint256 amount);
    event FeesUpdated(uint16 feeBps, uint96 feeMin, address treasury);
    event OwnershipTransferStarted(address indexed from, address indexed to);
    event OwnershipTransferred(address indexed from, address indexed to);

    error ZeroAddress();
    error ZeroAmount();
    error LinkExists(address linkId);
    error NotPending(address linkId);
    error ExpiryInPast();
    error WrongValue(uint256 expected, uint256 sent);
    error NotSender();
    error NotExpired(uint64 expiry);
    error FeeTooHigh();
    error TreasuryRequired();
    error NotOwner();
    error NotPendingOwner();
    error TransferFailed(address to);
    error Reentrancy();

    modifier onlyOwner() {
        _checkOwner();
        _;
    }

    modifier nonReentrant() {
        _enter();
        _;
        _exit();
    }

    constructor(address owner_, address treasury_, uint16 feeBps_, uint96 feeMin_) {
        if (owner_ == address(0)) revert ZeroAddress();
        owner = owner_;
        emit OwnershipTransferred(address(0), owner_);
        _setFees(feeBps_, feeMin_, treasury_);
    }

    // ---------------------------------------------------------------- links

    /// @notice The fee charged on top of `amount`.
    function feeFor(uint256 amount) public view returns (uint256) {
        if (feeBps == 0) return 0;
        uint256 fee = (amount * feeBps) / 10_000;
        return fee < feeMin ? feeMin : fee;
    }

    /// @notice What the sender must attach to `create` for a link worth `amount`.
    function totalFor(uint256 amount) public view returns (uint256) {
        return amount + feeFor(amount) + STIPEND;
    }

    /**
     * @notice Fund a link.
     * @param linkId  Address of the link's throwaway key. Must be unused.
     * @param amount  What the recipient receives, native units.
     * @param expiry  Unix time after which the sender may take the money back.
     * @dev `msg.value` must equal `totalFor(amount)` exactly. The fee goes to the treasury now, not
     *      on resolution: a link costs the same whether it is claimed or returned, which is what
     *      stops create-then-refund being free.
     */
    function create(address linkId, uint96 amount, uint64 expiry) external payable nonReentrant {
        if (linkId == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();
        if (links[linkId].status != Status.None) revert LinkExists(linkId);
        if (expiry <= block.timestamp) revert ExpiryInPast();

        uint256 fee = feeFor(amount);
        uint256 expected = amount + fee + STIPEND;
        if (msg.value != expected) revert WrongValue(expected, msg.value);

        links[linkId] = Link({sender: msg.sender, amount: amount, expiry: expiry, status: Status.Pending});
        emit LinkCreated(linkId, msg.sender, amount, expiry);

        _pay(linkId, STIPEND);
        if (fee != 0) _pay(treasury, fee);
    }

    /**
     * @notice Claim the link whose key signed this transaction, paying `to`.
     * @dev Allowed at any time while the link is pending, including after expiry: money must never
     *      be stuck because a sender forgot to return it. `refund` and `claim` cannot both succeed.
     */
    function claim(address to) external nonReentrant {
        if (to == address(0)) revert ZeroAddress();
        Link storage link = links[msg.sender];
        if (link.status != Status.Pending) revert NotPending(msg.sender);

        link.status = Status.Claimed;
        uint256 amount = link.amount;
        emit LinkClaimed(msg.sender, to, amount);

        _pay(to, amount);
    }

    /// @notice Take back an unclaimed link once it has expired. Sender only.
    function refund(address linkId) external nonReentrant {
        Link storage link = links[linkId];
        if (link.status != Status.Pending) revert NotPending(linkId);
        if (link.sender != msg.sender) revert NotSender();
        if (block.timestamp < link.expiry) revert NotExpired(link.expiry);

        link.status = Status.Refunded;
        uint256 amount = link.amount;
        emit LinkRefunded(linkId, msg.sender, amount);

        _pay(msg.sender, amount);
    }

    // ---------------------------------------------------------------- owner

    function setFees(uint16 feeBps_, uint96 feeMin_, address treasury_) external onlyOwner {
        _setFees(feeBps_, feeMin_, treasury_);
    }

    function transferOwnership(address to) external onlyOwner {
        pendingOwner = to;
        emit OwnershipTransferStarted(owner, to);
    }

    function acceptOwnership() external {
        if (msg.sender != pendingOwner) revert NotPendingOwner();
        emit OwnershipTransferred(owner, msg.sender);
        owner = msg.sender;
        pendingOwner = address(0);
    }

    // ---------------------------------------------------------------- internal

    function _checkOwner() private view {
        if (msg.sender != owner) revert NotOwner();
    }

    function _enter() private {
        if (_entered != 1) revert Reentrancy();
        _entered = 2;
    }

    function _exit() private {
        _entered = 1;
    }

    function _setFees(uint16 feeBps_, uint96 feeMin_, address treasury_) private {
        if (feeBps_ > MAX_FEE_BPS) revert FeeTooHigh();
        if (feeBps_ != 0 && treasury_ == address(0)) revert TreasuryRequired();
        feeBps = feeBps_;
        feeMin = feeMin_;
        treasury = treasury_;
        emit FeesUpdated(feeBps_, feeMin_, treasury_);
    }

    /// @dev Native send. On Arc this reverts for the zero address, blocklisted addresses, and
    ///      contracts whose receive path fails; all of those should fail the whole call.
    function _pay(address to, uint256 amount) private {
        (bool ok,) = to.call{value: amount}("");
        if (!ok) revert TransferFailed(to);
    }
}
