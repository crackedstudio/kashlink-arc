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

contract KashLinkEscrowTest is Test {
    KashLinkEscrow internal escrow;

    address internal owner = makeAddr("owner");
    address internal treasury = makeAddr("treasury");
    address internal sender = makeAddr("sender");
    address internal recipient = makeAddr("recipient");

    uint256 internal linkKey = 0xA11CE;
    address internal linkId;

    uint16 internal constant FEE_BPS = 100; // 1%
    uint96 internal constant FEE_MIN = 0.1 ether; // 0.10 USDC
    uint96 internal constant STIPEND = 0.01 ether;
    uint64 internal constant WEEK = 7 days;

    function setUp() public {
        escrow = new KashLinkEscrow(owner, treasury, FEE_BPS, FEE_MIN);
        linkId = vm.addr(linkKey);
        vm.deal(sender, 1_000 ether);
        vm.warp(1_700_000_000);
    }

    function _create(uint96 amount) internal returns (uint64 expiry) {
        expiry = uint64(block.timestamp) + WEEK;
        uint256 total = escrow.totalFor(amount);
        vm.prank(sender);
        escrow.create{value: total}(linkId, amount, expiry);
    }

    function _status(address id) internal view returns (KashLinkEscrow.Status s) {
        (,,, s) = escrow.links(id);
    }

    // ------------------------------------------------------------ fee maths

    function test_feeFor_percentAboveFloor() public view {
        assertEq(escrow.feeFor(100 ether), 1 ether);
    }

    function test_feeFor_floorAppliesToSmallAmounts() public view {
        assertEq(escrow.feeFor(1 ether), FEE_MIN);
        assertEq(escrow.feeFor(10 ether), FEE_MIN); // exactly the floor
        assertEq(escrow.feeFor(10 ether + 1), FEE_MIN); // 1% of this rounds below the floor
    }

    function test_feeFor_zeroWhenDisabled() public {
        vm.prank(owner);
        escrow.setFees(0, FEE_MIN, address(0));
        assertEq(escrow.feeFor(1 ether), 0);
        assertEq(escrow.totalFor(1 ether), 1 ether + STIPEND);
    }

    function testFuzz_totalFor_isAmountPlusFeePlusStipend(uint96 amount) public view {
        uint256 fee = escrow.feeFor(amount);
        assertGe(fee, amount == 0 ? 0 : FEE_MIN);
        assertEq(escrow.totalFor(amount), uint256(amount) + fee + STIPEND);
    }

    // ------------------------------------------------------------ create

    function test_create_storesLinkAndSplitsValue() public {
        uint96 amount = 50 ether;
        uint256 fee = escrow.feeFor(amount);

        vm.expectEmit(true, true, false, true);
        emit KashLinkEscrow.LinkCreated(linkId, sender, amount, uint64(block.timestamp) + WEEK);
        uint64 expiry = _create(amount);

        (address s, uint96 a, uint64 e, KashLinkEscrow.Status st) = escrow.links(linkId);
        assertEq(s, sender);
        assertEq(a, amount);
        assertEq(e, expiry);
        assertEq(uint8(st), uint8(KashLinkEscrow.Status.Pending));

        assertEq(address(escrow).balance, amount, "escrow holds exactly the amount");
        assertEq(linkId.balance, STIPEND, "stipend landed on the link key");
        assertEq(treasury.balance, fee, "fee paid up front");
    }

    function test_create_revertsOnWrongValue() public {
        uint96 amount = 5 ether;
        uint256 expected = escrow.totalFor(amount);
        vm.prank(sender);
        vm.expectRevert(abi.encodeWithSelector(KashLinkEscrow.WrongValue.selector, expected, expected - 1));
        escrow.create{value: expected - 1}(linkId, amount, uint64(block.timestamp) + WEEK);

        vm.prank(sender);
        vm.expectRevert(abi.encodeWithSelector(KashLinkEscrow.WrongValue.selector, expected, expected + 1));
        escrow.create{value: expected + 1}(linkId, amount, uint64(block.timestamp) + WEEK);
    }

    function test_create_revertsOnDuplicateLink() public {
        _create(1 ether);
        uint256 total = escrow.totalFor(1 ether);
        vm.prank(sender);
        vm.expectRevert(abi.encodeWithSelector(KashLinkEscrow.LinkExists.selector, linkId));
        escrow.create{value: total}(linkId, 1 ether, uint64(block.timestamp) + WEEK);
    }

    function test_create_revertsOnResolvedLinkReuse() public {
        _create(1 ether);
        vm.prank(linkId);
        escrow.claim(recipient);
        uint256 total = escrow.totalFor(1 ether);
        vm.prank(sender);
        vm.expectRevert(abi.encodeWithSelector(KashLinkEscrow.LinkExists.selector, linkId));
        escrow.create{value: total}(linkId, 1 ether, uint64(block.timestamp) + WEEK);
    }

    function test_create_revertsOnZeroAmount() public {
        uint256 total = escrow.totalFor(0);
        vm.prank(sender);
        vm.expectRevert(KashLinkEscrow.ZeroAmount.selector);
        escrow.create{value: total}(linkId, 0, uint64(block.timestamp) + WEEK);
    }

    function test_create_revertsOnZeroLinkId() public {
        uint256 total = escrow.totalFor(1 ether);
        vm.prank(sender);
        vm.expectRevert(KashLinkEscrow.ZeroAddress.selector);
        escrow.create{value: total}(address(0), 1 ether, uint64(block.timestamp) + WEEK);
    }

    function test_create_revertsOnPastExpiry() public {
        uint256 total = escrow.totalFor(1 ether);
        vm.prank(sender);
        vm.expectRevert(KashLinkEscrow.ExpiryInPast.selector);
        escrow.create{value: total}(linkId, 1 ether, uint64(block.timestamp));
    }

    function test_create_noFeeTransferWhenDisabled() public {
        vm.prank(owner);
        escrow.setFees(0, 0, address(0));
        _create(1 ether);
        assertEq(treasury.balance, 0);
        assertEq(address(escrow).balance, 1 ether);
    }

    // ------------------------------------------------------------ claim

    function test_claim_paysRecipient() public {
        uint96 amount = 20 ether;
        _create(amount);

        vm.expectEmit(true, true, false, true);
        emit KashLinkEscrow.LinkClaimed(linkId, recipient, amount);
        vm.prank(linkId);
        escrow.claim(recipient);

        assertEq(recipient.balance, amount);
        assertEq(address(escrow).balance, 0);
        assertEq(uint8(_status(linkId)), uint8(KashLinkEscrow.Status.Claimed));
    }

    function test_claim_stillWorksAfterExpiry() public {
        uint64 expiry = _create(1 ether);
        vm.warp(expiry + 30 days);
        vm.prank(linkId);
        escrow.claim(recipient);
        assertEq(recipient.balance, 1 ether);
    }

    function test_claim_revertsForNonLinkKey() public {
        _create(1 ether);
        vm.prank(recipient);
        vm.expectRevert(abi.encodeWithSelector(KashLinkEscrow.NotPending.selector, recipient));
        escrow.claim(recipient);
    }

    function test_claim_revertsWhenAlreadyClaimed() public {
        _create(1 ether);
        vm.startPrank(linkId);
        escrow.claim(recipient);
        vm.expectRevert(abi.encodeWithSelector(KashLinkEscrow.NotPending.selector, linkId));
        escrow.claim(recipient);
        vm.stopPrank();
    }

    function test_claim_revertsAfterRefund() public {
        uint64 expiry = _create(1 ether);
        vm.warp(expiry);
        vm.prank(sender);
        escrow.refund(linkId);
        vm.prank(linkId);
        vm.expectRevert(abi.encodeWithSelector(KashLinkEscrow.NotPending.selector, linkId));
        escrow.claim(recipient);
    }

    function test_claim_revertsOnZeroRecipient() public {
        _create(1 ether);
        vm.prank(linkId);
        vm.expectRevert(KashLinkEscrow.ZeroAddress.selector);
        escrow.claim(address(0));
    }

    function test_claim_revertsWhenRecipientRejects() public {
        _create(1 ether);
        address rejecter = address(new Rejecter());
        vm.prank(linkId);
        vm.expectRevert(abi.encodeWithSelector(KashLinkEscrow.TransferFailed.selector, rejecter));
        escrow.claim(rejecter);
        assertEq(uint8(_status(linkId)), uint8(KashLinkEscrow.Status.Pending), "still claimable");
    }

    function test_claim_reentrancyIsBlocked() public {
        _create(1 ether);
        Reenterer attacker = new Reenterer(escrow);
        vm.prank(linkId);
        vm.expectRevert(abi.encodeWithSelector(KashLinkEscrow.TransferFailed.selector, address(attacker)));
        escrow.claim(address(attacker));
    }

    // ------------------------------------------------------------ refund

    function test_refund_afterExpiry() public {
        uint96 amount = 3 ether;
        uint64 expiry = _create(amount);
        uint256 before = sender.balance;

        vm.warp(expiry);
        vm.expectEmit(true, true, false, true);
        emit KashLinkEscrow.LinkRefunded(linkId, sender, amount);
        vm.prank(sender);
        escrow.refund(linkId);

        assertEq(sender.balance, before + amount, "amount comes back; fee and stipend do not");
        assertEq(uint8(_status(linkId)), uint8(KashLinkEscrow.Status.Refunded));
    }

    function test_refund_revertsBeforeExpiry() public {
        uint64 expiry = _create(1 ether);
        vm.warp(expiry - 1);
        vm.prank(sender);
        vm.expectRevert(abi.encodeWithSelector(KashLinkEscrow.NotExpired.selector, expiry));
        escrow.refund(linkId);
    }

    function test_refund_revertsForNonSender() public {
        uint64 expiry = _create(1 ether);
        vm.warp(expiry);
        vm.prank(recipient);
        vm.expectRevert(KashLinkEscrow.NotSender.selector);
        escrow.refund(linkId);
    }

    function test_refund_revertsWhenClaimed() public {
        uint64 expiry = _create(1 ether);
        vm.prank(linkId);
        escrow.claim(recipient);
        vm.warp(expiry);
        vm.prank(sender);
        vm.expectRevert(abi.encodeWithSelector(KashLinkEscrow.NotPending.selector, linkId));
        escrow.refund(linkId);
    }

    function test_refund_revertsForUnknownLink() public {
        vm.prank(sender);
        vm.expectRevert(abi.encodeWithSelector(KashLinkEscrow.NotPending.selector, linkId));
        escrow.refund(linkId);
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

    function test_setFees_capped() public {
        vm.prank(owner);
        vm.expectRevert(KashLinkEscrow.FeeTooHigh.selector);
        escrow.setFees(501, 0, treasury);
    }

    function test_setFees_requiresTreasuryWhenCharging() public {
        vm.prank(owner);
        vm.expectRevert(KashLinkEscrow.TreasuryRequired.selector);
        escrow.setFees(1, 0, address(0));
    }

    function test_setFees_onlyOwner() public {
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
        _create(10 ether);
        // The only value-moving paths are claim (link key) and refund (sender). Owner holds neither role.
        vm.startPrank(owner);
        vm.expectRevert(abi.encodeWithSelector(KashLinkEscrow.NotPending.selector, owner));
        escrow.claim(owner);
        vm.expectRevert(KashLinkEscrow.NotSender.selector);
        escrow.refund(linkId);
        vm.stopPrank();
        assertEq(address(escrow).balance, 10 ether);
    }

    // ------------------------------------------------------------ invariants

    function testFuzz_escrowBalanceEqualsPendingAmounts(uint96[8] memory amounts, uint8 mask) public {
        uint256 pending;
        for (uint256 i = 0; i < amounts.length; i++) {
            uint96 amount = uint96(bound(amounts[i], 1, 100 ether));
            address id = vm.addr(1_000 + i);
            uint256 total = escrow.totalFor(amount);
            vm.prank(sender);
            escrow.create{value: total}(id, amount, uint64(block.timestamp) + WEEK);
            if ((mask >> i) & 1 == 1) {
                vm.prank(id);
                escrow.claim(recipient);
            } else {
                pending += amount;
            }
        }
        assertEq(address(escrow).balance, pending);
    }
}
