// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

/**
 * @title KashLinkEscrow
 * @notice Holds stablecoins for KashLinks — money sent as a link — on Arc.
 *
 * A link is a throwaway key pair. The private key travels in the link URL; its address is the link's
 * id here. The sender deposits against that id, and whoever holds the link claims by sending a
 * transaction *from* the link address. On Arc the native token is USDC, so the link address can pay
 * for its own claim: `create` forwards a small stipend to it for exactly that. No relayer, no gas
 * token, no signature scheme.
 *
 * A link has `slots`. With one slot it is cash for one person. With more it is a drop: the first
 * `slots` addresses to open it each get `amountEach`, and the sender takes back whatever is left
 * after expiry. Every slot carries its own stipend, so every claim has gas.
 *
 * A link carries either native USDC (`token == address(0)`, 18-decimal `msg.value` units) or an
 * ERC-20 such as EURC (`token` set, the token's own decimals). The stipend is always native USDC.
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

    /// @dev Two slots: (sender, amountEach) and (token, expiry, slots, claimed, status).
    struct Link {
        address sender;
        uint96 amountEach;
        address token;
        uint40 expiry;
        uint24 slots;
        uint24 claimed;
        Status status;
    }

    /// @notice Native USDC forwarded to the link address per slot at creation, so each claim can pay.
    /// @dev 0.01 USDC. A claim costs ~70k gas; at Arc's 20 gwei floor that is 0.0014 USDC, so this
    ///      leaves room for retries if the fee market moves. Whatever is left stays as dust.
    uint96 public constant STIPEND = 0.01 ether;

    /// @notice Upper bound on the fee rate the owner can set, in basis points.
    uint16 public constant MAX_FEE_BPS = 500;

    /// @notice Upper bound on slots per link. Keeps the stipend and the refund maths trivially bounded.
    uint24 public constant MAX_SLOTS = 1000;

    mapping(address linkId => Link) public links;
    /// @notice Whether `to` has already taken a slot of `linkId`. One slot per address per drop.
    mapping(address linkId => mapping(address to => bool)) public claimedBy;

    address public owner;
    address public pendingOwner;

    /// @notice Where fees go. Must be set whenever `feeBps` is non-zero.
    address public treasury;
    /// @notice Fee rate in basis points of the link total. Zero switches fees off entirely.
    uint16 public feeBps;
    /// @notice Optional floor on the fee, in the link's token units; zero means a flat percentage.
    ///         Only applies while `feeBps` is non-zero. Note it is one number for every token.
    uint96 public feeMin;

    uint256 private _entered = 1;

    event LinkCreated(
        address indexed linkId,
        address indexed sender,
        address indexed token,
        uint256 amountEach,
        uint24 slots,
        uint40 expiry
    );
    event LinkClaimed(address indexed linkId, address indexed to, uint256 amount, uint24 remaining);
    event LinkRefunded(address indexed linkId, address indexed sender, uint256 amount);
    event FeesUpdated(uint16 feeBps, uint96 feeMin, address treasury);
    event OwnershipTransferStarted(address indexed from, address indexed to);
    event OwnershipTransferred(address indexed from, address indexed to);

    error ZeroAddress();
    error ZeroAmount();
    error BadSlots();
    error LinkExists(address linkId);
    error NotPending(address linkId);
    error AlreadyClaimed(address linkId, address to);
    error ExpiryInPast();
    error WrongValue(uint256 expected, uint256 sent);
    error NotSender();
    error NotExpired(uint40 expiry);
    error FeeTooHigh();
    error TreasuryRequired();
    error NotOwner();
    error NotPendingOwner();
    error TransferFailed(address token, address to);
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

    // ---------------------------------------------------------------- quotes

    /// @notice The fee charged on top of a link total, in the link's token units.
    function feeFor(uint256 total) public view returns (uint256) {
        if (feeBps == 0) return 0;
        uint256 fee = (total * feeBps) / 10_000;
        return fee < feeMin ? feeMin : fee;
    }

    /**
     * @notice What a link costs the sender.
     * @return tokenTotal  What the recipients get in total, plus the fee — in the link's token. For a
     *                     native link this is part of `value`; for an ERC-20 link it is pulled with
     *                     `transferFrom`, so it is what the sender must approve.
     * @return fee         The fee inside `tokenTotal`.
     * @return value       `msg.value` that `create` requires: the stipends, plus `tokenTotal` for a
     *                     native link.
     */
    function quote(address token, uint96 amountEach, uint24 slots)
        public
        view
        returns (uint256 tokenTotal, uint256 fee, uint256 value)
    {
        uint256 total = uint256(amountEach) * slots;
        fee = feeFor(total);
        tokenTotal = total + fee;
        value = uint256(STIPEND) * slots;
        if (token == address(0)) value += tokenTotal;
    }

    // ---------------------------------------------------------------- links

    /**
     * @notice Fund a link.
     * @param linkId      Address of the link's throwaway key. Must be unused.
     * @param token       `address(0)` for native USDC, or an ERC-20 the sender has approved.
     * @param amountEach  What each claimant receives, in the token's units.
     * @param slots       How many claims the link allows. 1 for ordinary cash.
     * @param expiry      Unix time after which the sender may take back what is unclaimed.
     * @dev `msg.value` must equal `quote(...).value` exactly. The fee goes to the treasury now, not on
     *      resolution: a link costs the same whether it is claimed or returned, which is what stops
     *      create-then-refund being free. For ERC-20 links the fee is paid in that token.
     */
    function create(address linkId, address token, uint96 amountEach, uint24 slots, uint40 expiry)
        external
        payable
        nonReentrant
    {
        if (linkId == address(0)) revert ZeroAddress();
        if (amountEach == 0) revert ZeroAmount();
        if (slots == 0 || slots > MAX_SLOTS) revert BadSlots();
        if (links[linkId].status != Status.None) revert LinkExists(linkId);
        if (expiry <= block.timestamp) revert ExpiryInPast();

        (uint256 tokenTotal, uint256 fee, uint256 value) = quote(token, amountEach, slots);
        if (msg.value != value) revert WrongValue(value, msg.value);

        links[linkId] = Link({
            sender: msg.sender,
            amountEach: amountEach,
            token: token,
            expiry: expiry,
            slots: slots,
            claimed: 0,
            status: Status.Pending
        });
        emit LinkCreated(linkId, msg.sender, token, amountEach, slots, expiry);

        _pay(address(0), linkId, uint256(STIPEND) * slots);
        if (token == address(0)) {
            if (fee != 0) _pay(address(0), treasury, fee);
        } else {
            _pull(token, msg.sender, address(this), tokenTotal - fee);
            if (fee != 0) _pull(token, msg.sender, treasury, fee);
        }
    }

    /**
     * @notice Claim one slot of the link whose key signed this transaction, paying `to`.
     * @dev Allowed at any time while the link is pending, including after expiry: money must never
     *      be stuck because a sender forgot to return it. `refund` and `claim` cannot both succeed.
     */
    function claim(address to) external nonReentrant {
        if (to == address(0)) revert ZeroAddress();
        Link storage link = links[msg.sender];
        if (link.status != Status.Pending) revert NotPending(msg.sender);
        if (claimedBy[msg.sender][to]) revert AlreadyClaimed(msg.sender, to);

        claimedBy[msg.sender][to] = true;
        uint24 remaining = link.slots - ++link.claimed;
        if (remaining == 0) link.status = Status.Claimed;
        uint256 amount = link.amountEach;
        emit LinkClaimed(msg.sender, to, amount, remaining);

        _pay(link.token, to, amount);
    }

    /// @notice Take back whatever is unclaimed once the link has expired. Sender only.
    function refund(address linkId) external nonReentrant {
        Link storage link = links[linkId];
        if (link.status != Status.Pending) revert NotPending(linkId);
        if (link.sender != msg.sender) revert NotSender();
        if (block.timestamp < link.expiry) revert NotExpired(link.expiry);

        link.status = Status.Refunded;
        uint256 amount = uint256(link.amountEach) * (link.slots - link.claimed);
        emit LinkRefunded(linkId, msg.sender, amount);

        _pay(link.token, msg.sender, amount);
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

    /// @dev Send `amount` of `token` (native when zero). A native send on Arc reverts for the zero
    ///      address, blocklisted addresses, and contracts whose receive path fails; an ERC-20 may
    ///      revert or return false. All of those fail the whole call.
    function _pay(address token, address to, uint256 amount) private {
        if (token == address(0)) {
            (bool ok,) = to.call{value: amount}("");
            if (!ok) revert TransferFailed(token, to);
        } else {
            _erc20(token, to, abi.encodeWithSelector(0xa9059cbb, to, amount)); // transfer(to, amount)
        }
    }

    /// @dev `transferFrom` with the same return-value discipline as `_pay`.
    function _pull(address token, address from, address to, uint256 amount) private {
        _erc20(token, to, abi.encodeWithSelector(0x23b872dd, from, to, amount)); // transferFrom(from, to, amount)
    }

    /// @dev Tokens that return nothing (USDT-style) are accepted; a `false` or a revert is not.
    function _erc20(address token, address to, bytes memory data) private {
        (bool ok, bytes memory ret) = token.call(data);
        if (!ok || (ret.length != 0 && !abi.decode(ret, (bool))) || token.code.length == 0) {
            revert TransferFailed(token, to);
        }
    }
}
