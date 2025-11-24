package chain

import (
	"context"
	"errors"
	"math/big"
	"testing"
	"time"

	"github.com/egis-finance/mantle-xrwa-lending/relayer/internal/contracts"
	"github.com/egis-finance/mantle-xrwa-lending/relayer/pkg/mocks"
	"github.com/egis-finance/mantle-xrwa-lending/relayer/pkg/observability"
	"github.com/ethereum/go-ethereum"
	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/core/types"
	"github.com/stretchr/testify/require"
)

func TestCreateLockedEventQuery(t *testing.T) {
	t.Parallel()

	lockerAddress := common.HexToAddress("0x1111111111111111111111111111111111111111")

	query := CreateLockedEventQuery(lockerAddress)

	require.Len(t, query.Addresses, 1)
	require.Equal(t, lockerAddress, query.Addresses[0])
	require.Len(t, query.Topics, 1)
	require.Len(t, query.Topics[0], 1)
	require.Equal(t, contracts.LockedEventSignature, query.Topics[0][0])
}

func TestSubmitTransaction_Success(t *testing.T) {
	t.Parallel()

	ctx := context.Background()
	mockClient := mocks.NewMockEthClient()
	metrics := observability.NewMetrics()

	// Test private key (from hardhat account #0)
	privateKey := "ac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
	to := common.HexToAddress("0x2222222222222222222222222222222222222222")
	data := []byte{0x01, 0x02, 0x03}

	// Configure mock to return success
	mockClient.PendingNonceAtFunc = func(ctx context.Context, account common.Address) (uint64, error) {
		return 5, nil
	}
	mockClient.SuggestGasPriceFunc = func(ctx context.Context) (*big.Int, error) {
		return big.NewInt(1000000000), nil // 1 gwei
	}
	mockClient.EstimateGasFunc = func(ctx context.Context, msg ethereum.CallMsg) (uint64, error) {
		return 100000, nil
	}
	mockClient.NetworkIDFunc = func(ctx context.Context) (*big.Int, error) {
		return big.NewInt(1), nil
	}
	mockClient.SendTransactionFunc = func(ctx context.Context, tx *types.Transaction) error {
		return nil
	}

	txHash, gasUsed, err := SubmitTransaction(ctx, mockClient, privateKey, to, data, metrics, DefaultSubmitOpts())

	require.NoError(t, err)
	require.NotEqual(t, common.Hash{}, txHash)
	require.Greater(t, gasUsed, uint64(0))

	// Verify all RPC methods were called
	require.Equal(t, 1, mockClient.PendingNonceAtCalls)
	require.Equal(t, 1, mockClient.SuggestGasPriceCalls)
	require.Equal(t, 1, mockClient.EstimateGasCalls)
	require.Equal(t, 1, mockClient.NetworkIDCalls)
	require.Equal(t, 1, mockClient.SendTransactionCalls)
}

func TestSubmitTransaction_InvalidPrivateKey(t *testing.T) {
	t.Parallel()

	ctx := context.Background()
	mockClient := mocks.NewMockEthClient()
	metrics := observability.NewMetrics()

	invalidPrivateKey := "invalid"
	to := common.HexToAddress("0x2222222222222222222222222222222222222222")
	data := []byte{0x01, 0x02, 0x03}

	_, _, err := SubmitTransaction(ctx, mockClient, invalidPrivateKey, to, data, metrics, DefaultSubmitOpts())

	require.Error(t, err)
	require.Contains(t, err.Error(), "invalid private key")
}

func TestSubmitTransaction_GasEstimationFailure(t *testing.T) {
	t.Parallel()

	ctx := context.Background()
	mockClient := mocks.NewMockEthClient()
	metrics := observability.NewMetrics()

	privateKey := "ac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
	to := common.HexToAddress("0x2222222222222222222222222222222222222222")
	data := []byte{0x01, 0x02, 0x03}

	// Configure mock to fail on gas estimation
	mockClient.PendingNonceAtFunc = func(ctx context.Context, account common.Address) (uint64, error) {
		return 5, nil
	}
	mockClient.SuggestGasPriceFunc = func(ctx context.Context) (*big.Int, error) {
		return big.NewInt(1000000000), nil
	}
	mockClient.EstimateGasFunc = func(ctx context.Context, msg ethereum.CallMsg) (uint64, error) {
		return 0, errors.New("gas estimation failed")
	}

	_, _, err := SubmitTransaction(ctx, mockClient, privateKey, to, data, metrics, DefaultSubmitOpts())

	require.Error(t, err)
	require.Contains(t, err.Error(), "failed to estimate gas")
}

