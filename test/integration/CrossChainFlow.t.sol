// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {CollateralLocker} from "../../contracts/mantle/CollateralLocker.sol";
import {AcUSDY} from "../../contracts/ethereum/AcUSDY.sol";
import {XRWAReceiver} from "../../contracts/ethereum/XRWAReceiver.sol";
import {NAVOracle} from "../../contracts/ethereum/NAVOracle.sol";
import {MorphoAdapter} from "../../contracts/ethereum/MorphoAdapter.sol";
import {MarketParams, Id} from "../../contracts/interfaces/IMorpho.sol";
import {MockERC20, MockMorpho} from "../utils/Mocks.sol";

contract CrossChainFlowTest is Test {
    CollateralLocker internal locker;
    AcUSDY internal acUsdy;
    XRWAReceiver internal receiver;
    NAVOracle internal navOracle;
    MorphoAdapter internal adapter;
    MockMorpho internal morpho;
    MockERC20 internal usdy;
    MockERC20 internal usdc;

    address internal admin = makeAddr("admin");
    address internal borrower = makeAddr("borrower");

    uint256 internal dvnPrivateKey = 0xA11CE5;
    address internal dvn;

    MarketParams internal params;
    Id internal marketId;

    function setUp() public {
        dvn = vm.addr(dvnPrivateKey);
        usdy = new MockERC20("USDY", "USDY", 18);
        usdc = new MockERC20("USD Coin", "USDC", 6);

        uint256 nonceBefore = vm.getNonce(address(this));
        address predictedReceiver = vm.computeCreateAddress(address(this), nonceBefore + 1);
        acUsdy = new AcUSDY(predictedReceiver);
        receiver = new XRWAReceiver(address(acUsdy), admin, dvn);

        locker = new CollateralLocker(address(usdy), admin);
        navOracle = new NAVOracle(admin, 1_020_000_000_000_000_000_000_000);

        morpho = new MockMorpho();
        adapter = new MorphoAdapter(address(morpho));
        params = MarketParams({
            loanToken: address(usdc),
            collateralToken: address(acUsdy),
            oracle: address(navOracle),
            irm: makeAddr("irm"),
            lltv: 0.8e18
        });
        adapter.initializeMarket(params);
        marketId = Id.wrap(keccak256(abi.encode(params)));

        vm.prank(admin);
        receiver.setLocker(block.chainid, address(locker), true);

        vm.prank(address(receiver));
        acUsdy.setTransferAllowed(address(adapter), true);

        vm.prank(address(receiver));
        acUsdy.setTransferAllowed(address(morpho), true);
    }

    function testEndToEndLockAndBorrowFlow() public {
        uint256 lockAmount = 1_000 ether;
        uint256 borrowAmount = 200e6;

        // Borrower locks USDY on Mantle.
        usdy.mint(borrower, lockAmount);
        vm.startPrank(borrower);
        usdy.approve(address(locker), lockAmount);
        bytes32 lockId = locker.lock(lockAmount, uint64(block.timestamp + 1 days), keccak256("vc"));
        vm.stopPrank();

        // DVN signs attestation and borrower mints AcUSDY.
        XRWAReceiver.LockMessage memory message = XRWAReceiver.LockMessage({
            borrower: borrower,
            lockId: lockId,
            amount: lockAmount,
            sourceChainId: block.chainid,
            sourceLocker: address(locker),
            validUntil: uint64(block.timestamp + 1 days),
            vcHash: keccak256("vc")
        });
        bytes memory signature = _sign(message);
        receiver.mintWithAttestation(message, signature);

        assertEq(acUsdy.balanceOf(borrower), lockAmount);
        assertTrue(receiver.consumed(lockId));

        // Borrower supplies AcUSDY and borrows USDC.
        morpho.setCollateral(marketId, borrower, 0);
        morpho.setBorrowShares(marketId, borrower, 0);
        usdc.mint(address(morpho), borrowAmount);

        vm.startPrank(borrower);
        acUsdy.approve(address(adapter), lockAmount);
        adapter.supplyCollateral(lockAmount);
        adapter.borrow(borrowAmount);
        vm.stopPrank();

        assertEq(morpho.collateral(marketId, borrower), lockAmount);
        assertEq(usdc.balanceOf(borrower), borrowAmount);
    }

    function _sign(XRWAReceiver.LockMessage memory message) internal view returns (bytes memory) {
        bytes32 structHash = keccak256(
            abi.encode(
                receiver.LOCK_MESSAGE_TYPEHASH(),
                message.borrower,
                message.lockId,
                message.amount,
                message.sourceChainId,
                message.sourceLocker,
                message.validUntil,
                message.vcHash
            )
        );

        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", receiver.DOMAIN_SEPARATOR(), structHash));

        (uint8 v, bytes32 r, bytes32 s) = vm.sign(dvnPrivateKey, digest);
        return abi.encodePacked(r, s, v);
    }
}
