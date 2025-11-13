// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {IOracle} from "../interfaces/IOracle.sol";

/**
 * NAVOracle - USDY Net Asset Value Oracle for Morpho Blue
 *
 * This contract currently acts as a relayer driven NAV adapter
 * - `admin` sets `currentPrice` off-chain based on an authoritative USDY NAV source (e.g., Ondo
 *   or a Chronicle / Chainlink reference), then publishes it on-chain in Morpho's 10^24 format.
 * - A 24h staleness bound and a 2% haircut are applied on read to guard against delayed updates
 *   and small pricing errors.
 * - There is intentionally **no direct integration yet** with Mantle oracle providers or on-chain
 *   PoR infra; those concerns are kept separate to simplify the hackathon MVP
 *
 * - `currentPrice` will ultimately be driven by a PoR-aware `CollateralOracle` that aggregates
 *   Chronicle Scribe (primary USDY oracle on Mantle) and Chainlink SCALE (secondary / other assets)
 *   plus additional RWA feeds as the asset set grows.
 * - This contract may be replaced or wrapped so that Morpho Blue reads from a provider-backed price
 *   rather than a manually-updated scalar.
 *
 * Morpho pricing context:
 * - Adjustment: 10^(loanDecimals - collateralDecimals).
 * - For USDC (6) / AcUSDY (18): 10^(36 + 6 - 18) = 10^24.
 *
 * Example: If 1 USDY = $1.0425
 * - Raw price: 1.0425 × 10^24 = 1_042_500_000_000_000_000_000_000.
 * - With 2% haircut: 1_021_650_000_000_000_000_000_000.
 */
contract NAVOracle is IOracle {
    // ═══════════════════════════════════════════════════════════════
    //  STORAGE
    // ═══════════════════════════════════════════════════════════════

    address public admin;

    /// Current USDY price in USDC with 10^24 decimals (Morpho format)
    uint256 public currentPrice;

    /// Timestamp of last price update
    uint256 public lastUpdate;

    /// Maximum age before price is considered stale (24 hours)
    uint256 public constant MAX_PRICE_AGE = 24 hours;

    /// Haircut applied to NAV for safety margin (2% = 98% LTV)
    uint256 public constant HAIRCUT_BPS = 200;  // 2% = 200 basis points
    uint256 public constant BPS_DENOMINATOR = 10_000;

    // ═══════════════════════════════════════════════════════════════
    //  EVENTS
    // ═══════════════════════════════════════════════════════════════

    event PriceUpdated(uint256 newPrice, uint256 timestamp);
    event AdminUpdated(address indexed oldAdmin, address indexed newAdmin);

    // ═══════════════════════════════════════════════════════════════
    //  ERRORS
    // ═══════════════════════════════════════════════════════════════

    error Unauthorized(address caller, address expectedAdmin);
    error StalePrice(uint256 lastUpdate, uint256 currentTime, uint256 maxAge);
    error ZeroAddress();
    error ZeroPrice();

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

    /**
     * @param _admin Address authorized to update prices
     * @param _initialPrice Initial USDY price in 10^24 format (e.g., 1.04 × 10^24 for $1.04)
     */
    constructor(address _admin, uint256 _initialPrice) {
        require(_admin != address(0), ZeroAddress());
        require(_initialPrice != 0, ZeroPrice());

        admin = _admin;
        currentPrice = _initialPrice;
        lastUpdate = block.timestamp;

        emit PriceUpdated(_initialPrice, block.timestamp);
    }

    // ═══════════════════════════════════════════════════════════════
    //  EXTERNAL FUNCTIONS - IOracle Implementation
    // ═══════════════════════════════════════════════════════════════

    /**
     * Get current USDY price with staleness check
     * Morpho Blue calls this to determine collateral value
     *
     * @return Current price in 10^24 format with haircut applied
     */
    function price() external view returns (uint256) {
        // Ensure price is fresh (updated within MAX_PRICE_AGE)
        require(
            block.timestamp <= lastUpdate + MAX_PRICE_AGE,
            StalePrice(lastUpdate, block.timestamp, MAX_PRICE_AGE)
        );

        // Apply haircut for safety margin (e.g., 2% discount)
        return (currentPrice * (BPS_DENOMINATOR - HAIRCUT_BPS)) / BPS_DENOMINATOR;
    }

    // ═══════════════════════════════════════════════════════════════
    //  ADMIN FUNCTIONS
    // ═══════════════════════════════════════════════════════════════

    /**
     * Update USDY price (admin only)
     *
     * Price format: 10^24 decimals for Morpho compatibility
     * Example: $1.0425 USDY = 1_042_500_000_000_000_000_000_000
     *
     * Future enhancement: Replace with available Mantle oracles integration
     *
     * @param newPrice New USDY price in 10^24 format (before haircut)
     */
    function updatePrice(uint256 newPrice) external onlyAdmin {
        require(newPrice != 0, ZeroPrice());

        currentPrice = newPrice;
        lastUpdate = block.timestamp;

        emit PriceUpdated(newPrice, block.timestamp);
    }

    /// Transfer admin privileges (e.g., to multisig for production)
    function setAdmin(address newAdmin) external onlyAdmin {
        require(newAdmin != address(0), ZeroAddress());
        emit AdminUpdated(admin, newAdmin);
        admin = newAdmin;
    }

    // ═══════════════════════════════════════════════════════════════
    //  VIEW FUNCTIONS
    // ═══════════════════════════════════════════════════════════════

    /// Get raw price without haircut (for monitoring)
    function getRawPrice() external view returns (uint256) {
        return currentPrice;
    }

    /// Get price with haircut applied (same as price() but without staleness check)
    function getPriceWithHaircut() external view returns (uint256) {
        return (currentPrice * (BPS_DENOMINATOR - HAIRCUT_BPS)) / BPS_DENOMINATOR;
    }

    /// Check if current price is stale
    function isStale() external view returns (bool) {
        return block.timestamp > lastUpdate + MAX_PRICE_AGE;
    }

    /// Get seconds until price becomes stale
    function timeUntilStale() external view returns (uint256) {
        uint256 staleAt = lastUpdate + MAX_PRICE_AGE;
        if (block.timestamp >= staleAt) return 0;
        return staleAt - block.timestamp;
    }
}