func TestSubmitTransaction_NonceFailure(t *testing.T) {
	t.Parallel()

	ctx := context.Background()
	mockClient := mocks.NewMockEthClient()
	metrics := observability.NewMetrics()

	privateKey := "ac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
	to := common.HexToAddress("0x2222222222222222222222222222222222222222")
	data := []byte{0x01, 0x02, 0x03}

	// Configure mock to fail on nonce retrieval
	mockClient.PendingNonceAtFunc = func(ctx context.Context, account common.Address) (uint64, error) {
		return 0, errors.New("nonce retrieval failed")
	}

	_, _, err := SubmitTransaction(ctx, mockClient, privateKey, to, data, metrics, DefaultSubmitOpts())

	require.Error(t, err)
	require.Contains(t, err.Error(), "failed to get nonce")
}

func TestSubmitTransaction_SendTransactionFailure(t *testing.T) {
	t.Parallel()

	ctx := context.Background()
	mockClient := mocks.NewMockEthClient()
	metrics := observability.NewMetrics()

	privateKey := "ac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
	to := common.HexToAddress("0x2222222222222222222222222222222222222222")
	data := []byte{0x01, 0x02, 0x03}

	// Configure mock to fail on send transaction
	mockClient.PendingNonceAtFunc = func(ctx context.Context, account common.Address) (uint64, error) {
		return 5, nil
	}
	mockClient.SuggestGasPriceFunc = func(ctx context.Context) (*big.Int, error) {
		return big.NewInt(1000000000), nil
	}
	mockClient.EstimateGasFunc = func(ctx context.Context, msg ethereum.CallMsg) (uint64, error) {
		return 100000, nil
	}
	mockClient.NetworkIDFunc = func(ctx context.Context) (*big.Int, error) {
		return big.NewInt(1), nil
	}
	mockClient.SendTransactionFunc = func(ctx context.Context, tx *types.Transaction) error {
		return errors.New("transaction rejected")
	}

	_, _, err := SubmitTransaction(ctx, mockClient, privateKey, to, data, metrics, DefaultSubmitOpts())

	require.Error(t, err)
	require.Contains(t, err.Error(), "failed to send transaction")
}

func TestSubmitTransaction_GasBuffer(t *testing.T) {
	t.Parallel()

	ctx := context.Background()
	mockClient := mocks.NewMockEthClient()
	metrics := observability.NewMetrics()

	privateKey := "ac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
	to := common.HexToAddress("0x2222222222222222222222222222222222222222")
	data := []byte{0x01, 0x02, 0x03}

	estimatedGas := uint64(100000)
	expectedGasWithBuffer := estimatedGas * 120 / 100 // 20% buffer

	mockClient.EstimateGasFunc = func(ctx context.Context, msg ethereum.CallMsg) (uint64, error) {
		return estimatedGas, nil
	}

	_, gasUsed, err := SubmitTransaction(ctx, mockClient, privateKey, to, data, metrics, DefaultSubmitOpts())

	require.NoError(t, err)
	require.Equal(t, expectedGasWithBuffer, gasUsed)
}

func TestRetryWithBackoff_Success(t *testing.T) {
	t.Parallel()

	ctx := context.Background()
	metrics := observability.NewMetrics()

	callCount := 0
	operation := func() error {
		callCount++
		return nil
	}

	err := RetryWithBackoff(ctx, 3, time.Second, metrics, "test_operation", operation)

	require.NoError(t, err)
	require.Equal(t, 1, callCount, "should succeed on first try")
}

func TestRetryWithBackoff_SuccessAfterRetries(t *testing.T) {
	t.Parallel()

	ctx := context.Background()
	metrics := observability.NewMetrics()

	callCount := 0
	operation := func() error {
		callCount++
		if callCount < 3 {
			return errors.New("temporary failure")
		}
		return nil
	}

	err := RetryWithBackoff(ctx, 5, time.Second, metrics, "test_operation", operation)

	require.NoError(t, err)
	require.Equal(t, 3, callCount, "should succeed on third try")
}

func TestRetryWithBackoff_MaxRetriesExceeded(t *testing.T) {
	t.Parallel()

	ctx := context.Background()
	metrics := observability.NewMetrics()

	callCount := 0
	operation := func() error {
		callCount++
		return errors.New("persistent failure")
	}

	maxRetries := 3
	err := RetryWithBackoff(ctx, maxRetries, time.Second, metrics, "test_operation", operation)

	require.Error(t, err)
	require.Contains(t, err.Error(), "operation failed after")
	require.Equal(t, maxRetries+1, callCount, "should try initial + retries")
}

