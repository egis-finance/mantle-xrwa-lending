package interfaces

import (
	"context"
	"math/big"

	"github.com/ethereum/go-ethereum"
	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/core/types"
)

// EthClient abstracts ethereum client operations for testing
type EthClient interface {
	// Block operations
	BlockNumber(ctx context.Context) (uint64, error)
	NetworkID(ctx context.Context) (*big.Int, error)

	// Transaction operations
	PendingNonceAt(ctx context.Context, account common.Address) (uint64, error)
	SuggestGasPrice(ctx context.Context) (*big.Int, error)
	EstimateGas(ctx context.Context, msg ethereum.CallMsg) (uint64, error)
	SendTransaction(ctx context.Context, tx *types.Transaction) error

	// Contract read operations
	CallContract(ctx context.Context, msg ethereum.CallMsg, blockNumber *big.Int) ([]byte, error)

	// Log operations
	FilterLogs(ctx context.Context, q ethereum.FilterQuery) ([]types.Log, error)
	SubscribeFilterLogs(ctx context.Context, q ethereum.FilterQuery, ch chan<- types.Log) (ethereum.Subscription, error)

	// Connection management
	Close()
}
