// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

/**
 * Standard ERC20 interface for token interactions
 * Optimized for USDY integration (18 decimals, yield-bearing semantics)
 */
interface IERC20 {
    /// Token metadata queries
    function decimals() external view returns (uint8);
    function totalSupply() external view returns (uint256);
    function balanceOf(address account) external view returns (uint256);
    function allowance(address owner, address spender) external view returns (uint256);

    /// Core transfer operations
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function approve(address spender, uint256 amount) external returns (bool);

    /// Standard events
    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);
}
