package contracts

import (
	"math/big"

	"github.com/ethereum/go-ethereum/accounts/abi"
	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/core/types"
)

// LockedEvent represents the Locked event from CollateralLocker
// event Locked(
//
//	address indexed borrower,
//	bytes32 indexed lockId,
//	uint256 amount,
//	uint256 sourceChainId,
//	uint64 validUntil,
//	bytes32 vcHash
//
// )
type LockedEvent struct {
	Borrower      common.Address
	LockId        [32]byte
	Amount        *big.Int
	SourceChainId *big.Int
	ValidUntil    uint64
	VcHash        [32]byte
	Raw           types.Log
}

// LockedEventSignature is the keccak256 hash of "Locked(address,bytes32,uint256,uint256,uint64,bytes32)"
var LockedEventSignature = common.HexToHash("0x4a0a9e0b14fa3c86e0b06f47ccc25def6ddd823474ba649c6a9490462ceac731")

// ParseLockedEvent extracts Locked event data from a log
func ParseLockedEvent(log types.Log, contractABI abi.ABI) (*LockedEvent, error) {
	event := new(LockedEvent)
	event.Raw = log

	// Parse indexed parameters from topics
	event.Borrower = common.BytesToAddress(log.Topics[1].Bytes())
	event.LockId = log.Topics[2]

	// Parse non-indexed parameters from data
	// data contains: amount (uint256), sourceChainId (uint256), validUntil (uint64), vcHash (bytes32)
	var eventData struct {
		Amount        *big.Int
		SourceChainId *big.Int
		ValidUntil    uint64
		VcHash        [32]byte
	}

	if err := contractABI.UnpackIntoInterface(&eventData, "Locked", log.Data); err != nil {
		return nil, err
	}

	event.Amount = eventData.Amount
	event.SourceChainId = eventData.SourceChainId
	event.ValidUntil = eventData.ValidUntil
	event.VcHash = eventData.VcHash

	return event, nil
}

// CollateralLockerABI is a minimal ABI for the CollateralLocker contract
const CollateralLockerABI = `[
	{
		"anonymous": false,
		"inputs": [
			{"indexed": true, "internalType": "address", "name": "borrower", "type": "address"},
			{"indexed": true, "internalType": "bytes32", "name": "lockId", "type": "bytes32"},
			{"indexed": false, "internalType": "uint256", "name": "amount", "type": "uint256"},
			{"indexed": false, "internalType": "uint256", "name": "sourceChainId", "type": "uint256"},
			{"indexed": false, "internalType": "uint64", "name": "validUntil", "type": "uint64"},
			{"indexed": false, "internalType": "bytes32", "name": "vcHash", "type": "bytes32"}
		],
		"name": "Locked",
		"type": "event"
	},
	{
		"inputs": [
			{"internalType": "address", "name": "recipient", "type": "address"},
			{"internalType": "uint256", "name": "amount", "type": "uint256"},
			{"internalType": "bytes32", "name": "lockId", "type": "bytes32"}
		],
		"name": "unlock",
		"outputs": [],
		"stateMutability": "nonpayable",
		"type": "function"
	}
]`
