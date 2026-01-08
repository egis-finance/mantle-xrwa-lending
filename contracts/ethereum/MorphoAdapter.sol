// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {IMorpho, MarketParams, Market, Id} from "../interfaces/IMorpho.sol";
import {SafeTransferLib} from "@solmate/utils/SafeTransferLib.sol";
import {ERC20} from "@solmate/tokens/ERC20.sol";

/**
 * MorphoAdapter - Simplified Interface to Morpho Blue
 *
 * Wraps Morpho Blue's complex API into easy-to-use functions for:
 * - Supplying USDC (lenders)
 * - Supplying xcUSDY collateral (borrowers)
 * - Borrowing USDC against xcUSDY
 * - Repaying loans
 * - Withdrawing collateral/assets
 *
 * Caches market parameters to reduce gas costs and simplify integration.
 * Designed for xRWA hackathon demo but production-ready architecture.
 */
contract MorphoAdapter {
    // ═══════════════════════════════════════════════════════════════
    //  STORAGE
    // ═══════════════════════════════════════════════════════════════

    IMorpho public immutable MORPHO;
    MarketParams public marketParams;
    Id public marketId;

    // ═══════════════════════════════════════════════════════════════
    //  EVENTS
    // ═══════════════════════════════════════════════════════════════

    event MarketInitialized(Id indexed marketId, MarketParams params);
    event USDCSupplied(address indexed supplier, uint256 amount);
    event CollateralSupplied(address indexed borrower, uint256 amount);
    event USDCBorrowed(address indexed borrower, uint256 amount);
    event LoanRepaid(address indexed borrower, uint256 amount);
    event CollateralWithdrawn(address indexed borrower, uint256 amount);
    event USDCWithdrawn(address indexed supplier, uint256 amount);

    // ═══════════════════════════════════════════════════════════════
    //  ERRORS
    // ═══════════════════════════════════════════════════════════════

    error ZeroAddress();
    error ZeroAmount();
    error MarketNotInitialized();

    // ═══════════════════════════════════════════════════════════════
    //  CONSTRUCTOR
    // ═══════════════════════════════════════════════════════════════

    /**
     * @param _morpho Address of Morpho Blue singleton contract
     */
    constructor(address _morpho) {
        require(_morpho != address(0), ZeroAddress());
        MORPHO = IMorpho(_morpho);
    }

    // ═══════════════════════════════════════════════════════════════
    //  INITIALIZATION
    // ═══════════════════════════════════════════════════════════════

    /**
     * Initialize market parameters (call once after deployment)
     *
     * @param _marketParams Morpho market configuration:
     *   - loanToken: USDC address
     *   - collateralToken: xcUSDY address
     *   - oracle: NAVOracle address
     *   - irm: AdaptiveCurveIRM address
     *   - lltv: Liquidation LTV (e.g., 0.8 × 10^18 for 80%)
     */
    function initializeMarket(MarketParams calldata _marketParams) external {
        require(address(marketParams.loanToken) == address(0), MarketNotInitialized());
        require(_marketParams.loanToken != address(0), ZeroAddress());
        require(_marketParams.collateralToken != address(0), ZeroAddress());

        marketParams = _marketParams;
        marketId = _computeMarketId(_marketParams);

        emit MarketInitialized(marketId, _marketParams);
    }

    // ═══════════════════════════════════════════════════════════════
    //  LENDER FUNCTIONS
    // ═══════════════════════════════════════════════════════════════

    /**
     * Supply USDC to earn interest (lender operation)
     * User must approve this contract to spend USDC first
     *
     * @param amount USDC to supply (6 decimals)
     */
    function supplyUSDC(uint256 amount) external {
        require(amount != 0, ZeroAmount());
        require(address(marketParams.loanToken) != address(0), MarketNotInitialized());

        // Transfer USDC from user to this contract
        SafeTransferLib.safeTransferFrom(ERC20(marketParams.loanToken), msg.sender, address(this), amount);

        // Approve Morpho to spend USDC
        SafeTransferLib.safeApprove(ERC20(marketParams.loanToken), address(MORPHO), amount);

        // Supply to Morpho market
        MORPHO.supply(marketParams, amount, 0, msg.sender, "");

        emit USDCSupplied(msg.sender, amount);
    }

    /**
     * Withdraw USDC from Morpho (lender operation)
     *
     * @param amount USDC to withdraw (6 decimals, 0 for max)
     */
    function withdrawUSDC(uint256 amount) external {
        require(address(marketParams.loanToken) != address(0), MarketNotInitialized());

        // Withdraw from Morpho directly to user
        MORPHO.withdraw(marketParams, amount, 0, msg.sender, msg.sender);

        emit USDCWithdrawn(msg.sender, amount);
    }

    // ═══════════════════════════════════════════════════════════════
    //  BORROWER FUNCTIONS
    // ═══════════════════════════════════════════════════════════════

    /**
     * Supply xcUSDY collateral (borrower operation)
     * User must approve this contract to spend xcUSDY first
     *
     * @param amount xcUSDY to supply as collateral (18 decimals)
     */
    function supplyCollateral(uint256 amount) external {
        require(amount != 0, ZeroAmount());
        require(address(marketParams.loanToken) != address(0), MarketNotInitialized());

        // Transfer xcUSDY from user to this contract
        SafeTransferLib.safeTransferFrom(ERC20(marketParams.collateralToken), msg.sender, address(this), amount);

        // Approve Morpho to spend xcUSDY
        SafeTransferLib.safeApprove(ERC20(marketParams.collateralToken), address(MORPHO), amount);

        // Supply collateral to Morpho
        MORPHO.supplyCollateral(marketParams, amount, msg.sender, "");

        emit CollateralSupplied(msg.sender, amount);
    }

    /**
     * Borrow USDC against xcUSDY collateral
     *
     * @param amount USDC to borrow (6 decimals)
     */
    function borrow(uint256 amount) external {
        require(amount != 0, ZeroAmount());
        require(address(marketParams.loanToken) != address(0), MarketNotInitialized());

        // Borrow USDC from Morpho
        MORPHO.borrow(marketParams, amount, 0, msg.sender, msg.sender);

        emit USDCBorrowed(msg.sender, amount);
    }

    /**
     * Repay USDC loan
     * User must approve this contract to spend USDC first
     *
     * @param amount USDC to repay (6 decimals, 0 for full repayment)
     */
    function repay(uint256 amount) external {
        require(address(marketParams.loanToken) != address(0), MarketNotInitialized());

        // Transfer USDC from user to this contract
        SafeTransferLib.safeTransferFrom(ERC20(marketParams.loanToken), msg.sender, address(this), amount);

        // Approve Morpho to spend USDC
        SafeTransferLib.safeApprove(ERC20(marketParams.loanToken), address(MORPHO), amount);

        // Repay loan to Morpho
        MORPHO.repay(marketParams, amount, 0, msg.sender, "");

        emit LoanRepaid(msg.sender, amount);
    }

    /**
     * Withdraw xcUSDY collateral after repaying loan
     *
     * @param amount xcUSDY to withdraw (18 decimals, 0 for max)
     */
    function withdrawCollateral(uint256 amount) external {
        require(address(marketParams.loanToken) != address(0), MarketNotInitialized());

        // Withdraw collateral from Morpho directly to user
        MORPHO.withdrawCollateral(marketParams, amount, msg.sender, msg.sender);

        emit CollateralWithdrawn(msg.sender, amount);
    }

    // ═══════════════════════════════════════════════════════════════
    //  VIEW FUNCTIONS
    // ═══════════════════════════════════════════════════════════════

    /// Get market data from Morpho
    function getMarket() external view returns (Market memory) {
        return MORPHO.market(marketId);
    }

    /// Get user's supply position (lender)
    function getSupplyPosition(address user) external view returns (uint256) {
        return MORPHO.position(marketId, user).supplyShares;
    }

    /// Get user's borrow position
    function getBorrowPosition(address user) external view returns (uint256) {
        return MORPHO.position(marketId, user).borrowShares;
    }

    /// Get user's collateral balance
    function getCollateralBalance(address user) external view returns (uint256) {
        return MORPHO.position(marketId, user).collateral;
    }

    // ═══════════════════════════════════════════════════════════════
    //  INTERNAL FUNCTIONS
    // ═══════════════════════════════════════════════════════════════

    /// Compute Morpho market ID from parameters
    function _computeMarketId(MarketParams memory params) internal pure returns (Id) {
        return Id.wrap(keccak256(abi.encode(params)));
    }
}
