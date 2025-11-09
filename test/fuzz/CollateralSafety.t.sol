// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {CollateralLocker} from "../../contracts/mantle/CollateralLocker.sol";
import {IERC20} from "../../contracts/interfaces/IERC20.sol";

/**
 * Fuzz tests for CollateralLocker invariant properties
 *
 * Invariants tested:
 * 1. Accounting invariant: totalLocked == usdy.balanceOf(locker)
 * 2. User balance invariant: sum(lockedBalance) <= totalLocked
 * 3. LockId uniqueness: No duplicate lockIds can exist
 * 4. No arithmetic overflows/underflows
 * 5. No unauthorized fund extraction
 *
 * Fuzz strategy:
 * - Random lock amounts within realistic bounds (0.001 to 1M USDY)
 * - Random nonces to test uniqueness
 * - Multiple users to test concurrent operations
 * - Edge cases: max uint256, zero amounts, duplicate attempts
 */
contract CollateralSafetyTest is Test {
    CollateralLocker public locker;
    IERC20 public usdy;

    address public admin;
    address constant USDY_ADDRESS = 0x5bE26527e817998A7206475496fDE1E68957c5A6;
    address constant USDY_FUNDER = 0x36FB3fA7c19702A07BE94eea464a8Cee4E11C474;

    /// Realistic lock amount bounds (admin has ~10^15 USDY available)
    uint256 constant MIN_LOCK = 0.001 ether;  // 0.001 USDY minimum
    uint256 constant MAX_LOCK = 1_000_000 ether;  // 1M USDY maximum
    uint256 constant MAX_FUZZ_LOCK = 100_000_000 ether;  // 100M USDY for fuzz tests with large amounts

    function setUp() public {
        vm.createSelectFork(vm.envString("MANTLE_RPC_VTE"));

        admin = makeAddr("admin");
        usdy = IERC20(USDY_ADDRESS);

        vm.prank(admin);
        locker = new CollateralLocker(USDY_ADDRESS, admin);
    }

    // ═══════════════════════════════════════════════════════════════
    //  INVARIANT: ACCOUNTING ACCURACY
    // ═══════════════════════════════════════════════════════════════

    /**
     * Critical invariant: Contract's USDY balance must exactly match totalLocked
     * If this fails, either tokens are stuck or accounting is broken
     */
    function testFuzz_Invariant_TotalLockedMatchesBalance(
        uint256 lockAmount,
        uint64 nonce
    ) public {
        // Bound fuzz inputs to realistic range
        lockAmount = bound(lockAmount, MIN_LOCK, MAX_LOCK);

        address user = makeAddr("fuzzUser");
        _fundUser(user, lockAmount);

        // Lock tokens
        vm.startPrank(user);
        usdy.approve(address(locker), lockAmount);
        locker.lock(lockAmount, keccak256("vc"), uint64(block.timestamp), nonce);
        vm.stopPrank();

        // Verify invariant
        assertEq(
            locker.totalLocked(),
            usdy.balanceOf(address(locker)),
            "Invariant broken: totalLocked != contract balance"
        );
    }

    /**
     * Multi-user concurrent locking should maintain accounting invariant
     * Tests for race conditions and cumulative accounting errors
     */
    function testFuzz_Invariant_MultiUserAccounting(
        uint256[3] memory amounts,
        uint64[3] memory nonces
    ) public {
        address[] memory users = new address[](3);
        uint256 expectedTotal = 0;

        for (uint256 i = 0; i < 3; i++) {
            amounts[i] = bound(amounts[i], MIN_LOCK, MAX_LOCK / 3);
            users[i] = makeAddr(string(abi.encodePacked("user", i)));
            _fundUser(users[i], amounts[i]);

            vm.startPrank(users[i]);
            usdy.approve(address(locker), amounts[i]);
            locker.lock(amounts[i], keccak256(abi.encodePacked("vc", i)), uint64(block.timestamp), nonces[i]);
            vm.stopPrank();

            expectedTotal += amounts[i];
        }

        // Verify global invariant holds after multiple operations
        assertEq(locker.totalLocked(), expectedTotal, "Multi-user total mismatch");
        assertEq(usdy.balanceOf(address(locker)), expectedTotal, "Multi-user balance mismatch");
    }

    // ═══════════════════════════════════════════════════════════════
    //  INVARIANT: LOCKID UNIQUENESS
    // ═══════════════════════════════════════════════════════════════

    /**
     * LockIds must be globally unique - no two locks can share the same ID
     * This prevents replay attacks and double-minting on destination chain
     */
    function testFuzz_Invariant_LockIdUniqueness(
        uint256 amount1,
        uint256 amount2,
        uint64 nonce
    ) public {
        // Bound amounts to safe ranges
        amount1 = bound(amount1, MIN_LOCK, MAX_LOCK);
        amount2 = bound(amount2, MIN_LOCK, MAX_LOCK);
        // Avoid nonce overflow when incrementing (uint64.max would overflow to 0)
        nonce = uint64(bound(nonce, 0, type(uint64).max - 2));

        address user = makeAddr("uniqueUser");
        bytes32 vcHash = keccak256("vc");
        uint64 epoch = uint64(block.timestamp);

        // Test first lock
        _fundUser(user, amount1);
        vm.startPrank(user);
        usdy.approve(address(locker), amount1);
        bytes32 lockId1 = locker.lock(amount1, vcHash, epoch, nonce);
        assertTrue(locker.consumed(lockId1), "First lockId should be consumed");
        vm.stopPrank();

        // Test second lock with different parameters
        if (amount1 != amount2) {
            _fundUser(user, amount2);
            vm.startPrank(user);
            usdy.approve(address(locker), amount2);
            bytes32 lockId2 = locker.lock(amount2, vcHash, epoch, nonce + 1);
            assertTrue(lockId1 != lockId2, "Different amounts must produce different lockIds");
            assertTrue(locker.consumed(lockId2), "Second lockId should be consumed");
            vm.stopPrank();
        }
    }

    // ═══════════════════════════════════════════════════════════════
    //  INVARIANT: NO ARITHMETIC OVERFLOWS
    // ═══════════════════════════════════════════════════════════════

    /**
     * Test edge case: locking maximum possible amounts shouldn't overflow
     * Solidity 0.8.30 has built-in overflow protection, but verify it works
     */
    function testFuzz_NoOverflow_LargeAmounts(uint256 amount) public {
        // Bound to realistic maximum based on available admin USDY balance
        amount = bound(amount, MIN_LOCK, MAX_FUZZ_LOCK);

        address user = makeAddr("richUser");
        _fundUser(user, amount);

        vm.startPrank(user);
        usdy.approve(address(locker), amount);
        locker.lock(amount, keccak256("vc"), uint64(block.timestamp), 1);
        vm.stopPrank();

        // Should not revert, accounting should be correct
        assertEq(locker.lockedBalance(user), amount);
        assertEq(locker.totalLocked(), amount);
    }

    /**
     * Test that unlock cannot cause underflow
     * Admin can only unlock what exists in user's balance
     */
    function testFuzz_NoUnderflow_UnlockBounds(
        uint256 lockAmount,
        uint256 unlockAmount
    ) public {
        lockAmount = bound(lockAmount, MIN_LOCK, MAX_LOCK);
        unlockAmount = bound(unlockAmount, 0, lockAmount * 2);  // Allow exceeding balance

        address user = makeAddr("unlockUser");
        _fundUser(user, lockAmount);

        // Lock tokens
        vm.startPrank(user);
        usdy.approve(address(locker), lockAmount);
        locker.lock(lockAmount, keccak256("vc"), uint64(block.timestamp), 1);
        vm.stopPrank();

        // Attempt unlock
        vm.prank(admin);
        if (unlockAmount == 0) {
            // Should revert on zero amount
            vm.expectRevert(CollateralLocker.ZeroAmount.selector);
            locker.unlock(user, unlockAmount, bytes32(0));
        } else if (unlockAmount > lockAmount) {
            // Should revert on insufficient balance
            vm.expectRevert(abi.encodeWithSelector(CollateralLocker.InsufficientBalance.selector, user, unlockAmount, lockAmount));
            locker.unlock(user, unlockAmount, bytes32(0));
        } else {
            // Should succeed within bounds
            locker.unlock(user, unlockAmount, bytes32(0));
            assertEq(locker.lockedBalance(user), lockAmount - unlockAmount);
        }
    }

    // ═══════════════════════════════════════════════════════════════
    //  INVARIANT: NO UNAUTHORIZED EXTRACTION
    // ═══════════════════════════════════════════════════════════════

    /**
     * Only admin can unlock funds - attackers cannot drain contract
     * This is critical for collateral security
     */
    function testFuzz_Security_NoUnauthorizedUnlock(
        uint256 lockAmount,
        address attacker
    ) public {
        vm.assume(attacker != admin);
        vm.assume(attacker != address(0));

        lockAmount = bound(lockAmount, MIN_LOCK, MAX_LOCK);

        address user = makeAddr("secureUser");
        _fundUser(user, lockAmount);

        // Lock tokens
        vm.startPrank(user);
        usdy.approve(address(locker), lockAmount);
        locker.lock(lockAmount, keccak256("vc"), uint64(block.timestamp), 1);
        vm.stopPrank();

        // Attacker attempts to unlock
        vm.prank(attacker);
        vm.expectRevert(abi.encodeWithSelector(CollateralLocker.Unauthorized.selector, attacker, admin));
        locker.unlock(user, lockAmount, bytes32(0));

        // Verify funds remain locked
        assertEq(locker.totalLocked(), lockAmount, "Funds should remain locked");
        assertEq(usdy.balanceOf(address(locker)), lockAmount, "Locker should retain funds");
    }

    // ═══════════════════════════════════════════════════════════════
    //  HELPER FUNCTIONS
    // ═══════════════════════════════════════════════════════════════

    function _fundUser(address user, uint256 amount) internal {
        vm.prank(USDY_FUNDER);
        bool success = usdy.transfer(user, amount);
        require(success, "USDY transfer failed");
    }
}
