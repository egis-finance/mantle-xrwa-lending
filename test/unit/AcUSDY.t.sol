// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {AcUSDY} from "../../contracts/ethereum/AcUSDY.sol";

contract AcUSDYTest is Test {
    AcUSDY internal token;
    address internal receiver;
    address internal borrower;
    address internal morpho;

    function setUp() public {
        receiver = makeAddr("receiver");
        borrower = makeAddr("borrower");
        morpho = makeAddr("morpho");

        token = new AcUSDY(receiver);
    }

    function testMintAndBurnRestrictedToReceiver() public {
        vm.prank(receiver);
        token.mint(borrower, 1 ether);
        assertEq(token.balanceOf(borrower), 1 ether);

        vm.prank(receiver);
        token.burn(borrower, 0.4 ether);
        assertEq(token.balanceOf(borrower), 0.6 ether);

        vm.prank(borrower);
        vm.expectRevert(abi.encodeWithSelector(AcUSDY.Unauthorized.selector, borrower, receiver));
        token.mint(borrower, 1 ether);

        vm.prank(borrower);
        vm.expectRevert(abi.encodeWithSelector(AcUSDY.Unauthorized.selector, borrower, receiver));
        token.burn(borrower, 0.1 ether);
    }

    function testTransferOnlyWhitelistedSender() public {
        vm.prank(receiver);
        token.mint(morpho, 3 ether);

        vm.prank(morpho);
        vm.expectRevert(AcUSDY.TransfersDisabled.selector);
        bool transferShouldFail = token.transfer(borrower, 1 ether);
        transferShouldFail;

        vm.prank(receiver);
        token.setTransferAllowed(morpho, true);

        vm.prank(morpho);
        bool success = token.transfer(borrower, 2 ether);
        assertTrue(success);

        assertEq(token.balanceOf(borrower), 2 ether);
        assertEq(token.balanceOf(morpho), 1 ether);
    }

    function testTransferFromRequiresWhitelistedRecipient() public {
        vm.prank(receiver);
        token.mint(borrower, 5 ether);

        vm.prank(borrower);
        token.approve(morpho, 5 ether);

        vm.prank(morpho);
        vm.expectRevert(AcUSDY.TransfersDisabled.selector);
        bool transferFromShouldFail = token.transferFrom(borrower, morpho, 2 ether);
        transferFromShouldFail;

        vm.prank(receiver);
        token.setTransferAllowed(morpho, true);

        vm.prank(morpho);
        bool success = token.transferFrom(borrower, morpho, 2 ether);
        assertTrue(success);

        assertEq(token.balanceOf(morpho), 2 ether);
        assertEq(token.balanceOf(borrower), 3 ether);
    }

    function testSetTransferAllowedOnlyReceiver() public {
        vm.prank(borrower);
        vm.expectRevert(abi.encodeWithSelector(AcUSDY.Unauthorized.selector, borrower, receiver));
        token.setTransferAllowed(morpho, true);

        vm.prank(receiver);
        token.setTransferAllowed(morpho, true);
        assertTrue(token.transferAllowed(morpho));
    }
}
