// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {IERC20} from "../interfaces/IERC20.sol";
import {SafeTransferLib} from "@solmate/utils/SafeTransferLib.sol";
import {ERC20} from "@solmate/tokens/ERC20.sol";

/**
 * CollateralLocker - Phase 1: Asset Locking on Mantle
 *
 * Locks USDY tokens and emits cryptographic commitments for cross-chain authentication.
 * Implements Layer 1 (Asset Identification) of the xRWA framework.
 *
 * Architecture decisions:
 * - Non-custodial escrow: Users retain ownership rights; contract holds tokens temporarily
 * - Replay protection: lockId uniqueness prevents double-minting on destination chain
 * - Verifiable Credential integration: vcHash enables future expansion to full DID/VC framework
 * - Emergency controls: Pause mechanism protects against exploitation during security incidents
 *
 * Security model:
 * - Admin can pause/unpause but cannot steal funds
 * - Unlock requires cross-chain burn proof (Phase 3 integration)
 * - Each lock generates unique commitment hash preventing replay attacks
 */
contract CollateralLocker {
    // ═══════════════════════════════════════════════════════════════
    //  STORAGE
    // ═══════════════════════════════════════════════════════════════

    IERC20 public immutable USDY;
    address public admin;
    bool public paused;

    /// Prevents replay attacks by tracking consumed lock identifiers
    mapping(bytes32 => bool) public consumed;

    /// Per-user accounting enables efficient balance queries and reconciliation
    mapping(address => uint256) public lockedBalance;

    /// Global invariant: totalLocked == USDY.balanceOf(address(this))
    uint256 public totalLocked;

    // ═══════════════════════════════════════════════════════════════
    //  EVENTS
    // ═══════════════════════════════════════════════════════════════

    /**
     * Locked event - Core commitment for cross-chain authentication
     *
     * Off-chain relayers monitor this event to trigger DVN attestations.
     * The event data forms the basis of the EIP-712 signature payload.
     *
     * @param borrower User who locked collateral and will receive xcUSDY on Ethereum
     * @param amount USDY tokens locked (18 decimals)
     * @param lockId Unique identifier preventing duplicate attestations
     * @param vcHash Verifiable Credential commitment (future: full DID/VC structure)
     * @param epoch Block timestamp for temporal ordering
     * @param nonce User-provided replay protection nonce
     */
    event Locked(
        address indexed borrower,
        uint256 amount,
        bytes32 indexed lockId,
        bytes32 vcHash,
        uint64 epoch,
        uint64 nonce
    );

    event Unlocked(
        address indexed recipient,
        uint256 amount,
        bytes32 indexed lockId
    );

    event AdminUpdated(address indexed oldAdmin, address indexed newAdmin);
    event Paused();
    event Unpaused();

    // ═══════════════════════════════════════════════════════════════
    //  ERRORS
    // ═══════════════════════════════════════════════════════════════

    error Unauthorized(address caller, address expectedAdmin);
    error ContractPaused();
    error DuplicateLockId(bytes32 lockId);
    error TransferFailed(address token, address from, address to, uint256 amount);
    error ZeroAmount();
    error ZeroAddress();
    error InsufficientBalance(address account, uint256 requested, uint256 available);

    // ═══════════════════════════════════════════════════════════════
    //  MODIFIERS
    // ═══════════════════════════════════════════════════════════════

    modifier onlyAdmin() {
        require(msg.sender == admin, Unauthorized(msg.sender, admin));
        _;
    }

    modifier whenNotPaused() {
        require(!paused, ContractPaused());
        _;
    }

    // ═══════════════════════════════════════════════════════════════
    //  CONSTRUCTOR
    // ═══════════════════════════════════════════════════════════════

    constructor(address _usdy, address _admin) {
        require(_usdy != address(0) && _admin != address(0), ZeroAddress());
        USDY = IERC20(_usdy);
        admin = _admin;
    }

    // ═══════════════════════════════════════════════════════════════
    //  EXTERNAL FUNCTIONS
    // ═══════════════════════════════════════════════════════════════

    /**
     * Lock USDY as collateral for cross-chain borrowing
     *
     * Flow:
     * 1. User approves this contract to spend USDY
     * 2. User calls lock() with commitment parameters
     * 3. Contract generates unique lockId from commitment data
     * 4. Contract transfers USDY from user
     * 5. Event emission triggers off-chain DVN attestation flow
     *
     * @param amount USDY to lock (must be > 0)
     * @param vcHash Hash of Verifiable Credential data (xRWA Layer 1)
     * @param epoch Current timestamp for temporal ordering
     * @param nonce User-controlled replay protection value
     * @return lockId Unique commitment identifier
     */
    function lock(
        uint256 amount,
        bytes32 vcHash,
        uint64 epoch,
        uint64 nonce
    ) external whenNotPaused returns (bytes32 lockId) {
        require(amount != 0, ZeroAmount());

        // Generate unique lock identifier from commitment parameters
        // Includes chain ID to prevent cross-chain replay attacks
        lockId = keccak256(abi.encode(
            msg.sender,
            amount,
            vcHash,
            epoch,
            nonce,
            block.chainid
        ));

        // Prevent duplicate lock attempts (protects against accidental double-locking)
        require(!consumed[lockId], DuplicateLockId(lockId));
        consumed[lockId] = true;

        // Update accounting before external call (CEI pattern)
        lockedBalance[msg.sender] += amount;
        totalLocked += amount;

        // Transfer USDY from user (requires prior approval)
        // Note: USDY may have transfer restrictions (allowlist/blocklist)
        SafeTransferLib.safeTransferFrom(ERC20(address(USDY)), msg.sender, address(this), amount);

        // Emit event for DVN relayers to monitor
        emit Locked(msg.sender, amount, lockId, vcHash, epoch, nonce);
    }

    /**
     * Unlock USDY after cross-chain burn proof verification
     *
     * Phase 1: Admin-controlled (requires manual verification)
     * Phase 3: Automated via cross-chain burn proof from Ethereum
     *
     * Security: Only admin can unlock, preventing unauthorized withdrawals.
     * Future: Replace admin check with cryptographic burn proof verification.
     *
     * @param recipient Address receiving unlocked USDY
     * @param amount USDY to unlock
     * @param lockId Original lock identifier (for event tracking)
     */
    function unlock(
        address recipient,
        uint256 amount,
        bytes32 lockId
    ) external onlyAdmin whenNotPaused {
        require(recipient != address(0), ZeroAddress());
        require(amount != 0, ZeroAmount());
        require(lockedBalance[recipient] >= amount, InsufficientBalance(recipient, amount, lockedBalance[recipient]));

        // Update accounting before external call
        lockedBalance[recipient] -= amount;
        totalLocked -= amount;

        // Transfer USDY to recipient
        SafeTransferLib.safeTransfer(ERC20(address(USDY)), recipient, amount);

        emit Unlocked(recipient, amount, lockId);
    }

    // ═══════════════════════════════════════════════════════════════
    //  ADMIN FUNCTIONS
    // ═══════════════════════════════════════════════════════════════

    /// Transfer admin privileges (e.g., to multisig for production)
    function setAdmin(address newAdmin) external onlyAdmin {
        require(newAdmin != address(0), ZeroAddress());
        emit AdminUpdated(admin, newAdmin);
        admin = newAdmin;
    }

    /// Emergency pause during security incidents
    function pause() external onlyAdmin {
        paused = true;
        emit Paused();
    }

    /// Resume operations after incident resolution
    function unpause() external onlyAdmin {
        paused = false;
        emit Unpaused();
    }

    // ═══════════════════════════════════════════════════════════════
    //  VIEW FUNCTIONS
    // ═══════════════════════════════════════════════════════════════

    function getUserLockedBalance(address user) external view returns (uint256) {
        return lockedBalance[user];
    }

    function getTotalLocked() external view returns (uint256) {
        return totalLocked;
    }

    function isLockIdConsumed(bytes32 lockId) external view returns (bool) {
        return consumed[lockId];
    }
}
