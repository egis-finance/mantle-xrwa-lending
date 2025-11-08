// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

/**
 * Oracle interface required by Morpho Blue
 * Must return prices with specific precision scaling for proper collateral valuation
 *
 * Precision formula: 36 + loan_decimals - collateral_decimals
 * For USDC (6 decimals) / xcUSDY (18 decimals): 36 + 6 - 18 = 24 decimals
 *
 * Example: If 1 xcUSDY = $1.0425, price = 1.0425 × 10^24
 */
interface IOracle {
    /**
     * Returns the price of 1 unit of collateral token in terms of loan token
     * This value determines how much loan token can be borrowed per unit of collateral
     *
     * Critical: Price must account for 1e36 base scaling plus token decimal differences
     */
    function price() external view returns (uint256);
}
