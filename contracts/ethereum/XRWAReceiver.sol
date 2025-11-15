// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {AcUSDY} from "./AcUSDY.sol";

/**
 * XRWAReceiver - Cross-Chain Message Verifier
 *
 * Implements xRWA Layer 2 (Cross-Chain Authentication) via DVN signature verification.
 * Validates that USDY was legitimately locked on Mantle before minting AcUSDY collateral.
 *
 * Security model:
 * - 1-of-1 DVN threshold for hackathon (upgradeable to M-of-N)
 * - EIP-712 typed signatures prevent replay and phishing
 * - Allowlist restricts valid source lockers on Mantle
 * - Consumed mapping prevents double-minting from same lockId
 * - Signature expiration via validUntil timestamp
 *
 * Flow: DVN observes Locked event on Mantle → signs attestation → user submits to this contract
 */
contract XRWAReceiver {
    // ═══════════════════════════════════════════════════════════════
    //  STORAGE
    // ═══════════════════════════════════════════════════════════════

    AcUSDY public immutable AC_USDY;
    address public admin;

    /// DVN public keys authorized to sign attestations 1-of-1 for now
    mapping(address => bool) public dvnAllowed;

    /// Source chain locker contracts allowed to originate locks
    mapping(uint256 => mapping(address => bool)) public lockerAllowed;

    /// Prevents replay: tracks lockIds that have been processed
    mapping(bytes32 => bool) public consumed;

    // ═══════════════════════════════════════════════════════════════
    //  EIP-712 DOMAIN
    // ═══════════════════════════════════════════════════════════════

    bytes32 public immutable DOMAIN_SEPARATOR;

    bytes32 public constant LOCK_MESSAGE_TYPEHASH = keccak256(
        "LockMessage(address borrower,bytes32 lockId,uint256 amount,uint256 sourceChainId,address sourceLocker,uint64 validUntil,bytes32 vcHash)"
    );

    struct LockMessage {
        address borrower;      // Address receiving AcUSDY on Ethereum
        bytes32 lockId;        // Unique lock identifier from source chain
        uint256 amount;        // USDY amount locked on Mantle (18 decimals)
        uint256 sourceChainId; // Source chain ID (e.g., Mantle = 14996 on VTE)
        address sourceLocker;  // CollateralLocker address on source chain (for allowlist)
        uint64 validUntil;     // Signature expiration timestamp
        bytes32 vcHash;        // Verifiable Credential hash (optional: 0x0 if unused)
    }

    // ═══════════════════════════════════════════════════════════════
    //  EVENTS
    // ═══════════════════════════════════════════════════════════════

    event AcUSDYMinted(
        address indexed borrower,
        uint256 amount,
        bytes32 indexed lockId,
        uint256 srcChainId,
        address srcLocker
    );

    event DVNUpdated(address indexed dvn, bool allowed);
    event LockerUpdated(uint256 indexed chainId, address indexed locker, bool allowed);
    event AdminUpdated(address indexed oldAdmin, address indexed newAdmin);

    // ═══════════════════════════════════════════════════════════════
    //  ERRORS
    // ═══════════════════════════════════════════════════════════════

    error Unauthorized(address caller, address expectedAdmin);
    error InvalidDVN(address dvn);
    error InvalidLocker(uint256 chainId, address locker);
    error DuplicateLockId(bytes32 lockId);
    error SignatureExpired(uint64 validUntil, uint64 currentTime);
    error InvalidSignature();
    error ZeroAddress();
    error ZeroAmount();

    // ═══════════════════════════════════════════════════════════════
    //  MODIFIERS
    // ═══════════════════════════════════════════════════════════════

    modifier onlyAdmin() {
        require(msg.sender == admin, Unauthorized(msg.sender, admin));
        _;
    }

    // ═══════════════════════════════════════════════════════════════
    //  CONSTRUCTOR
    // ═══════════════════════════════════════════════════════════════

    constructor(address _acUsdy, address _admin, address _dvn) {
        require(_acUsdy != address(0), ZeroAddress());
        require(_admin != address(0), ZeroAddress());
        require(_dvn != address(0), ZeroAddress());

        AC_USDY = AcUSDY(_acUsdy);
        admin = _admin;
        dvnAllowed[_dvn] = true;

        // EIP-712 domain separator for signature verification
        DOMAIN_SEPARATOR = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256(bytes("XRWAReceiver")),
                keccak256(bytes("1")),
                block.chainid,
                address(this)
            )
        );

        emit DVNUpdated(_dvn, true);
    }

    // ═══════════════════════════════════════════════════════════════
    //  EXTERNAL FUNCTIONS
    // ═══════════════════════════════════════════════════════════════

    /**
     * Mint AcUSDY after verifying DVN attestation
     *
     * Validates:
     * 1. Signature from authorized DVN
     * 2. Source locker is allowlisted
     * 3. LockId not previously consumed (prevents replay)
     * 4. Signature not expired
     *
     * @param message Lock attestation data from DVN
     * @param signature EIP-712 signature from DVN
     */
    function mintWithAttestation(
        LockMessage calldata message,
        bytes calldata signature
    ) external {
        require(message.amount != 0, ZeroAmount());
        require(message.borrower != address(0), ZeroAddress());

        // Verify signature hasn't expired
        require(uint64(block.timestamp) <= message.validUntil, SignatureExpired(message.validUntil, uint64(block.timestamp)));

        // Prevent replay attacks
        require(!consumed[message.lockId], DuplicateLockId(message.lockId));
        consumed[message.lockId] = true;

        // Verify source locker is allowlisted
        require(lockerAllowed[message.sourceChainId][message.sourceLocker], InvalidLocker(message.sourceChainId, message.sourceLocker));

        // Recover signer from EIP-712 signature
        address signer = _recoverSigner(message, signature);

        // Verify signer is authorized DVN
        require(dvnAllowed[signer], InvalidDVN(signer));

        // Mint AcUSDY to borrower
        AC_USDY.mint(message.borrower, message.amount);

        emit AcUSDYMinted(
            message.borrower,
            message.amount,
            message.lockId,
            message.sourceChainId,
            message.sourceLocker
        );
    }

    // ═══════════════════════════════════════════════════════════════
    //  ADMIN FUNCTIONS
    // ═══════════════════════════════════════════════════════════════

    /// Add or remove DVN from authorized signer set
    function setDVN(address dvn, bool allowed) external onlyAdmin {
        require(dvn != address(0), ZeroAddress());
        dvnAllowed[dvn] = allowed;
        emit DVNUpdated(dvn, allowed);
    }

    /// Add or remove source chain locker from allowlist
    function setLocker(uint256 chainId, address locker, bool allowed) external onlyAdmin {
        require(locker != address(0), ZeroAddress());
        lockerAllowed[chainId][locker] = allowed;
        emit LockerUpdated(chainId, locker, allowed);
    }

    /// Transfer admin privileges (e.g., to multisig for production)
    function setAdmin(address newAdmin) external onlyAdmin {
        require(newAdmin != address(0), ZeroAddress());
        emit AdminUpdated(admin, newAdmin);
        admin = newAdmin;
    }

    /// Configure AcUSDY transfer whitelist (admin only)
    /// Allows admin to whitelist addresses (e.g., Morpho Blue, adapters) for AcUSDY transfers
    function setAcUSDYTransferAllowed(address addr, bool allowed) external onlyAdmin {
        AC_USDY.setTransferAllowed(addr, allowed);
    }

    // ═══════════════════════════════════════════════════════════════
    //  INTERNAL FUNCTIONS
    // ═══════════════════════════════════════════════════════════════

    /**
     * Recover signer address from EIP-712 signature
     * Uses ECDSA signature verification with domain separator
     */
    function _recoverSigner(
        LockMessage calldata message,
        bytes calldata signature
    ) internal view returns (address) {
        require(signature.length == 65, InvalidSignature());

        // Extract v, r, s from signature
        bytes32 r;
        bytes32 s;
        uint8 v;

        assembly {
            r := calldataload(signature.offset)
            s := calldataload(add(signature.offset, 32))
            v := byte(0, calldataload(add(signature.offset, 64)))
        }

        // EIP-712 typed data hash
        bytes32 structHash = keccak256(abi.encode(
            LOCK_MESSAGE_TYPEHASH,
            message.borrower,
            message.lockId,
            message.amount,
            message.sourceChainId,
            message.sourceLocker,
            message.validUntil,
            message.vcHash
        ));

        bytes32 digest = keccak256(abi.encodePacked(
            "\x19\x01",
            DOMAIN_SEPARATOR,
            structHash
        ));

        // Recover signer
        address signer = ecrecover(digest, v, r, s);
        require(signer != address(0), InvalidSignature());

        return signer;
    }

    // ═══════════════════════════════════════════════════════════════
    //  VIEW FUNCTIONS
    // ═══════════════════════════════════════════════════════════════

    function isDVNAllowed(address dvn) external view returns (bool) {
        return dvnAllowed[dvn];
    }

    function isLockerAllowed(uint256 chainId, address locker) external view returns (bool) {
        return lockerAllowed[chainId][locker];
    }

    function isLockIdConsumed(bytes32 lockId) external view returns (bool) {
        return consumed[lockId];
    }
}
