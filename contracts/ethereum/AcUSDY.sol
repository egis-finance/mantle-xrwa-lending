// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {IERC20} from "../interfaces/IERC20.sol";

/**
 * AcUSDY - Attested Collateral USDY Token
 *
 * Non-transferable ERC20 representing USDY locked on Mantle and verified via DVN attestation.
 * Acts as collateral in Morpho Blue for borrowing against remote RWA assets.
 *
 * Transfer restriction model:
 * - Peer-to-peer transfers permanently disabled (prevents secondary markets)
 * - Transfers TO whitelisted addresses allowed (enables Morpho Blue integration)
 * - Morpho Blue address whitelisted for collateral deposits/withdrawals
 * - Approve enabled (required for Morpho delegation)
 *
 * Lifecycle:
 * - Minted by XRWAReceiver after DVN signature verification
 * - Whitelisted to Morpho for collateral operations
 * - Burned when corresponding USDY is unlocked on Mantle
 *
 * This implements xRWA Layer 1 (Asset Identification) on the destination chain.
 */
contract AcUSDY is IERC20 {
    // ═══════════════════════════════════════════════════════════════
    //  STORAGE
    // ═══════════════════════════════════════════════════════════════

    string public constant name = "Attested Collateral USDY";
    string public constant symbol = "AcUSDY";
    uint8 public constant decimals = 18;

    uint256 public totalSupply;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    address public immutable RECEIVER;

    /// Whitelist for addresses allowed to receive transfers (e.g., Morpho Blue)
    mapping(address => bool) public transferAllowed;

    // ═══════════════════════════════════════════════════════════════
    //  EVENTS
    // ═══════════════════════════════════════════════════════════════

    event TransferAllowedUpdated(address indexed addr, bool allowed);

    // ═══════════════════════════════════════════════════════════════
    //  ERRORS
    // ═══════════════════════════════════════════════════════════════

    error TransfersDisabled();
    error InsufficientAllowance();
    error Unauthorized(address caller, address expectedReceiver);
    error ZeroAddress();

    // ═══════════════════════════════════════════════════════════════
    //  CONSTRUCTOR
    // ═══════════════════════════════════════════════════════════════

    constructor(address _receiver) {
        require(_receiver != address(0), ZeroAddress());
        RECEIVER = _receiver;
    }

    // ═══════════════════════════════════════════════════════════════
    //  EXTERNAL FUNCTIONS - ERC20 Interface
    // ═══════════════════════════════════════════════════════════════

    /**
     * Approve spender to use tokens (required for Morpho Blue)
     * Standard ERC20 approve - no restrictions
     */
    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    /**
     * Transfer with whitelist check
     *
     * Allows transfers FROM whitelisted addresses (e.g., Morpho returning collateral).
     * Blocks all peer-to-peer transfers to prevent secondary markets.
     *
     * @param to Recipient address
     * @param amount Token amount to transfer
     */
    function transfer(address to, uint256 amount) external returns (bool) {
        // Only whitelisted addresses can transfer tokens (e.g., Morpho withdrawals)
        require(transferAllowed[msg.sender], TransfersDisabled());

        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;

        emit Transfer(msg.sender, to, amount);
        return true;
    }

    /**
     * TransferFrom with whitelist check
     *
     * Allows transfers TO whitelisted addresses only (e.g., Morpho collateral deposits).
     * This enables Morpho.supplyCollateral() to work while blocking peer-to-peer transfers.
     *
     * Security: Only immutable, audited contracts (Morpho Blue) are whitelisted.
     *
     * @param from Token owner
     * @param to Recipient (must be whitelisted)
     * @param amount Token amount
     */
    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        // Only allow transfers TO whitelisted addresses (e.g., Morpho)
        require(transferAllowed[to], TransfersDisabled());

        // Check and update allowance
        uint256 allowed = allowance[from][msg.sender];
        require(allowed >= amount, InsufficientAllowance());

        if (allowed != type(uint256).max) {
            allowance[from][msg.sender] = allowed - amount;
        }

        // Execute transfer
        balanceOf[from] -= amount;
        balanceOf[to] += amount;

        emit Transfer(from, to, amount);
        return true;
    }

    // ═══════════════════════════════════════════════════════════════
    //  EXTERNAL FUNCTIONS - Mint/Burn
    // ═══════════════════════════════════════════════════════════════

    /**
     * Mint AcUSDY after DVN verification
     * Only XRWAReceiver can mint after validating cross-chain lock proof
     *
     * @param to Address receiving AcUSDY (borrower who locked USDY on Mantle)
     * @param amount AcUSDY to mint (matches locked USDY amount)
     */
    function mint(address to, uint256 amount) external {
        require(msg.sender == RECEIVER, Unauthorized(msg.sender, RECEIVER));
        require(to != address(0), ZeroAddress());

        balanceOf[to] += amount;
        totalSupply += amount;

        emit Transfer(address(0), to, amount);
    }

    /**
     * Burn AcUSDY when USDY is unlocked on Mantle
     * Only XRWAReceiver can burn after validating cross-chain unlock proof
     *
     * @param from Address burning AcUSDY (must have returned collateral on Mantle)
     * @param amount AcUSDY to burn (matches unlocked USDY amount)
     */
    function burn(address from, uint256 amount) external {
        require(msg.sender == RECEIVER, Unauthorized(msg.sender, RECEIVER));

        // Underflow protection built into Solidity 0.8.30
        balanceOf[from] -= amount;
        totalSupply -= amount;

        emit Transfer(from, address(0), amount);
    }

    // ═══════════════════════════════════════════════════════════════
    //  EXTERNAL FUNCTIONS - Whitelist Management
    // ═══════════════════════════════════════════════════════════════

    /**
     * Update transfer whitelist (admin only)
     *
     * Whitelisted addresses can receive/send AcUSDY via transfer/transferFrom.
     * Primary use case: Whitelist Morpho Blue for collateral operations.
     *
     * Security: Only whitelist immutable, audited contracts.
     *
     * @param addr Address to whitelist (e.g., Morpho Blue: 0xBBBBBbbb9cC5e90e3b3Af64bdAF62C37EEFFCb61)
     * @param allowed True to enable transfers, false to disable
     */
    function setTransferAllowed(address addr, bool allowed) external {
        require(msg.sender == RECEIVER, Unauthorized(msg.sender, RECEIVER));
        transferAllowed[addr] = allowed;
        emit TransferAllowedUpdated(addr, allowed);
    }
}
