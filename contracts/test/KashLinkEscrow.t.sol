// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Test} from "forge-std/Test.sol";
import {KashLinkEscrow} from "../src/KashLinkEscrow.sol";

/// @dev A payout target that tries to claim again from inside its receive hook.
contract Reenterer {
    KashLinkEscrow private immutable ESCROW;
    bool public attacked;

    constructor(KashLinkEscrow escrow_) {
        ESCROW = escrow_;
    }

    receive() external payable {
        if (!attacked) {
            attacked = true;
            ESCROW.claim(address(this));
        }
    }
}

/// @dev A payout target that refuses money.
contract Rejecter {
    receive() external payable {
        revert("no");
    }
}

/// @dev Minimal ERC-20 standing in for EURC (6 decimals). `broken` makes transfers return false.
contract MockToken {
    uint8 public constant decimals = 6;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    bool public broken;

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }

    function setBroken(bool value) external {
        broken = value;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        if (broken) return false;
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        if (broken) return false;
        allowance[from][msg.sender] -= amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        return true;
    }
}

contract KashLinkEscrowTest is Test {
    KashLinkEscrow internal escrow;
    MockToken internal eurc;

    address internal owner = makeAddr("owner");
    address internal treasury = makeAddr("treasury");
    address internal sender = makeAddr("sender");
    address internal recipient = makeAddr("recipient");
    address internal NATIVE = address(0);

    uint256 internal linkKey = 0xA11CE;
    address internal linkId;

    uint16 internal constant FEE_BPS = 100; // 1%
    uint96 internal constant STIPEND = 0.01 ether;
    uint40 internal constant WEEK = 7 days;
    uint256 internal constant EUR = 1e6;

    function setUp() public {
        vm.warp(1_700_000_000);
        escrow = new KashLinkEscrow(owner, treasury, FEE_BPS, 0);
        eurc = new MockToken();
        linkId = vm.addr(linkKey);
        vm.deal(sender, 1_000 ether);
        eurc.mint(sender, 1_000 * EUR);
        vm.prank(sender);
        eurc.approve(address(escrow), type(uint256).max);
    }

    function _expiry() internal view returns (uint40) {
        return uint40(block.timestamp) + WEEK;
    }

    /// @dev Native link with `slots` slots of `amountEach`, from `sender`, at `linkId`.
    function _create(uint96 amountEach, uint24 slots) internal returns (uint40 expiry) {
        return _createAs(sender, linkId, NATIVE, amountEach, slots);
    }

    function _createAs(address who, address id, address token, uint96 amountEach, uint24 slots)
        internal
        returns (uint40 expiry)
    {
        expiry = _expiry();
        (,, uint256 value) = escrow.quote(token, amountEach, slots);
        vm.prank(who);
        escrow.create{value: value}(id, token, amountEach, slots, expiry);
    }

    function _status(address id) internal view returns (KashLinkEscrow.Status s) {
        (,,,,,, s) = escrow.links(id);
    }

    function _claimed(address id) internal view returns (uint24 c) {
        (,,,,, c,) = escrow.links(id);
    }

    // ------------------------------------------------------------ quotes

    function test_feeFor_flatPercent() public view {
        assertEq(escrow.feeFor(100 ether), 1 ether);
        assertEq(escrow.feeFor(1 ether), 0.01 ether);
        assertEq(escrow.feeFor(1), 0, "1 wei rounds to no fee");
    }

    function test_feeFor_floorWhenSet() public {
        vm.prank(owner);
        escrow.setFees(FEE_BPS, 0.1 ether, treasury);
        assertEq(escrow.feeFor(1 ether), 0.1 ether);
        assertEq(escrow.feeFor(100 ether), 1 ether);
    }

    function test_feeFor_zeroWhenDisabled() public {
        vm.prank(owner);
        escrow.setFees(0, 0.1 ether, address(0));
        assertEq(escrow.feeFor(1 ether), 0);
    }

    function test_quote_native() public view {
        (uint256 tokenTotal, uint256 fee, uint256 value) = escrow.quote(NATIVE, 10 ether, 3);
        assertEq(fee, 0.3 ether, "1% of the 30 total");
        assertEq(tokenTotal, 30.3 ether);
        assertEq(value, 30.3 ether + 3 * STIPEND);
    }

    function test_quote_erc20() public view {
        (uint256 tokenTotal, uint256 fee, uint256 value) = escrow.quote(address(eurc), uint96(10 * EUR), 3);
        assertEq(fee, 0.3 * 1e6);
        assertEq(tokenTotal, 30.3 * 1e6);
        assertEq(value, 3 * STIPEND, "only the stipends are native");
    }

    function testFuzz_quote_native(uint96 amountEach, uint24 slots) public view {
        slots = uint24(bound(slots, 1, escrow.MAX_SLOTS()));
        uint256 total = uint256(amountEach) * slots;
        (uint256 tokenTotal, uint256 fee, uint256 value) = escrow.quote(NATIVE, amountEach, slots);
        assertEq(fee, escrow.feeFor(total));
        assertEq(tokenTotal, total + fee);
        assertEq(value, total + fee + uint256(STIPEND) * slots);
    }

    // ------------------------------------------------------------ create

    function test_create_storesLinkAndSplitsValue() public {
        uint96 amount = 50 ether;
        vm.expectEmit(true, true, true, true);
        emit KashLinkEscrow.LinkCreated(linkId, sender, NATIVE, amount, 1, _expiry());
        uint40 expiry = _create(amount, 1);

        (address s, uint96 a, address t, uint40 e, uint24 slots, uint24 claimed, KashLinkEscrow.Status st) =
            escrow.links(linkId);
        assertEq(s, sender);
        assertEq(a, amount);
        assertEq(t, NATIVE);
        assertEq(e, expiry);
        assertEq(slots, 1);
        assertEq(claimed, 0);
        assertEq(uint8(st), uint8(KashLinkEscrow.Status.Pending));

        assertEq(address(escrow).balance, amount, "escrow holds exactly the amount");
        assertEq(linkId.balance, STIPEND, "stipend landed on the link key");
        assertEq(treasury.balance, 0.5 ether, "1% fee paid up front");
    }

    function test_create_drop_stipendPerSlot() public {
        _create(2 ether, 5);
        assertEq(linkId.balance, 5 * STIPEND);
        assertEq(address(escrow).balance, 10 ether);
        assertEq(treasury.balance, 0.1 ether, "fee on the 10 total");
    }

    function test_create_revertsOnWrongValue() public {
        (,, uint256 value) = escrow.quote(NATIVE, 5 ether, 1);
        vm.prank(sender);
        vm.expectRevert(abi.encodeWithSelector(KashLinkEscrow.WrongValue.selector, value, value - 1));
        escrow.create{value: value - 1}(linkId, NATIVE, 5 ether, 1, _expiry());
        vm.prank(sender);
        vm.expectRevert(abi.encodeWithSelector(KashLinkEscrow.WrongValue.selector, value, value + 1));
        escrow.create{value: value + 1}(linkId, NATIVE, 5 ether, 1, _expiry());
    }

    function test_create_revertsOnDuplicateLink() public {
        _create(1 ether, 1);
        (,, uint256 value) = escrow.quote(NATIVE, 1 ether, 1);
        vm.prank(sender);
        vm.expectRevert(abi.encodeWithSelector(KashLinkEscrow.LinkExists.selector, linkId));
        escrow.create{value: value}(linkId, NATIVE, 1 ether, 1, _expiry());
    }

    function test_create_revertsOnResolvedLinkReuse() public {
        _create(1 ether, 1);
        vm.prank(linkId);
        escrow.claim(recipient);
        (,, uint256 value) = escrow.quote(NATIVE, 1 ether, 1);
        vm.prank(sender);
        vm.expectRevert(abi.encodeWithSelector(KashLinkEscrow.LinkExists.selector, linkId));
        escrow.create{value: value}(linkId, NATIVE, 1 ether, 1, _expiry());
    }

    function test_create_revertsOnBadInputs() public {
        uint40 expiry = _expiry();
        (,, uint256 value) = escrow.quote(NATIVE, 1 ether, 1);
        (,, uint256 tooMany) = escrow.quote(NATIVE, 1, 1001);
        vm.startPrank(sender);
        vm.expectRevert(KashLinkEscrow.ZeroAmount.selector);
        escrow.create{value: STIPEND}(linkId, NATIVE, 0, 1, expiry);
        vm.expectRevert(KashLinkEscrow.ZeroAddress.selector);
        escrow.create{value: value}(address(0), NATIVE, 1 ether, 1, expiry);
        vm.expectRevert(KashLinkEscrow.ExpiryInPast.selector);
        escrow.create{value: value}(linkId, NATIVE, 1 ether, 1, uint40(block.timestamp));
        vm.expectRevert(KashLinkEscrow.BadSlots.selector);
        escrow.create{value: 0}(linkId, NATIVE, 1 ether, 0, expiry);
        vm.expectRevert(KashLinkEscrow.BadSlots.selector);
        escrow.create{value: tooMany}(linkId, NATIVE, 1, 1001, expiry);
        vm.stopPrank();
    }

    function test_create_noFeeTransferWhenDisabled() public {
        vm.prank(owner);
        escrow.setFees(0, 0, address(0));
        _create(1 ether, 1);
        assertEq(treasury.balance, 0);
        assertEq(address(escrow).balance, 1 ether);
    }

    // ------------------------------------------------------------ claim

    function test_claim_paysRecipient() public {
        uint96 amount = 20 ether;
        _create(amount, 1);
        vm.expectEmit(true, true, false, true);
        emit KashLinkEscrow.LinkClaimed(linkId, recipient, amount, 0);
        vm.prank(linkId);
        escrow.claim(recipient);

        assertEq(recipient.balance, amount);
        assertEq(address(escrow).balance, 0);
        assertEq(uint8(_status(linkId)), uint8(KashLinkEscrow.Status.Claimed));
        assertTrue(escrow.claimedBy(linkId, recipient));
    }

    function test_claim_drop_untilExhausted() public {
        _create(1 ether, 3);
        address[3] memory people = [makeAddr("a"), makeAddr("b"), makeAddr("c")];
        for (uint256 i = 0; i < 3; i++) {
            vm.expectEmit(true, true, false, true);
            emit KashLinkEscrow.LinkClaimed(linkId, people[i], 1 ether, uint24(2 - i));
            vm.prank(linkId);
            escrow.claim(people[i]);
            assertEq(people[i].balance, 1 ether);
            assertEq(_claimed(linkId), uint24(i + 1));
        }
        assertEq(uint8(_status(linkId)), uint8(KashLinkEscrow.Status.Claimed));
        assertEq(address(escrow).balance, 0);

        vm.prank(linkId);
        vm.expectRevert(abi.encodeWithSelector(KashLinkEscrow.NotPending.selector, linkId));
        escrow.claim(makeAddr("d"));
    }

    function test_claim_drop_oneSlotPerAddress() public {
        _create(1 ether, 3);
        vm.startPrank(linkId);
        escrow.claim(recipient);
        vm.expectRevert(abi.encodeWithSelector(KashLinkEscrow.AlreadyClaimed.selector, linkId, recipient));
        escrow.claim(recipient);
        vm.stopPrank();
        assertEq(recipient.balance, 1 ether);
        assertEq(_claimed(linkId), 1);
    }

    function test_claim_stillWorksAfterExpiry() public {
        uint40 expiry = _create(1 ether, 1);
        vm.warp(expiry + 30 days);
        vm.prank(linkId);
        escrow.claim(recipient);
        assertEq(recipient.balance, 1 ether);
    }

    function test_claim_revertsForNonLinkKey() public {
        _create(1 ether, 1);
        vm.prank(recipient);
        vm.expectRevert(abi.encodeWithSelector(KashLinkEscrow.NotPending.selector, recipient));
        escrow.claim(recipient);
    }

    function test_claim_revertsAfterRefund() public {
        uint40 expiry = _create(1 ether, 1);
        vm.warp(expiry);
        vm.prank(sender);
        escrow.refund(linkId);
        vm.prank(linkId);
        vm.expectRevert(abi.encodeWithSelector(KashLinkEscrow.NotPending.selector, linkId));
        escrow.claim(recipient);
    }

    function test_claim_revertsOnZeroRecipient() public {
        _create(1 ether, 1);
        vm.prank(linkId);
        vm.expectRevert(KashLinkEscrow.ZeroAddress.selector);
        escrow.claim(address(0));
    }

    function test_claim_revertsWhenRecipientRejects() public {
        _create(1 ether, 1);
        address rejecter = address(new Rejecter());
        vm.prank(linkId);
        vm.expectRevert(abi.encodeWithSelector(KashLinkEscrow.TransferFailed.selector, NATIVE, rejecter));
        escrow.claim(rejecter);
        assertEq(uint8(_status(linkId)), uint8(KashLinkEscrow.Status.Pending), "still claimable");
        assertFalse(escrow.claimedBy(linkId, rejecter), "the failed claim left no mark");
    }

    function test_claim_reentrancyIsBlocked() public {
        _create(1 ether, 2);
        Reenterer attacker = new Reenterer(escrow);
        vm.prank(linkId);
        vm.expectRevert(abi.encodeWithSelector(KashLinkEscrow.TransferFailed.selector, NATIVE, address(attacker)));
        escrow.claim(address(attacker));
    }

    // ------------------------------------------------------------ refund

    function test_refund_afterExpiry() public {
        uint96 amount = 3 ether;
        uint40 expiry = _create(amount, 1);
        uint256 before = sender.balance;
        vm.warp(expiry);
        vm.expectEmit(true, true, false, true);
        emit KashLinkEscrow.LinkRefunded(linkId, sender, amount);
        vm.prank(sender);
        escrow.refund(linkId);
        assertEq(sender.balance, before + amount, "amount comes back; fee and stipend do not");
        assertEq(uint8(_status(linkId)), uint8(KashLinkEscrow.Status.Refunded));
    }

    function test_refund_drop_returnsOnlyUnclaimed() public {
        uint40 expiry = _create(1 ether, 4);
        vm.prank(linkId);
        escrow.claim(recipient);
        vm.warp(expiry);
        uint256 before = sender.balance;
        vm.expectEmit(true, true, false, true);
        emit KashLinkEscrow.LinkRefunded(linkId, sender, 3 ether);
        vm.prank(sender);
        escrow.refund(linkId);
        assertEq(sender.balance, before + 3 ether);
        assertEq(address(escrow).balance, 0);
    }

    function test_refund_revertsBeforeExpiry() public {
        uint40 expiry = _create(1 ether, 1);
        vm.warp(expiry - 1);
        vm.prank(sender);
        vm.expectRevert(abi.encodeWithSelector(KashLinkEscrow.NotExpired.selector, expiry));
        escrow.refund(linkId);
    }

    function test_refund_revertsForNonSender() public {
        uint40 expiry = _create(1 ether, 1);
        vm.warp(expiry);
        vm.prank(recipient);
        vm.expectRevert(KashLinkEscrow.NotSender.selector);
        escrow.refund(linkId);
    }

    function test_refund_revertsWhenClaimedOrUnknown() public {
        uint40 expiry = _create(1 ether, 1);
        vm.prank(linkId);
        escrow.claim(recipient);
        vm.warp(expiry);
        address unknown = makeAddr("unknown");
        vm.startPrank(sender);
        vm.expectRevert(abi.encodeWithSelector(KashLinkEscrow.NotPending.selector, linkId));
        escrow.refund(linkId);
        vm.expectRevert(abi.encodeWithSelector(KashLinkEscrow.NotPending.selector, unknown));
        escrow.refund(unknown);
        vm.stopPrank();
    }

    // ------------------------------------------------------------ ERC-20 (EURC)

    function test_erc20_createPullsTokenAndPaysStipendNatively() public {
        uint96 each = uint96(10 * EUR);
        _createAs(sender, linkId, address(eurc), each, 2);
        assertEq(eurc.balanceOf(address(escrow)), 20 * EUR, "escrow holds the token total");
        assertEq(eurc.balanceOf(treasury), 0.2 * 1e6, "fee in the token");
        assertEq(eurc.balanceOf(sender), (1_000 - 20.2) * 1e6);
        assertEq(address(escrow).balance, 0, "no native value held");
        assertEq(linkId.balance, 2 * STIPEND, "stipends still native");
    }

    function test_erc20_claimAndRefund() public {
        uint40 expiry = _createAs(sender, linkId, address(eurc), uint96(10 * EUR), 2);
        vm.prank(linkId);
        escrow.claim(recipient);
        assertEq(eurc.balanceOf(recipient), 10 * EUR);
        vm.warp(expiry);
        vm.prank(sender);
        escrow.refund(linkId);
        assertEq(eurc.balanceOf(sender), (1_000 - 10.2) * 1e6, "one slot's worth came back");
        assertEq(eurc.balanceOf(address(escrow)), 0);
    }

    function test_erc20_createRevertsOnWrongValue() public {
        (,, uint256 value) = escrow.quote(address(eurc), uint96(EUR), 1);
        vm.prank(sender);
        vm.expectRevert(abi.encodeWithSelector(KashLinkEscrow.WrongValue.selector, value, value + 1));
        escrow.create{value: value + 1}(linkId, address(eurc), uint96(EUR), 1, _expiry());
    }

    function test_erc20_createRevertsWithoutAllowance() public {
        address poor = makeAddr("poor");
        vm.deal(poor, 1 ether);
        eurc.mint(poor, EUR);
        (,, uint256 value) = escrow.quote(address(eurc), uint96(EUR), 1);
        vm.prank(poor);
        vm.expectRevert(); // MockToken underflows on the allowance
        escrow.create{value: value}(linkId, address(eurc), uint96(EUR), 1, _expiry());
    }

    function test_erc20_falseReturnIsAFailure() public {
        _createAs(sender, linkId, address(eurc), uint96(EUR), 1);
        eurc.setBroken(true);
        vm.prank(linkId);
        vm.expectRevert(abi.encodeWithSelector(KashLinkEscrow.TransferFailed.selector, address(eurc), recipient));
        escrow.claim(recipient);
        assertEq(uint8(_status(linkId)), uint8(KashLinkEscrow.Status.Pending));
    }

    function test_erc20_nonContractTokenIsAFailure() public {
        address fake = makeAddr("fake-token");
        (,, uint256 value) = escrow.quote(fake, uint96(EUR), 1);
        vm.prank(sender);
        vm.expectRevert(abi.encodeWithSelector(KashLinkEscrow.TransferFailed.selector, fake, address(escrow)));
        escrow.create{value: value}(linkId, fake, uint96(EUR), 1, _expiry());
    }

    // ------------------------------------------------------------ owner

    function test_setFees_updatesAndEmits() public {
        address t2 = makeAddr("treasury2");
        vm.expectEmit(false, false, false, true);
        emit KashLinkEscrow.FeesUpdated(250, 1 ether, t2);
        vm.prank(owner);
        escrow.setFees(250, 1 ether, t2);
        assertEq(escrow.feeBps(), 250);
        assertEq(escrow.feeMin(), 1 ether);
        assertEq(escrow.treasury(), t2);
    }

    function test_setFees_validation() public {
        vm.startPrank(owner);
        vm.expectRevert(KashLinkEscrow.FeeTooHigh.selector);
        escrow.setFees(501, 0, treasury);
        vm.expectRevert(KashLinkEscrow.TreasuryRequired.selector);
        escrow.setFees(1, 0, address(0));
        vm.stopPrank();
        vm.prank(sender);
        vm.expectRevert(KashLinkEscrow.NotOwner.selector);
        escrow.setFees(0, 0, address(0));
    }

    function test_constructor_validates() public {
        vm.expectRevert(KashLinkEscrow.ZeroAddress.selector);
        new KashLinkEscrow(address(0), treasury, 0, 0);
        vm.expectRevert(KashLinkEscrow.FeeTooHigh.selector);
        new KashLinkEscrow(owner, treasury, 501, 0);
        vm.expectRevert(KashLinkEscrow.TreasuryRequired.selector);
        new KashLinkEscrow(owner, address(0), 100, 0);
    }

    function test_ownership_twoStep() public {
        address next = makeAddr("next");
        vm.prank(owner);
        escrow.transferOwnership(next);
        assertEq(escrow.owner(), owner, "unchanged until accepted");
        vm.prank(sender);
        vm.expectRevert(KashLinkEscrow.NotPendingOwner.selector);
        escrow.acceptOwnership();
        vm.prank(next);
        escrow.acceptOwnership();
        assertEq(escrow.owner(), next);
        assertEq(escrow.pendingOwner(), address(0));
    }

    function test_ownerCannotTouchEscrowedFunds() public {
        _create(10 ether, 1);
        vm.startPrank(owner);
        vm.expectRevert(abi.encodeWithSelector(KashLinkEscrow.NotPending.selector, owner));
        escrow.claim(owner);
        vm.expectRevert(KashLinkEscrow.NotSender.selector);
        escrow.refund(linkId);
        vm.stopPrank();
        assertEq(address(escrow).balance, 10 ether);
    }

    // ------------------------------------------------------------ the built-in index

    function test_index_countersTotalsAndLinksOf() public {
        assertEq(escrow.DEPLOYED_AT(), uint40(block.timestamp));
        address a = vm.addr(11);
        address b = vm.addr(12);
        _createAs(sender, a, NATIVE, 2 ether, 3); // drop, total 6
        _createAs(sender, b, NATIVE, 5 ether, 1); // single
        _createAs(sender, linkId, address(eurc), uint96(10 * EUR), 2);

        (uint64 links_, uint64 drops, uint64 claims, uint64 refunds) = escrow.counters();
        assertEq(links_, 3);
        assertEq(drops, 2);
        assertEq(claims, 0);
        assertEq(refunds, 0);
        (uint128 sent, uint128 claimedT, uint128 refundedT) = escrow.totals(NATIVE);
        assertEq(sent, 11 ether, "amounts only, no fees or stipends");
        assertEq(claimedT, 0);
        assertEq(refundedT, 0);
        (sent,,) = escrow.totals(address(eurc));
        assertEq(sent, 20 * EUR);

        address[] memory mine = escrow.linksOf(sender);
        assertEq(mine.length, 3);
        assertEq(mine[0], a);
        assertEq(mine[1], b);
        assertEq(mine[2], linkId);
        assertEq(escrow.linkCountOf(sender), 3);
        assertEq(escrow.linkCountOf(recipient), 0);

        vm.prank(a);
        escrow.claim(recipient);
        vm.prank(b);
        escrow.claim(recipient);
        vm.warp(block.timestamp + WEEK);
        vm.prank(sender);
        escrow.refund(a);

        (links_, drops, claims, refunds) = escrow.counters();
        assertEq(claims, 2);
        assertEq(refunds, 1);
        (sent, claimedT, refundedT) = escrow.totals(NATIVE);
        assertEq(claimedT, 7 ether);
        assertEq(refundedT, 4 ether, "two unclaimed slots of the drop");
        assertEq(sent - claimedT - refundedT, 0, "nothing left in escrow for USDC");
    }

    // ------------------------------------------------------------ invariants

    function testFuzz_escrowBalanceEqualsUnclaimedAmounts(
        uint96[6] memory amounts,
        uint8[6] memory slotsIn,
        uint16 mask
    ) public {
        uint256 pending;
        for (uint256 i = 0; i < amounts.length; i++) {
            uint96 each = uint96(bound(amounts[i], 1, 10 ether));
            uint24 slots = uint24(bound(slotsIn[i], 1, 4));
            address id = vm.addr(1_000 + i);
            _createAs(sender, id, NATIVE, each, slots);
            uint256 claims = (mask >> (i * 2)) & 3; // 0..3 claims
            if (claims > slots) claims = slots;
            for (uint256 c = 0; c < claims; c++) {
                vm.prank(id);
                escrow.claim(vm.addr(5_000 + i * 10 + c));
            }
            pending += uint256(each) * (slots - claims);
        }
        assertEq(address(escrow).balance, pending);
    }
}
