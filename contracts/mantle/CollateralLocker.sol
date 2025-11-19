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

    /// Auto-incrementing nonce per user for replay protection
    mapping(address => uint64) public userNonce;

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
     * @param borrower User who locked collateral and will receive AcUSDY on Ethereum
     * @param lockId Unique identifier preventing duplicate attestations
     * @param amount USDY tokens locked (18 decimals)
     * @param sourceChainId Chain ID where lock occurred (for cross-chain clarity)
     * @param validUntil Expiration timestamp for time-bounded attestations
     * @param vcHash Verifiable Credential commitment (optional: 0x0 if unused)
     */
    event Locked(
        address indexed borrower,
        bytes32 indexed lockId,
        uint256 amount,
        uint256 sourceChainId,
        uint64 validUntil,
        bytes32 vcHash
    );

    event Unlocked(address indexed recipient, uint256 amount, bytes32 indexed lockId);

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
     * 2. User calls lock() with amount, expiration, and optional VC hash
     * 3. Contract auto-increments user nonce and generates unique lockId
     * 4. Contract transfers USDY from user
     * 5. Event emission triggers off-chain DVN attestation flow
     *
     * @param amount USDY to lock (must be > 0)
     * @param validUntil Expiration timestamp for cross-chain attestation
     * @param vcHash Hash of Verifiable Credential (optional: use 0x0 if unused)
     * @return lockId Unique commitment identifier
     */
    function lock(uint256 amount, uint64 validUntil, bytes32 vcHash) external whenNotPaused returns (bytes32 lockId) {
        require(amount != 0, ZeroAmount());

        // Auto-increment user nonce for replay protection
        uint64 nonce = userNonce[msg.sender]++;

        // Generate unique lock identifier from commitment parameters
        // Includes sourceChainId, validUntil, vcHash, and auto-nonce
        uint256 sourceChainId = block.chainid;
        lockId = keccak256(abi.encode(msg.sender, amount, sourceChainId, validUntil, vcHash, nonce));

        // Prevent duplicate lock attempts (protects against accidental double-locking)
        require(!consumed[lockId], DuplicateLockId(lockId));
        consumed[lockId] = true;

        // Update accounting before external call (CEI pattern)
        lockedBalance[msg.sender] += amount;
        totalLocked += amount;

        // Transfer USDY from user (requires prior approval)
        // Note: USDY may have transfer restrictions (allowlist/blocklist)
        SafeTransferLib.safeTransferFrom(ERC20(address(USDY)), msg.sender, address(this), amount);

        // Emit event for DVN relayers to monitor and attest
        emit Locked(msg.sender, lockId, amount, sourceChainId, validUntil, vcHash);
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
    function unlock(address recipient, uint256 amount, bytes32 lockId) external onlyAdmin whenNotPaused {
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
