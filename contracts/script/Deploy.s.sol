// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import {Script, console} from "forge-std/Script.sol";
import {KashLinkEscrow} from "../src/KashLinkEscrow.sol";

/**
 * Deploys KashLinkEscrow. Parameters come from the environment (see .env.example):
 *
 *   TREASURY  fee destination; may be the zero address only when FEE_BPS is 0
 *   FEE_BPS   fee rate in basis points (default 100 = 1%)
 *   FEE_MIN   fee floor in native 18-decimal units (default 0.10 USDC)
 *
 * The broadcasting account becomes the owner unless OWNER is set. Read after `startBroadcast`, because
 * `msg.sender` in a script is Foundry's default sender, not the `--account` signer.
 */
contract Deploy is Script {
    function run() external returns (KashLinkEscrow escrow) {
        address treasury = vm.envOr("TREASURY", address(0));
        uint16 feeBps = uint16(vm.envOr("FEE_BPS", uint256(100)));
        uint96 feeMin = uint96(vm.envOr("FEE_MIN", uint256(0.1 ether)));

        vm.startBroadcast();
        (, address deployer,) = vm.readCallers();
        address owner = vm.envOr("OWNER", deployer);
        escrow = new KashLinkEscrow(owner, treasury, feeBps, feeMin);
        vm.stopBroadcast();

        console.log("KashLinkEscrow:", address(escrow));
        console.log("owner:         ", owner);
        console.log("treasury:      ", treasury);
        console.log("feeBps / feeMin:", feeBps, feeMin);
    }
}
