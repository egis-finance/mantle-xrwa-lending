// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {NAVOracle} from "../../contracts/ethereum/NAVOracle.sol";

contract NAVOracleTest is Test {
    NAVOracle internal oracle;
    address internal admin = makeAddr("admin");
    uint256 internal constant INITIAL_PRICE = 1_050_000_000_000_000_000_000_000;

    function setUp() public {
        oracle = new NAVOracle(admin, INITIAL_PRICE);
    }

    function testPriceAppliesHaircut() public view {
        uint256 expected = (INITIAL_PRICE * 9800) / 10_000;
        assertEq(oracle.price(), expected);
    }

    function testPriceRevertsWhenStale() public {
        uint256 lastUpdate = oracle.lastUpdate();
        vm.warp(block.timestamp + 24 hours + 1);
        vm.expectRevert(abi.encodeWithSelector(NAVOracle.StalePrice.selector, lastUpdate, block.timestamp, 24 hours));
        oracle.price();
    }

    function testUpdatePriceOnlyAdmin() public {
        uint256 newPrice = INITIAL_PRICE + 1;

        vm.prank(admin);
        oracle.updatePrice(newPrice);
        assertEq(oracle.currentPrice(), newPrice);

        vm.prank(makeAddr("stranger"));
        vm.expectRevert(abi.encodeWithSelector(NAVOracle.Unauthorized.selector, makeAddr("stranger"), admin));
        oracle.updatePrice(newPrice);
    }

    function testSetAdmin() public {
        address newAdmin = makeAddr("new-admin");

        vm.prank(admin);
        oracle.setAdmin(newAdmin);
        assertEq(oracle.admin(), newAdmin);

        vm.prank(admin);
        vm.expectRevert(abi.encodeWithSelector(NAVOracle.Unauthorized.selector, admin, newAdmin));
        oracle.setAdmin(admin);
    }
}
