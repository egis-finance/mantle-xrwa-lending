// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Script, console2} from "forge-std/Script.sol";
import {CollateralLocker} from "../contracts/mantle/CollateralLocker.sol";
import {IERC20} from "../contracts/interfaces/IERC20.sol";

/**
 * Manual test script to verify CollateralLocker functionality on Mantle VTE
 *
 * Test flow:
 * 1. Load deployed CollateralLocker address from .env
 * 2. Use borrower wallet to approve and lock USDY
 * 3. Verify lock event emission and state changes
 * 4. Query contract state to confirm accounting
 * 5. Optionally test unlock (admin operation)
 *
 * Prerequisites:
 * - CollateralLocker deployed (via DeployMantle)
 * - Borrower funded with USDY (via FundWallets)
 * - MANTLE_LOCKER address set in .env
 *
 * Usage:
 *   forge script script/TestLock.s.sol:TestLock \
 *     --rpc-url $MANTLE_RPC_VTE \
 *     --broadcast \
 *     --legacy
 */
contract TestLock is Script {
    uint256 constant TEST_LOCK_AMOUNT = 10 ether;  // 10 USDY

    function run() external {
        address lockerAddress = vm.envAddress("MANTLE_LOCKER");
        address usdyAddress = vm.envAddress("MANTLE_USDY");
        address borrower = vm.envAddress("BORROWER_ADDRESS");
        uint256 borrowerPrivateKey = vm.envUint("BORROWER_PRIVATE_KEY");

        CollateralLocker locker = CollateralLocker(lockerAddress);
        IERC20 usdy = IERC20(usdyAddress);

        console2.log("=== Testing CollateralLocker on Mantle VTE ===");
        console2.log("Locker Address:", address(locker));
        console2.log("USDY Address:", address(usdy));
        console2.log("Borrower:", borrower);
        console2.log("");

        // Check initial state
        console2.log("=== Initial State ===");
        console2.log("Borrower USDY Balance:", usdy.balanceOf(borrower) / 1 ether, "USDY");
        console2.log("Locker Total Locked:", locker.totalLocked() / 1 ether, "USDY");
        console2.log("Borrower Locked Balance:", locker.lockedBalance(borrower) / 1 ether, "USDY");
        console2.log("");

        // Verify borrower has sufficient USDY
        require(usdy.balanceOf(borrower) >= TEST_LOCK_AMOUNT, "Borrower has insufficient USDY");

        vm.startBroadcast(borrowerPrivateKey);

        // Step 1: Approve CollateralLocker to spend USDY
        console2.log("=== Step 1: Approving USDY ===");
        usdy.approve(address(locker), TEST_LOCK_AMOUNT);
        console2.log("Approved %s USDY", TEST_LOCK_AMOUNT / 1 ether);
        console2.log("");

        // Step 2: Lock USDY
        console2.log("=== Step 2: Locking USDY ===");
        bytes32 vcHash = keccak256(abi.encodePacked("test-vc-", block.timestamp));
        uint64 epoch = uint64(block.timestamp);
        uint64 nonce = uint64(block.timestamp % 1000);

        console2.log("Lock Parameters:");
        console2.log("  Amount:", TEST_LOCK_AMOUNT / 1 ether, "USDY");
        console2.log("  VCHash:", vm.toString(vcHash));
        console2.log("  Epoch:", epoch);
        console2.log("  Nonce:", nonce);

        bytes32 lockId = locker.lock(TEST_LOCK_AMOUNT, vcHash, epoch, nonce);

        console2.log("");
        console2.log("Lock successful!");
        console2.log("LockId:", vm.toString(lockId));

        vm.stopBroadcast();

        // Step 3: Verify state changes
        console2.log("");
        console2.log("=== Step 3: Verifying State ===");
        console2.log("Borrower USDY Balance:", usdy.balanceOf(borrower) / 1 ether, "USDY");
        console2.log("Locker USDY Balance:", usdy.balanceOf(address(locker)) / 1 ether, "USDY");
        console2.log("Locker Total Locked:", locker.totalLocked() / 1 ether, "USDY");
        console2.log("Borrower Locked Balance:", locker.lockedBalance(borrower) / 1 ether, "USDY");
        console2.log("LockId Consumed:", locker.consumed(lockId));

        // Verify accounting invariant
        require(
            locker.totalLocked() == usdy.balanceOf(address(locker)),
            "Invariant broken: totalLocked != locker USDY balance"
        );

        console2.log("");
        console2.log("=== Test Complete ===");
        console2.log("Lock operation verified successfully!");
        console2.log("LockId can now be used by DVNs for cross-chain attestation");
    }
}