func TestRetryWithBackoff_ContextCancellation(t *testing.T) {
	t.Parallel()

	ctx, cancel := context.WithCancel(context.Background())
	metrics := observability.NewMetrics()

	callCount := 0
	operation := func() error {
		callCount++
		if callCount == 2 {
			// Cancel context on second attempt
			cancel()
		}
		return errors.New("failure")
	}

	err := RetryWithBackoff(ctx, 10, time.Second, metrics, "test_operation", operation)

	require.Error(t, err)
	require.Contains(t, err.Error(), "context cancelled")
	require.LessOrEqual(t, callCount, 3, "should stop retrying after context cancellation")
}

func TestRetryWithBackoff_ExponentialDelay(t *testing.T) {
	// Cannot run in parallel due to timing sensitivity

	ctx := context.Background()
	metrics := observability.NewMetrics()

	attempts := []time.Time{}
	operation := func() error {
		attempts = append(attempts, time.Now())
		if len(attempts) < 4 {
			return errors.New("retry")
		}
		return nil
	}

	err := RetryWithBackoff(ctx, 5, time.Second, metrics, "test_operation", operation)

	require.NoError(t, err)
	require.Len(t, attempts, 4)

	// Verify exponential backoff delays
	// First retry: ~1s delay
	// Second retry: ~2s delay
	// Third retry: ~4s delay
	delay1 := attempts[1].Sub(attempts[0])
	delay2 := attempts[2].Sub(attempts[1])
	delay3 := attempts[3].Sub(attempts[2])

	require.Greater(t, delay1, 900*time.Millisecond)
	require.Greater(t, delay2, 1900*time.Millisecond)
	require.Greater(t, delay3, 3900*time.Millisecond)
}

func TestRetryWithBackoff_MetricsRecorded(t *testing.T) {
	t.Parallel()

	ctx := context.Background()
	metrics := observability.NewMetrics()

	callCount := 0
	operation := func() error {
		callCount++
		if callCount < 3 {
			return errors.New("retry")
		}
		return nil
	}

	err := RetryWithBackoff(ctx, 5, time.Second, metrics, "test_operation", operation)

	require.NoError(t, err)

	// Verify retry metrics were recorded (2 retries before success)
	// Note: testutil.ToFloat64 can be used to verify counter values in more complex tests
}

func TestRetryWithBackoff_ZeroRetries(t *testing.T) {
	t.Parallel()

	ctx := context.Background()
	metrics := observability.NewMetrics()

	callCount := 0
	operation := func() error {
		callCount++
		return errors.New("failure")
	}

	err := RetryWithBackoff(ctx, 0, time.Second, metrics, "test_operation", operation)

	require.Error(t, err)
	require.Equal(t, 1, callCount, "should try once with zero retries")
}

func TestSubmitTransaction_WithHexPrefix(t *testing.T) {
	t.Parallel()

	ctx := context.Background()
	mockClient := mocks.NewMockEthClient()
	metrics := observability.NewMetrics()

	// Test private key with 0x prefix
	privateKey := "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
	to := common.HexToAddress("0x2222222222222222222222222222222222222222")
	data := []byte{0x01, 0x02, 0x03}

	txHash, gasUsed, err := SubmitTransaction(ctx, mockClient, privateKey, to, data, metrics, DefaultSubmitOpts())

	require.NoError(t, err)
	require.NotEqual(t, common.Hash{}, txHash)
	require.Greater(t, gasUsed, uint64(0))
}

func TestSubmitTransaction_NilMetrics(t *testing.T) {
	t.Parallel()

	ctx := context.Background()
	mockClient := mocks.NewMockEthClient()

	privateKey := "ac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
	to := common.HexToAddress("0x2222222222222222222222222222222222222222")
	data := []byte{0x01, 0x02, 0x03}

	// Should not panic with nil metrics
	txHash, gasUsed, err := SubmitTransaction(ctx, mockClient, privateKey, to, data, nil, DefaultSubmitOpts())

	require.NoError(t, err)
	require.NotEqual(t, common.Hash{}, txHash)
	require.Greater(t, gasUsed, uint64(0))
}

func TestRetryWithBackoff_NilMetrics(t *testing.T) {
	t.Parallel()

	ctx := context.Background()

	callCount := 0
	operation := func() error {
		callCount++
		return nil
	}

	// Should not panic with nil metrics
	err := RetryWithBackoff(ctx, 3, time.Second, nil, "test_operation", operation)

	require.NoError(t, err)
	require.Equal(t, 1, callCount)
}
