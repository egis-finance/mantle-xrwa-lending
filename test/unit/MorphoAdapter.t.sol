// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {MorphoAdapter} from "../../contracts/ethereum/MorphoAdapter.sol";
import {MarketParams, Market, Id} from "../../contracts/interfaces/IMorpho.sol";
import {MockERC20, MockMorpho} from "../utils/Mocks.sol";

contract MorphoAdapterTest is Test {
    MorphoAdapter internal adapter;
    MockMorpho internal morpho;
    MockERC20 internal usdc;
    MockERC20 internal acUsdy;

    MarketParams internal params;
    Id internal marketId;

    address internal lender = makeAddr("lender");
    address internal borrower = makeAddr("borrower");
    address internal oracle = makeAddr("oracle");
    address internal irm = makeAddr("irm");

    function setUp() public {
        morpho = new MockMorpho();
        adapter = new MorphoAdapter(address(morpho));

        usdc = new MockERC20("USD Coin", "USDC", 6);
        acUsdy = new MockERC20("Attested USDY", "AcUSDY", 18);

        params = MarketParams({
            loanToken: address(usdc),
            collateralToken: address(acUsdy),
            oracle: oracle,
            irm: irm,
            lltv: 0.8e18
        });

        adapter.initializeMarket(params);
        marketId = Id.wrap(keccak256(abi.encode(params)));

        morpho.setMarket(marketId, Market({
            totalSupplyAssets: 0,
            totalSupplyShares: 0,
            totalBorrowAssets: 0,
            totalBorrowShares: 0,
            lastUpdate: 0,
            fee: 0
        }));
    }

    function testSupplyAndWithdrawUSDC() public {
        uint256 amount = 500e6;
        usdc.mint(lender, amount);

        vm.startPrank(lender);
        usdc.approve(address(adapter), amount);
        adapter.supplyUSDC(amount);
        vm.stopPrank();

        assertEq(usdc.balanceOf(lender), 0);
        assertEq(usdc.balanceOf(address(morpho)), amount);
        assertEq(morpho.supplyShares(marketId, lender), amount);
        assertEq(morpho.lastSupplyAssets(), amount);

        vm.prank(lender);
        adapter.withdrawUSDC(200e6);
        assertEq(usdc.balanceOf(lender), 200e6);
        assertEq(morpho.supplyShares(marketId, lender), amount - 200e6);
    }

    function testSupplyCollateralAndBorrow() public {
        uint256 collateralAmount = 1_000 ether;
        uint256 borrowAmount = 300e6;

        acUsdy.mint(borrower, collateralAmount);
        usdc.mint(address(morpho), borrowAmount);

        vm.startPrank(borrower);
        acUsdy.approve(address(adapter), collateralAmount);
        adapter.supplyCollateral(collateralAmount);
        vm.stopPrank();

        assertEq(acUsdy.balanceOf(address(morpho)), collateralAmount);
        assertEq(morpho.collateral(marketId, borrower), collateralAmount);

        vm.prank(borrower);
        adapter.borrow(borrowAmount);
        assertEq(usdc.balanceOf(borrower), borrowAmount);
        assertEq(morpho.lastBorrowAssets(), borrowAmount);
    }

    function testRepayAndWithdrawCollateral() public {
        uint256 collateralAmount = 500 ether;
        uint256 borrowAmount = 100e6;

        acUsdy.mint(borrower, collateralAmount);
        usdc.mint(address(morpho), borrowAmount);

        vm.startPrank(borrower);
        acUsdy.approve(address(adapter), collateralAmount);
        adapter.supplyCollateral(collateralAmount);
        adapter.borrow(borrowAmount);
        vm.stopPrank();

        usdc.mint(borrower, borrowAmount);
        vm.startPrank(borrower);
        usdc.approve(address(adapter), borrowAmount);
        adapter.repay(borrowAmount);
        adapter.withdrawCollateral(collateralAmount);
        vm.stopPrank();

        assertEq(morpho.borrowShares(marketId, borrower), 0);
        assertEq(acUsdy.balanceOf(borrower), collateralAmount);
    }

    function testInitializeMarketOnlyOnce() public {
        vm.expectRevert(MorphoAdapter.MarketNotInitialized.selector);
        adapter.initializeMarket(params);
    }
}
