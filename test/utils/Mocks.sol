// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {ERC20} from "@solmate/tokens/ERC20.sol";
import {SafeTransferLib} from "@solmate/utils/SafeTransferLib.sol";
import {IMorpho, MarketParams, Market, Position, Id} from "../../contracts/interfaces/IMorpho.sol";

/**
 * Simple ERC20 with public mint/burn hooks for test scaffolding.
 */
contract MockERC20 is ERC20 {
    constructor(string memory name_, string memory symbol_, uint8 decimals_) ERC20(name_, symbol_, decimals_) {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function burn(address from, uint256 amount) external {
        _burn(from, amount);
    }
}

/**
 * Lightweight Morpho Blue stub that records calls and simulates share accounting.
 * Only the functions exercised by tests are implemented with minimal logic.
 */
contract MockMorpho is IMorpho {
    using SafeTransferLib for ERC20;

    uint256 public lastSupplyAssets;
    uint256 public lastBorrowAssets;
    uint256 public lastRepayAssets;

    mapping(Id => Market) internal markets;
    mapping(Id => mapping(address => uint256)) internal supplySharesStore;
    mapping(Id => mapping(address => uint256)) internal borrowSharesStore;
    mapping(Id => mapping(address => uint256)) internal collateralStore;

    function createMarket(MarketParams calldata params) external {
        Id id = _id(params);
        // Initialize market with non-zero lastUpdate to indicate it exists
        markets[id] = Market({
            totalSupplyAssets: 0,
            totalSupplyShares: 0,
            totalBorrowAssets: 0,
            totalBorrowShares: 0,
            lastUpdate: uint128(block.timestamp),
            fee: 0
        });
    }

    function supply(
        MarketParams calldata params,
        uint256 assets,
        uint256 shares,
        address onBehalf,
        bytes calldata
    ) external returns (uint256 assetsSupplied, uint256 sharesSupplied) {
        require(assets != 0, "mock: zero supply");

        ERC20(params.loanToken).safeTransferFrom(msg.sender, address(this), assets);
        Id id = _id(params);
        supplySharesStore[id][onBehalf] += assets;

        lastSupplyAssets = assets;
        return (assets, assets);
    }

    function withdraw(
        MarketParams calldata params,
        uint256 assets,
        uint256 shares,
        address onBehalf,
        address receiver
    ) external returns (uint256 assetsWithdrawn, uint256 sharesWithdrawn) {
        Id id = _id(params);
        uint256 amount = assets == 0 ? supplySharesStore[id][onBehalf] : assets;
        if (shares != 0) amount = shares;

        require(amount <= supplySharesStore[id][onBehalf], "mock: insufficient supply");
        supplySharesStore[id][onBehalf] -= amount;

        ERC20(params.loanToken).safeTransfer(receiver, amount);
        return (amount, amount);
    }

    function supplyCollateral(
        MarketParams calldata params,
        uint256 assets,
        address onBehalf,
        bytes calldata
    ) external {
        ERC20(params.collateralToken).safeTransferFrom(msg.sender, address(this), assets);
        Id id = _id(params);
        collateralStore[id][onBehalf] += assets;
    }

    function withdrawCollateral(
        MarketParams calldata params,
        uint256 assets,
        address onBehalf,
        address receiver
    ) external {
        Id id = _id(params);
        uint256 amount = assets == 0 ? collateralStore[id][onBehalf] : assets;
        require(amount <= collateralStore[id][onBehalf], "mock: insufficient collateral");
        collateralStore[id][onBehalf] -= amount;
        ERC20(params.collateralToken).safeTransfer(receiver, amount);
    }

    function borrow(
        MarketParams calldata params,
        uint256 assets,
        uint256 shares,
        address onBehalf,
        address receiver
    ) external returns (uint256 assetsBorrowed, uint256 sharesBorrowed) {
        require(assets != 0, "mock: zero borrow");

        ERC20(params.loanToken).safeTransfer(receiver, assets);

        Id id = _id(params);
        borrowSharesStore[id][onBehalf] += assets;

        lastBorrowAssets = assets;
        return (assets, assets);
    }

    function repay(
        MarketParams calldata params,
        uint256 assets,
        uint256 shares,
        address onBehalf,
        bytes calldata
    ) external returns (uint256 assetsRepaid, uint256 sharesRepaid) {
        ERC20(params.loanToken).safeTransferFrom(msg.sender, address(this), assets);

        Id id = _id(params);
        uint256 repayment = shares != 0 ? shares : assets;
        uint256 currentDebt = borrowSharesStore[id][onBehalf];
        if (repayment > currentDebt) repayment = currentDebt;
        borrowSharesStore[id][onBehalf] = currentDebt - repayment;

        lastRepayAssets = assets;
        return (assets, repayment);
    }

    function position(Id marketId, address user) external view returns (Position memory) {
        return Position({
            supplyShares: supplySharesStore[marketId][user],
            borrowShares: uint128(borrowSharesStore[marketId][user]),
            collateral: uint128(collateralStore[marketId][user])
        });
    }

    function market(Id marketId) external view returns (Market memory) {
        return markets[marketId];
    }

    function supplyShares(Id marketId, address user) external view returns (uint256) {
        return supplySharesStore[marketId][user];
    }

    function borrowShares(Id marketId, address user) external view returns (uint256) {
        return borrowSharesStore[marketId][user];
    }

    function collateral(Id marketId, address user) external view returns (uint256) {
        return collateralStore[marketId][user];
    }

    function setMarket(Id marketId, Market calldata data) external {
        markets[marketId] = data;
    }

    function setSupplyShares(Id marketId, address user, uint256 amount) external {
        supplySharesStore[marketId][user] = amount;
    }

    function setBorrowShares(Id marketId, address user, uint256 amount) external {
        borrowSharesStore[marketId][user] = amount;
    }

    function setCollateral(Id marketId, address user, uint256 amount) external {
        collateralStore[marketId][user] = amount;
    }

    function _id(MarketParams calldata params) internal pure returns (Id) {
        return Id.wrap(keccak256(abi.encode(params)));
    }
}
