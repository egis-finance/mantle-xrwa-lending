// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

/**
 * Morpho Blue lending protocol interface
 * Implements isolated lending markets with immutable risk parameters
 * Reference: https://github.com/morpho-org/morpho-blue
 */
interface IMorpho {
    /**
     * Market configuration parameters
     * These are hashed together to create a unique market identifier
     */
    struct MarketParams {
        address loanToken;        // Asset being borrowed (e.g., USDC)
        address collateralToken;  // Asset used as collateral (e.g., xcUSDY)
        address oracle;           // Price feed for collateral/loan pair
        address irm;              // Interest rate model contract
        uint256 lltv;             // Liquidation LTV threshold (1e18 = 100%)
    }

    /**
     * User position state within a market
     * Morpho uses share-based accounting for efficiency
     */
    struct Position {
        uint256 supplyShares;     // Shares of supplied loan token
        uint128 borrowShares;     // Shares of borrowed loan token
        uint128 collateral;       // Amount of collateral deposited
    }

    /// Create a new isolated lending market
    function createMarket(MarketParams calldata params) external;

    /**
     * Supply collateral to enable borrowing
     * Collateral remains in Morpho's custody until withdrawal
     */
    function supplyCollateral(
        MarketParams calldata params,
        uint256 assets,
        address onBehalf,
        bytes calldata data
    ) external;

    /// Withdraw collateral (requires sufficient health factor)
    function withdrawCollateral(
        MarketParams calldata params,
        uint256 assets,
        address onBehalf,
        address receiver
    ) external;

    /**
     * Borrow loan tokens against supplied collateral
     * Position must maintain LTV below LLTV threshold
     */
    function borrow(
        MarketParams calldata params,
        uint256 assets,
        uint256 shares,
        address onBehalf,
        address receiver
    ) external returns (uint256 assetsBorrowed, uint256 sharesBorrowed);

    /// Repay borrowed assets to reduce debt
    function repay(
        MarketParams calldata params,
        uint256 assets,
        uint256 shares,
        address onBehalf,
        bytes calldata data
    ) external returns (uint256 assetsRepaid, uint256 sharesRepaid);

    /// Query user's position in a specific market
    function position(bytes32 marketId, address user)
        external view returns (Position memory);
}
