// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {CollateralLocker} from "../../contracts/mantle/CollateralLocker.sol";
import {IERC20} from "../../contracts/interfaces/IERC20.sol";

/**
 * Comprehensive unit tests for CollateralLocker
 *
 * Test strategy:
 * - Fork Mantle VTE to test with real USDY contract
 * - Test happy paths and edge cases for all functions
 * - Verify events, access control, and state changes
 * - Ensure reentrancy protection and proper accounting
 *
 * Coverage goals:
 * - Function coverage: 100%
 * - Branch coverage: >95%
 * - Line coverage: >95%
 */
contract CollateralLockerTest is Test {
    CollateralLocker public locker;
    IERC20 public usdy;

    address public admin;
    address public borrower;
    address public attacker;

    /// Real USDY address on Mantle
    address constant USDY_ADDRESS = 0x5bE26527e817998A7206475496fDE1E68957c5A6;

    /// Test amounts in USDY (18 decimals)
    uint256 constant LOCK_AMOUNT = 100 ether;
    uint256 constant SMALL_AMOUNT = 1 ether;

    /// Admin wallet has USDY on Mantle VTE for funding test accounts
    address constant USDY_FUNDER = 0x36FB3fA7c19702A07BE94eea464a8Cee4E11C474;

    function setUp() public {
        // Fork Mantle Virtual TestNet
        vm.createSelectFork(vm.envString("MANTLE_RPC_VTE"));

        // Setup test accounts
        admin = makeAddr("admin");
        borrower = makeAddr("borrower");
        attacker = makeAddr("attacker");

        // Initialize USDY interface
        usdy = IERC20(USDY_ADDRESS);

        // Deploy CollateralLocker
        vm.prank(admin);
        locker = new CollateralLocker(USDY_ADDRESS, admin);

        // Fund borrower with USDY from admin wallet
        vm.prank(USDY_FUNDER);
        bool success = usdy.transfer(borrower, LOCK_AMOUNT * 2);
        require(success, "USDY transfer failed");

        // Verify funding
        assertGt(usdy.balanceOf(borrower), 0, "Borrower should have USDY");
    }

    // ═══════════════════════════════════════════════════════════════
    //  CONSTRUCTOR TESTS
    // ═══════════════════════════════════════════════════════════════

    function test_Constructor_SetsCorrectState() public view {
        assertEq(address(locker.USDY()), USDY_ADDRESS, "USDY address mismatch");
        assertEq(locker.admin(), admin, "Admin address mismatch");
        assertEq(locker.paused(), false, "Should not be paused initially");
        assertEq(locker.totalLocked(), 0, "Total locked should be zero");
    }

    function test_Constructor_RevertsOnZeroUSDY() public {
        vm.expectRevert(CollateralLocker.ZeroAddress.selector);
        new CollateralLocker(address(0), admin);
    }

    function test_Constructor_RevertsOnZeroAdmin() public {
        vm.expectRevert(CollateralLocker.ZeroAddress.selector);
        new CollateralLocker(USDY_ADDRESS, address(0));
    }

    // ═══════════════════════════════════════════════════════════════
    //  LOCK FUNCTION TESTS
    // ═══════════════════════════════════════════════════════════════

    function test_Lock_Success() public {
        bytes32 vcHash = keccak256("test-vc");
        uint64 validUntil = uint64(block.timestamp + 1 hours);

        // Approve locker to spend USDY
        vm.prank(borrower);
        usdy.approve(address(locker), LOCK_AMOUNT);

        // Calculate expected lockId (nonce starts at 0 for first lock)
        bytes32 expectedLockId = keccak256(abi.encode(
            borrower,
            LOCK_AMOUNT,
            block.chainid,
            validUntil,
            vcHash,
            uint64(0)  // Auto-managed nonce
        ));

        // Expect Locked event
        vm.expectEmit(true, true, false, true);
        emit CollateralLocker.Locked(borrower, expectedLockId, LOCK_AMOUNT, block.chainid, validUntil, vcHash);

        // Lock USDY
        vm.prank(borrower);
        bytes32 lockId = locker.lock(LOCK_AMOUNT, validUntil, vcHash);

        // Verify lockId
        assertEq(lockId, expectedLockId, "LockId mismatch");

        // Verify state changes
        assertEq(locker.lockedBalance(borrower), LOCK_AMOUNT, "Locked balance mismatch");
        assertEq(locker.totalLocked(), LOCK_AMOUNT, "Total locked mismatch");
        assertTrue(locker.consumed(lockId), "LockId should be consumed");
        assertEq(usdy.balanceOf(address(locker)), LOCK_AMOUNT, "Locker balance mismatch");
        assertEq(locker.userNonce(borrower), 1, "User nonce should be incremented");
    }

    function test_Lock_RevertsOnZeroAmount() public {
        vm.prank(borrower);
        vm.expectRevert(CollateralLocker.ZeroAmount.selector);
        locker.lock(0, uint64(block.timestamp + 1 hours), keccak256("vc"));
    }

    function test_Lock_AutoIncrementsNonce() public {
        bytes32 vcHash = keccak256("test-vc");
        uint64 validUntil = uint64(block.timestamp + 1 hours);

        vm.startPrank(borrower);
        usdy.approve(address(locker), LOCK_AMOUNT * 2);

        // First lock uses nonce 0
        bytes32 lockId1 = locker.lock(LOCK_AMOUNT, validUntil, vcHash);
        assertEq(locker.userNonce(borrower), 1, "Nonce should be 1 after first lock");

        // Second lock with same parameters uses nonce 1 (different lockId)
        bytes32 lockId2 = locker.lock(LOCK_AMOUNT, validUntil, vcHash);
        assertEq(locker.userNonce(borrower), 2, "Nonce should be 2 after second lock");

        // LockIds should be different due to auto-incrementing nonce
        assertTrue(lockId1 != lockId2, "LockIds should be different");

        vm.stopPrank();
    }

    function test_Lock_RevertsWhenPaused() public {
        vm.prank(admin);
        locker.pause();

        vm.prank(borrower);
        vm.expectRevert(CollateralLocker.ContractPaused.selector);
        locker.lock(LOCK_AMOUNT, uint64(block.timestamp + 1 hours), keccak256("vc"));
    }

    function test_Lock_RevertsOnInsufficientAllowance() public {
        // Don't approve locker
        vm.prank(borrower);
        vm.expectRevert();  // ERC20 will revert
        locker.lock(LOCK_AMOUNT, uint64(block.timestamp + 1 hours), keccak256("vc"));
    }

    function test_Lock_MultipleLocks() public {
        vm.startPrank(borrower);
        usdy.approve(address(locker), LOCK_AMOUNT * 2);

        // First lock (nonce auto-increments from 0 to 1)
        locker.lock(SMALL_AMOUNT, uint64(block.timestamp + 1 hours), keccak256("vc1"));

        // Second lock (nonce auto-increments from 1 to 2)
        locker.lock(SMALL_AMOUNT, uint64(block.timestamp + 2 hours), keccak256("vc2"));

        vm.stopPrank();

        // Verify cumulative state
        assertEq(locker.lockedBalance(borrower), SMALL_AMOUNT * 2, "Total user balance mismatch");
        assertEq(locker.totalLocked(), SMALL_AMOUNT * 2, "Total locked mismatch");
        assertEq(locker.userNonce(borrower), 2, "User nonce should be 2");
    }

    // ═══════════════════════════════════════════════════════════════
    //  UNLOCK FUNCTION TESTS
    // ═══════════════════════════════════════════════════════════════

    function test_Unlock_Success() public {
        // Setup: Lock USDY first
        bytes32 lockId = _lockUsdy(borrower, LOCK_AMOUNT);

        uint256 borrowerBalanceBefore = usdy.balanceOf(borrower);

        // Unlock
        vm.expectEmit(true, false, false, true);
        emit CollateralLocker.Unlocked(borrower, LOCK_AMOUNT, lockId);

        vm.prank(admin);
        locker.unlock(borrower, LOCK_AMOUNT, lockId);

        // Verify state
        assertEq(locker.lockedBalance(borrower), 0, "Locked balance should be zero");
        assertEq(locker.totalLocked(), 0, "Total locked should be zero");
        assertEq(usdy.balanceOf(borrower), borrowerBalanceBefore + LOCK_AMOUNT, "Borrower balance mismatch");
    }

    function test_Unlock_RevertsOnUnauthorized() public {
        bytes32 lockId = _lockUsdy(borrower, LOCK_AMOUNT);

        vm.prank(attacker);
        vm.expectRevert(abi.encodeWithSelector(CollateralLocker.Unauthorized.selector, attacker, admin));
        locker.unlock(borrower, LOCK_AMOUNT, lockId);
    }

    function test_Unlock_RevertsOnZeroAddress() public {
        vm.prank(admin);
        vm.expectRevert(CollateralLocker.ZeroAddress.selector);
        locker.unlock(address(0), LOCK_AMOUNT, bytes32(0));
    }

    function test_Unlock_RevertsOnZeroAmount() public {
        vm.prank(admin);
        vm.expectRevert(CollateralLocker.ZeroAmount.selector);
        locker.unlock(borrower, 0, bytes32(0));
    }

    function test_Unlock_RevertsOnInsufficientBalance() public {
        _lockUsdy(borrower, SMALL_AMOUNT);

        vm.prank(admin);
        vm.expectRevert(abi.encodeWithSelector(CollateralLocker.InsufficientBalance.selector, borrower, LOCK_AMOUNT, SMALL_AMOUNT));
        locker.unlock(borrower, LOCK_AMOUNT, bytes32(0));
    }

    function test_Unlock_RevertsWhenPaused() public {
        _lockUsdy(borrower, LOCK_AMOUNT);

        vm.prank(admin);
        locker.pause();

        vm.prank(admin);
        vm.expectRevert(CollateralLocker.ContractPaused.selector);
        locker.unlock(borrower, LOCK_AMOUNT, bytes32(0));
    }

    function test_Unlock_PartialUnlock() public {
        _lockUsdy(borrower, LOCK_AMOUNT);

        vm.prank(admin);
        locker.unlock(borrower, LOCK_AMOUNT / 2, bytes32(0));

        assertEq(locker.lockedBalance(borrower), LOCK_AMOUNT / 2, "Partial unlock balance mismatch");
        assertEq(locker.totalLocked(), LOCK_AMOUNT / 2, "Partial unlock total mismatch");
    }

    // ═══════════════════════════════════════════════════════════════
    //  ADMIN FUNCTION TESTS
    // ═══════════════════════════════════════════════════════════════

    function test_SetAdmin_Success() public {
        address newAdmin = makeAddr("newAdmin");

        vm.expectEmit(true, true, false, false);
        emit CollateralLocker.AdminUpdated(admin, newAdmin);

        vm.prank(admin);
        locker.setAdmin(newAdmin);

        assertEq(locker.admin(), newAdmin, "Admin not updated");
    }

    function test_SetAdmin_RevertsOnUnauthorized() public {
        vm.prank(attacker);
        vm.expectRevert(abi.encodeWithSelector(CollateralLocker.Unauthorized.selector, attacker, admin));
        locker.setAdmin(attacker);
    }

    function test_SetAdmin_RevertsOnZeroAddress() public {
        vm.prank(admin);
        vm.expectRevert(CollateralLocker.ZeroAddress.selector);
        locker.setAdmin(address(0));
    }

    function test_Pause_Success() public {
        vm.expectEmit(false, false, false, false);
        emit CollateralLocker.Paused();

        vm.prank(admin);
        locker.pause();

        assertTrue(locker.paused(), "Should be paused");
    }

    function test_Pause_RevertsOnUnauthorized() public {
        vm.prank(attacker);
        vm.expectRevert(abi.encodeWithSelector(CollateralLocker.Unauthorized.selector, attacker, admin));
        locker.pause();
    }

    function test_Unpause_Success() public {
        vm.startPrank(admin);
        locker.pause();

        vm.expectEmit(false, false, false, false);
        emit CollateralLocker.Unpaused();

        locker.unpause();
        vm.stopPrank();

        assertFalse(locker.paused(), "Should not be paused");
    }

    function test_Unpause_RevertsOnUnauthorized() public {
        vm.prank(admin);
        locker.pause();

        vm.prank(attacker);
        vm.expectRevert(abi.encodeWithSelector(CollateralLocker.Unauthorized.selector, attacker, admin));
        locker.unpause();
    }

    // ═══════════════════════════════════════════════════════════════
    //  VIEW FUNCTION TESTS
    // ═══════════════════════════════════════════════════════════════

    function test_GetUserLockedBalance() public {
        _lockUsdy(borrower, LOCK_AMOUNT);
        assertEq(locker.getUserLockedBalance(borrower), LOCK_AMOUNT);
    }

    function test_GetTotalLocked() public {
        _lockUsdy(borrower, LOCK_AMOUNT);
        assertEq(locker.getTotalLocked(), LOCK_AMOUNT);
    }

    function test_IsLockIdConsumed() public {
        bytes32 lockId = _lockUsdy(borrower, LOCK_AMOUNT);
        assertTrue(locker.isLockIdConsumed(lockId));
        assertFalse(locker.isLockIdConsumed(bytes32(uint256(123))));
    }

    // ═══════════════════════════════════════════════════════════════
    //  HELPER FUNCTIONS
    // ═══════════════════════════════════════════════════════════════

    function _lockUsdy(address user, uint256 amount) internal returns (bytes32) {
        vm.startPrank(user);
        usdy.approve(address(locker), amount);
        bytes32 lockId = locker.lock(amount, uint64(block.timestamp + 1 hours), keccak256("vc"));
        vm.stopPrank();
        return lockId;
    }
}
