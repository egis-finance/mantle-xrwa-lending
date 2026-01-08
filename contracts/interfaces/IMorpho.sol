// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

/// Market identifier (hash of MarketParams)
type Id is bytes32;

/**
 * Morpho Blue lending protocol interface
 * Implements isolated lending markets with immutable risk parameters
 * Reference: https://github.com/morpho-org/morpho-blue
 */

/**
 * Market configuration parameters
 * These are hashed together to create a unique market identifier
 */
struct MarketParams {
    address loanToken; // Asset being borrowed (e.g., USDC)
    address collateralToken; // Asset used as collateral (e.g., xcUSDY)
    address oracle; // Price feed for collateral/loan pair
    address irm; // Interest rate model contract
    uint256 lltv; // Liquidation LTV threshold (1e18 = 100%)
}

/**
 * Market state data
 */
struct Market {
    uint128 totalSupplyAssets;
    uint128 totalSupplyShares;
    uint128 totalBorrowAssets;
    uint128 totalBorrowShares;
    uint128 lastUpdate;
    uint128 fee;
}

/**
 * User position state within a market
 * Morpho uses share-based accounting for efficiency
 */
struct Position {
    uint256 supplyShares; // Shares of supplied loan token
    uint128 borrowShares; // Shares of borrowed loan token
    uint128 collateral; // Amount of collateral deposited
}

interface IMorpho {
    /// Create a new isolated lending market
    function createMarket(MarketParams calldata params) external;

    /**
     * Supply loan tokens to earn interest
     */
    function supply(MarketParams calldata params, uint256 assets, uint256 shares, address onBehalf, bytes calldata data)
        external
        returns (uint256 assetsSupplied, uint256 sharesSupplied);

    /// Withdraw supplied loan tokens
    function withdraw(MarketParams calldata params, uint256 assets, uint256 shares, address onBehalf, address receiver)
        external
        returns (uint256 assetsWithdrawn, uint256 sharesWithdrawn);

    /**
     * Supply collateral to enable borrowing
     * Collateral remains in Morpho's custody until withdrawal
     */
    function supplyCollateral(MarketParams calldata params, uint256 assets, address onBehalf, bytes calldata data)
        external;

    /// Withdraw collateral (requires sufficient health factor)
    function withdrawCollateral(MarketParams calldata params, uint256 assets, address onBehalf, address receiver)
        external;

    /**
     * Borrow loan tokens against supplied collateral
     * Position must maintain LTV below LLTV threshold
     */
    function borrow(MarketParams calldata params, uint256 assets, uint256 shares, address onBehalf, address receiver)
        external
        returns (uint256 assetsBorrowed, uint256 sharesBorrowed);

    /// Repay borrowed assets to reduce debt
    function repay(MarketParams calldata params, uint256 assets, uint256 shares, address onBehalf, bytes calldata data)
        external
        returns (uint256 assetsRepaid, uint256 sharesRepaid);

    /// Query user's position in a specific market
    function position(Id marketId, address user) external view returns (Position memory);

    /// Get market state
    function market(Id marketId) external view returns (Market memory);
}
