// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Script, console2} from "forge-std/Script.sol";
import {CollateralLocker} from "../contracts/mantle/CollateralLocker.sol";
import {IERC20} from "../contracts/interfaces/IERC20.sol";

/**
 * Lock additional USDY on Mantle to mint more AcUSDY via attestation
 *
 * Prerequisites:
 * - CollateralLocker deployed (MANTLE_LOCKER in .env)
 * - Borrower funded with USDY (via FundWallets)
 * - Relayer running (or will pick up event on next start)
 *
 * Usage:
 *   # Option 1: Pass amount as argument (preferred)
 *   forge script script/LockMoreUSDY.s.sol --sig "run(uint256)" 50ether \
 *     --rpc-url $MANTLE_RPC_VTE --broadcast --legacy
 *
 *   # Option 2: Environment variable
 *   LOCK_AMOUNT=50 forge script script/LockMoreUSDY.s.sol \
 *     --rpc-url $MANTLE_RPC_VTE --broadcast --legacy
 */
contract LockMoreUSDY is Script {
    error InsufficientBalance(uint256 required, uint256 available);

    function run() external {
        // Fallback to env var if no argument provided
        uint256 amount = vm.envOr("LOCK_AMOUNT", uint256(10)) * 1 ether;
        _lock(amount);
    }

    function run(uint256 amount) external {
        _lock(amount);
    }

    function _lock(uint256 amount) internal {
        address lockerAddress = vm.envAddress("MANTLE_LOCKER");
        address usdyAddress = vm.envAddress("MANTLE_USDY");
        address borrower = vm.envAddress("BORROWER_ADDRESS");
        uint256 borrowerPrivateKey = vm.envUint("BORROWER_PRIVATE_KEY");

        CollateralLocker locker = CollateralLocker(lockerAddress);
        IERC20 usdy = IERC20(usdyAddress);

        // Log state before lock
        console2.log("=== Before Lock ===");
        uint256 usdyBalanceBefore = usdy.balanceOf(borrower);
        uint256 lockedBalanceBefore = locker.lockedBalance(borrower);
        uint256 totalLockedBefore = locker.totalLocked();

        console2.log("Borrower USDY Balance:", usdyBalanceBefore / 1 ether, "USDY");
        console2.log("Borrower Locked Balance:", lockedBalanceBefore / 1 ether, "USDY");
        console2.log("Total Locked in Contract:", totalLockedBefore / 1 ether, "USDY");
        console2.log("");

        // Verify sufficient balance
        if (usdy.balanceOf(borrower) < amount) {
            revert InsufficientBalance(amount, usdy.balanceOf(borrower));
        }

        vm.startBroadcast(borrowerPrivateKey);

        // Approve and lock
        usdy.approve(address(locker), amount);

        bytes32 vcHash = keccak256(abi.encodePacked("lock-more-", block.timestamp));
        uint64 validUntil = uint64(block.timestamp + 90 days);

        console2.log("=== Locking", amount / 1 ether, "USDY ===");
        bytes32 lockId = locker.lock(amount, validUntil, vcHash);
        console2.log("LockId:", vm.toString(lockId));

        vm.stopBroadcast();

        // Log state after lock
        console2.log("");
        console2.log("=== After Lock ===");
        console2.log("Borrower USDY Balance:", usdy.balanceOf(borrower) / 1 ether, "USDY");
        console2.log("Borrower Locked Balance:", locker.lockedBalance(borrower) / 1 ether, "USDY");
        console2.log("Total Locked in Contract:", locker.totalLocked() / 1 ether, "USDY");

        // Verify accounting invariant
        require(
            locker.totalLocked() == usdy.balanceOf(address(locker)),
            "Invariant broken: totalLocked != locker USDY balance"
        );

        console2.log("");
        console2.log("Lock complete. Relayer will process attestation.");
    }
}
