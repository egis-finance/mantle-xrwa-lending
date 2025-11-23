package mocks

import (
	"context"
	"math/big"

	"github.com/ethereum/go-ethereum"
	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/core/types"
)

// MockEthClient is a mock implementation of interfaces.EthClient for testing
type MockEthClient struct {
	// Function mocks for controlling behavior
	BlockNumberFunc            func(ctx context.Context) (uint64, error)
	NetworkIDFunc              func(ctx context.Context) (*big.Int, error)
	PendingNonceAtFunc         func(ctx context.Context, account common.Address) (uint64, error)
	SuggestGasPriceFunc        func(ctx context.Context) (*big.Int, error)
	EstimateGasFunc            func(ctx context.Context, msg ethereum.CallMsg) (uint64, error)
	SendTransactionFunc        func(ctx context.Context, tx *types.Transaction) error
	FilterLogsFunc             func(ctx context.Context, q ethereum.FilterQuery) ([]types.Log, error)
	SubscribeFilterLogsFunc    func(ctx context.Context, q ethereum.FilterQuery, ch chan<- types.Log) (ethereum.Subscription, error)
	CloseFunc                  func()

	// Call counters for verification
	BlockNumberCalls            int
	NetworkIDCalls              int
	PendingNonceAtCalls         int
	SuggestGasPriceCalls        int
	EstimateGasCalls            int
	SendTransactionCalls        int
	FilterLogsCalls             int
	SubscribeFilterLogsCalls    int
	CloseCalls                  int
}

// NewMockEthClient creates a new mock client with default implementations
func NewMockEthClient() *MockEthClient {
	return &MockEthClient{
		BlockNumberFunc: func(ctx context.Context) (uint64, error) {
			return 1000, nil
		},
		NetworkIDFunc: func(ctx context.Context) (*big.Int, error) {
			return big.NewInt(1), nil
		},
		PendingNonceAtFunc: func(ctx context.Context, account common.Address) (uint64, error) {
			return 0, nil
		},
		SuggestGasPriceFunc: func(ctx context.Context) (*big.Int, error) {
			return big.NewInt(1000000000), nil // 1 gwei
		},
		EstimateGasFunc: func(ctx context.Context, msg ethereum.CallMsg) (uint64, error) {
			return 100000, nil
		},
		SendTransactionFunc: func(ctx context.Context, tx *types.Transaction) error {
			return nil
		},
		FilterLogsFunc: func(ctx context.Context, q ethereum.FilterQuery) ([]types.Log, error) {
			return []types.Log{}, nil
		},
		SubscribeFilterLogsFunc: func(ctx context.Context, q ethereum.FilterQuery, ch chan<- types.Log) (ethereum.Subscription, error) {
			return &MockSubscription{}, nil
		},
		CloseFunc: func() {},
	}
}

// BlockNumber implements interfaces.EthClient
func (m *MockEthClient) BlockNumber(ctx context.Context) (uint64, error) {
	m.BlockNumberCalls++
	if m.BlockNumberFunc != nil {
		return m.BlockNumberFunc(ctx)
	}
	return 1000, nil
}

// NetworkID implements interfaces.EthClient
func (m *MockEthClient) NetworkID(ctx context.Context) (*big.Int, error) {
	m.NetworkIDCalls++
	if m.NetworkIDFunc != nil {
		return m.NetworkIDFunc(ctx)
	}
	return big.NewInt(1), nil
}

// PendingNonceAt implements interfaces.EthClient
func (m *MockEthClient) PendingNonceAt(ctx context.Context, account common.Address) (uint64, error) {
	m.PendingNonceAtCalls++
	if m.PendingNonceAtFunc != nil {
		return m.PendingNonceAtFunc(ctx, account)
	}
	return 0, nil
}

// SuggestGasPrice implements interfaces.EthClient
func (m *MockEthClient) SuggestGasPrice(ctx context.Context) (*big.Int, error) {
	m.SuggestGasPriceCalls++
	if m.SuggestGasPriceFunc != nil {
		return m.SuggestGasPriceFunc(ctx)
	}
	return big.NewInt(1000000000), nil
}

// EstimateGas implements interfaces.EthClient
func (m *MockEthClient) EstimateGas(ctx context.Context, msg ethereum.CallMsg) (uint64, error) {
	m.EstimateGasCalls++
	if m.EstimateGasFunc != nil {
		return m.EstimateGasFunc(ctx, msg)
	}
	return 100000, nil
}

// SendTransaction implements interfaces.EthClient
func (m *MockEthClient) SendTransaction(ctx context.Context, tx *types.Transaction) error {
	m.SendTransactionCalls++
	if m.SendTransactionFunc != nil {
		return m.SendTransactionFunc(ctx, tx)
	}
	return nil
}

// FilterLogs implements interfaces.EthClient
func (m *MockEthClient) FilterLogs(ctx context.Context, q ethereum.FilterQuery) ([]types.Log, error) {
	m.FilterLogsCalls++
	if m.FilterLogsFunc != nil {
		return m.FilterLogsFunc(ctx, q)
	}
	return []types.Log{}, nil
}

// SubscribeFilterLogs implements interfaces.EthClient
func (m *MockEthClient) SubscribeFilterLogs(ctx context.Context, q ethereum.FilterQuery, ch chan<- types.Log) (ethereum.Subscription, error) {
	m.SubscribeFilterLogsCalls++
	if m.SubscribeFilterLogsFunc != nil {
		return m.SubscribeFilterLogsFunc(ctx, q, ch)
	}
	return &MockSubscription{}, nil
}

// Close implements interfaces.EthClient
func (m *MockEthClient) Close() {
	m.CloseCalls++
	if m.CloseFunc != nil {
		m.CloseFunc()
	}
}

// MockSubscription is a mock implementation of ethereum.Subscription
type MockSubscription struct {
	ErrChan chan error
	UnsubscribeCalls int
}

// Err returns the error channel
func (m *MockSubscription) Err() <-chan error {
	if m.ErrChan == nil {
		m.ErrChan = make(chan error)
	}
	return m.ErrChan
}

// Unsubscribe unsubscribes from the subscription
func (m *MockSubscription) Unsubscribe() {
	m.UnsubscribeCalls++
	if m.ErrChan != nil {
		close(m.ErrChan)
	}
}
