package contracts

import (
	"math/big"

	"github.com/ethereum/go-ethereum/accounts/abi"
	"github.com/ethereum/go-ethereum/common"
)

// LockMessage represents the EIP-712 typed data for cross-chain attestation
// struct LockMessage {
//     address borrower;
//     bytes32 lockId;
//     uint256 amount;
//     uint256 sourceChainId;
//     address sourceLocker;
//     uint64 validUntil;
//     bytes32 vcHash;
// }
type LockMessage struct {
	Borrower      common.Address
	LockId        [32]byte
	Amount        *big.Int
	SourceChainId *big.Int
	SourceLocker  common.Address
	ValidUntil    uint64
	VcHash        [32]byte
}

// XRWAReceiverABI contains the minimal ABI for XRWAReceiver contract
const XRWAReceiverABI = `[
	{
		"inputs": [
			{
				"components": [
					{"internalType": "address", "name": "borrower", "type": "address"},
					{"internalType": "bytes32", "name": "lockId", "type": "bytes32"},
					{"internalType": "uint256", "name": "amount", "type": "uint256"},
					{"internalType": "uint256", "name": "sourceChainId", "type": "uint256"},
					{"internalType": "address", "name": "sourceLocker", "type": "address"},
					{"internalType": "uint64", "name": "validUntil", "type": "uint64"},
					{"internalType": "bytes32", "name": "vcHash", "type": "bytes32"}
				],
				"internalType": "struct XRWAReceiver.LockMessage",
				"name": "message",
				"type": "tuple"
			},
			{"internalType": "bytes", "name": "signature", "type": "bytes"}
		],
		"name": "mintWithAttestation",
		"outputs": [],
		"stateMutability": "nonpayable",
		"type": "function"
	},
	{
		"inputs": [{"internalType": "bytes32", "name": "", "type": "bytes32"}],
		"name": "consumed",
		"outputs": [{"internalType": "bool", "name": "", "type": "bool"}],
		"stateMutability": "view",
		"type": "function"
	}
]`

// PackMintWithAttestation packs the mintWithAttestation function call
// Combines v, r, s into a 65-byte signature (r + s + v)
func PackMintWithAttestation(contractABI abi.ABI, msg LockMessage, v uint8, r, s [32]byte) ([]byte, error) {
	// Construct 65-byte signature: r (32 bytes) + s (32 bytes) + v (1 byte)
	signature := make([]byte, 65)
	copy(signature[0:32], r[:])
	copy(signature[32:64], s[:])
	signature[64] = v

	return contractABI.Pack("mintWithAttestation", msg, signature)
}
