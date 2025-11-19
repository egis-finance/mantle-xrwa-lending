// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";
import {AcUSDY} from "../../contracts/ethereum/AcUSDY.sol";
import {XRWAReceiver} from "../../contracts/ethereum/XRWAReceiver.sol";

contract XRWAReceiverTest is Test {
    XRWAReceiver internal receiver;
    AcUSDY internal acUsdy;

    address internal admin = makeAddr("admin");
    address internal locker = makeAddr("locker");
    address internal borrower = makeAddr("borrower");

    uint256 internal dvnPrivateKey = 0xA11CE;
    address internal dvn;

    function setUp() public {
        dvn = vm.addr(dvnPrivateKey);

        uint64 nonceBefore = uint64(vm.getNonce(address(this)));
        address predictedReceiver = vm.computeCreateAddress(address(this), nonceBefore + 1);
        acUsdy = new AcUSDY(predictedReceiver);

        receiver = new XRWAReceiver(address(acUsdy), admin, dvn);

        vm.prank(admin);
        receiver.setLocker(5000, locker, true);
    }

    function testMintWithValidAttestation() public {
        XRWAReceiver.LockMessage memory message = _baseMessage();
        bytes memory signature = _sign(message);

        vm.prank(borrower);
        vm.expectEmit(true, false, false, true);
        emit XRWAReceiver.AcUSDYMinted(
            borrower, message.amount, message.lockId, message.sourceChainId, message.sourceLocker
        );
        receiver.mintWithAttestation(message, signature);

        assertEq(acUsdy.balanceOf(borrower), message.amount);
        assertTrue(receiver.consumed(message.lockId));
    }

    function testRevertsWithInvalidDvnSignature() public {
        XRWAReceiver.LockMessage memory message = _baseMessage();
        bytes memory signature = _signWithKey(message, 0xBEEF);

        vm.expectRevert(abi.encodeWithSelector(XRWAReceiver.InvalidDVN.selector, vm.addr(0xBEEF)));
        receiver.mintWithAttestation(message, signature);
    }

    function testRevertsWhenExpired() public {
        XRWAReceiver.LockMessage memory message = _baseMessage();
        message.validUntil = uint64(block.timestamp - 1);

        bytes memory signature = _sign(message);
        vm.expectRevert(
            abi.encodeWithSelector(XRWAReceiver.SignatureExpired.selector, message.validUntil, uint64(block.timestamp))
        );
        receiver.mintWithAttestation(message, signature);
    }

    function testRevertsWhenLockerNotAllowed() public {
        XRWAReceiver.LockMessage memory message = _baseMessage();
        message.sourceLocker = makeAddr("unlisted");

        bytes memory signature = _sign(message);
        vm.expectRevert(
            abi.encodeWithSelector(XRWAReceiver.InvalidLocker.selector, message.sourceChainId, message.sourceLocker)
        );
        receiver.mintWithAttestation(message, signature);
    }

    function testRevertsOnReplay() public {
        XRWAReceiver.LockMessage memory message = _baseMessage();
        bytes memory signature = _sign(message);

        receiver.mintWithAttestation(message, signature);
        vm.expectRevert(abi.encodeWithSelector(XRWAReceiver.DuplicateLockId.selector, message.lockId));
        receiver.mintWithAttestation(message, signature);
    }

    function _baseMessage() internal view returns (XRWAReceiver.LockMessage memory message) {
        message = XRWAReceiver.LockMessage({
            borrower: borrower,
            lockId: keccak256("lock-1"),
            amount: 100 ether,
            sourceChainId: 5000,
            sourceLocker: locker,
            validUntil: uint64(block.timestamp + 1 hours),
            vcHash: keccak256("vc")
        });
    }

    function _sign(XRWAReceiver.LockMessage memory message) internal view returns (bytes memory) {
        return _signWithKey(message, dvnPrivateKey);
    }

    function _signWithKey(XRWAReceiver.LockMessage memory message, uint256 key) internal view returns (bytes memory) {
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

        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, digest);
        return abi.encodePacked(r, s, v);
    }
}
