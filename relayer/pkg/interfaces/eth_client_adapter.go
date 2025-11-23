package interfaces

import (
	"context"
	"math/big"

	"github.com/ethereum/go-ethereum"
	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/core/types"
	"github.com/ethereum/go-ethereum/ethclient"
)

// EthClientAdapter wraps ethclient.Client to implement EthClient interface
type EthClientAdapter struct {
	client *ethclient.Client
}

// NewEthClientAdapter creates a new adapter wrapping an ethclient.Client
func NewEthClientAdapter(client *ethclient.Client) *EthClientAdapter {
	return &EthClientAdapter{client: client}
}

func (a *EthClientAdapter) BlockNumber(ctx context.Context) (uint64, error) {
	return a.client.BlockNumber(ctx)
}

func (a *EthClientAdapter) NetworkID(ctx context.Context) (*big.Int, error) {
	return a.client.NetworkID(ctx)
}

func (a *EthClientAdapter) PendingNonceAt(ctx context.Context, account common.Address) (uint64, error) {
	return a.client.PendingNonceAt(ctx, account)
}

func (a *EthClientAdapter) SuggestGasPrice(ctx context.Context) (*big.Int, error) {
	return a.client.SuggestGasPrice(ctx)
}

func (a *EthClientAdapter) EstimateGas(ctx context.Context, msg ethereum.CallMsg) (uint64, error) {
	return a.client.EstimateGas(ctx, msg)
}

func (a *EthClientAdapter) SendTransaction(ctx context.Context, tx *types.Transaction) error {
	return a.client.SendTransaction(ctx, tx)
}

func (a *EthClientAdapter) FilterLogs(ctx context.Context, q ethereum.FilterQuery) ([]types.Log, error) {
	return a.client.FilterLogs(ctx, q)
}

func (a *EthClientAdapter) SubscribeFilterLogs(ctx context.Context, q ethereum.FilterQuery, ch chan<- types.Log) (ethereum.Subscription, error) {
	return a.client.SubscribeFilterLogs(ctx, q, ch)
}

func (a *EthClientAdapter) Close() {
	a.client.Close()
}
