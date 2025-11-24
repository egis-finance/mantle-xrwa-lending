package dvn

import (
	"context"
	"math/big"
	"strings"
	"testing"
	"time"

	"github.com/egis-finance/mantle-xrwa-lending/relayer/internal/contracts"
	"github.com/egis-finance/mantle-xrwa-lending/relayer/pkg/config"
	"github.com/egis-finance/mantle-xrwa-lending/relayer/pkg/interfaces"
	"github.com/egis-finance/mantle-xrwa-lending/relayer/pkg/mocks"
	"github.com/egis-finance/mantle-xrwa-lending/relayer/pkg/observability"
	"github.com/egis-finance/mantle-xrwa-lending/relayer/pkg/persistence"
	"github.com/ethereum/go-ethereum/accounts/abi"
	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/core/types"
	"github.com/stretchr/testify/require"
)

// newTestRelayer creates a relayer instance for testing with mock clients
func newTestRelayer(
	cfg *config.Config,
	mantleClient interfaces.EthClient,
	ethereumClient interfaces.EthClient,
	store *persistence.Store,
	metrics *observability.Metrics,
) (*Relayer, error) {
	// Initialize EIP-712 signer
	signer, err := NewEIP712Signer(
		cfg.DVN.PrivateKey,
		cfg.Ethereum.ReceiverAddress,
		cfg.Ethereum.ChainID,
	)
	if err != nil {
		return nil, err
	}

	// Parse ABIs
	lockerABI, err := abi.JSON(strings.NewReader(contracts.CollateralLockerABI))
	if err != nil {
		return nil, err
	}

	receiverABI, err := abi.JSON(strings.NewReader(contracts.XRWAReceiverABI))
	if err != nil {
		return nil, err
	}

	return &Relayer{
		cfg:            cfg,
		mantleClient:   mantleClient,
		ethereumClient: ethereumClient,
		signer:         signer,
		lockerABI:      lockerABI,
		receiverABI:    receiverABI,
		store:          store,
		metrics:        metrics,
		processedLocks: make(map[[32]byte]bool),
		eventCount:     0,
		lastEventTime:  time.Now(),
		healthyMantle:  false,
		healthyEth:     false,
	}, nil
}

// testConfig returns a minimal config for testing
func testConfig() *config.Config {
	return &config.Config{
		Mantle: config.ChainConfig{
			ChainID:       big.NewInt(5000),
			RPCURL:        "http://localhost:8545",
			LockerAddress: common.HexToAddress("0x1111111111111111111111111111111111111111"),
		},
		Ethereum: config.ChainConfig{
			ChainID:         big.NewInt(1),
			RPCURL:          "http://localhost:8546",
			ReceiverAddress: common.HexToAddress("0x2222222222222222222222222222222222222222"),
		},
		DVN: config.DVNConfig{
			PrivateKey: "ac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
			Address:    common.HexToAddress("0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"),
		},
		Retry: config.RetryConfig{
			MaxRetries:          3,
			EnableBackoff:       true,
			HealthCheckInterval: 30,
			BaseRetryDelay:      time.Second,
			RPCTimeout:          5 * time.Second,
		},
		Relayer: config.RelayerConfig{
			PollInterval:     12 * time.Second,
			BlockLookback:    100,
			GasBufferPercent: 20,
		},
		Persistence: config.PersistenceConfig{
			Enabled: false,
		},
	}
}

func TestNewTestRelayer_Success(t *testing.T) {
	t.Parallel()

	cfg := testConfig()
	mockMantle := mocks.NewMockEthClient()
	mockEth := mocks.NewMockEthClient()
	metrics := observability.NewMetrics()

	relayer, err := newTestRelayer(cfg, mockMantle, mockEth, nil, metrics)

	require.NoError(t, err)
	require.NotNil(t, relayer)
	require.NotNil(t, relayer.signer)
	require.Equal(t, cfg.DVN.Address, relayer.signer.GetSignerAddress())
}

func TestNewTestRelayer_InvalidPrivateKey(t *testing.T) {
	t.Parallel()

	cfg := testConfig()
	cfg.DVN.PrivateKey = "invalid-key"

	mockMantle := mocks.NewMockEthClient()
	mockEth := mocks.NewMockEthClient()
	metrics := observability.NewMetrics()

	_, err := newTestRelayer(cfg, mockMantle, mockEth, nil, metrics)

	require.Error(t, err)
}

func TestProcessLockedEvent_DuplicateInMemory(t *testing.T) {
	t.Parallel()

	cfg := testConfig()
	mockMantle := mocks.NewMockEthClient()
	mockEth := mocks.NewMockEthClient()
	metrics := observability.NewMetrics()

	relayer, err := newTestRelayer(cfg, mockMantle, mockEth, nil, metrics)
	require.NoError(t, err)

	// Pre-mark a lock ID as processed
	lockIdHash := common.HexToHash("0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef")
	var lockId [32]byte
	copy(lockId[:], lockIdHash.Bytes())

	relayer.mu.Lock()
	relayer.processedLocks[lockId] = true
	relayer.mu.Unlock()

	borrower := common.HexToAddress("0x3333333333333333333333333333333333333333")

	// Create a mock log with the same lock ID
	// Topics: [0] = event sig, [1] = borrower (indexed), [2] = lockId (indexed)
	vLog := types.Log{
		Address: cfg.Mantle.LockerAddress,
		Topics: []common.Hash{
			contracts.LockedEventSignature,
			common.BytesToHash(borrower.Bytes()),
			lockIdHash,
		},
		Data:        createMockLockedEventData(),
		BlockNumber: 12345,
		TxHash:      common.HexToHash("0xaaaa"),
	}

	ctx := context.Background()
	relayer.processLockedEvent(ctx, vLog)

	// Verify duplicate counter incremented (lock was skipped)
	require.Equal(t, uint64(0), relayer.eventCount, "duplicate should not increment event count")
}

func TestHealthCheck_BothHealthy(t *testing.T) {
	t.Parallel()

	cfg := testConfig()
	mockMantle := mocks.NewMockEthClient()
	mockEth := mocks.NewMockEthClient()
	metrics := observability.NewMetrics()

	// Configure mocks to return successful block numbers
	mockMantle.BlockNumberFunc = func(ctx context.Context) (uint64, error) {
		return 1000, nil
	}
	mockEth.BlockNumberFunc = func(ctx context.Context) (uint64, error) {
		return 2000, nil
	}

	relayer, err := newTestRelayer(cfg, mockMantle, mockEth, nil, metrics)
	require.NoError(t, err)

	// Perform health check
	ctx := context.Background()
	relayer.performHealthCheck(ctx)

	// Verify health status
	require.True(t, relayer.IsReady(ctx))

	// Verify stats
	stats := relayer.GetStats()
	require.True(t, stats["mantle_healthy"].(bool))
	require.True(t, stats["ethereum_healthy"].(bool))
}

func TestHealthCheck_MantleUnhealthy(t *testing.T) {
	t.Parallel()

	cfg := testConfig()
	mockMantle := mocks.NewMockEthClient()
	mockEth := mocks.NewMockEthClient()
	metrics := observability.NewMetrics()

	// Configure Mantle to fail, Ethereum to succeed
	mockMantle.BlockNumberFunc = func(ctx context.Context) (uint64, error) {
		return 0, context.DeadlineExceeded
	}
	mockEth.BlockNumberFunc = func(ctx context.Context) (uint64, error) {
		return 2000, nil
	}

	relayer, err := newTestRelayer(cfg, mockMantle, mockEth, nil, metrics)
	require.NoError(t, err)

	ctx := context.Background()
	relayer.performHealthCheck(ctx)

	// Ready should be false since Mantle is unhealthy
	require.False(t, relayer.IsReady(ctx))

	stats := relayer.GetStats()
	require.False(t, stats["mantle_healthy"].(bool))
	require.True(t, stats["ethereum_healthy"].(bool))
}

func TestGetStats_ReturnsExpectedFields(t *testing.T) {
	t.Parallel()

	cfg := testConfig()
	mockMantle := mocks.NewMockEthClient()
	mockEth := mocks.NewMockEthClient()
	metrics := observability.NewMetrics()

	relayer, err := newTestRelayer(cfg, mockMantle, mockEth, nil, metrics)
	require.NoError(t, err)

	// Simulate some activity
	relayer.mu.Lock()
	relayer.eventCount = 42
	relayer.lastEventTime = time.Now().Add(-5 * time.Minute)
	relayer.mu.Unlock()

	stats := relayer.GetStats()

	require.Contains(t, stats, "event_count")
	require.Contains(t, stats, "last_event_time")
	require.Contains(t, stats, "mantle_healthy")
	require.Contains(t, stats, "ethereum_healthy")
	require.Contains(t, stats, "persistence_enabled")
	require.Equal(t, uint64(42), stats["event_count"])
	require.False(t, stats["persistence_enabled"].(bool))
}

func TestIsHealthy_AlwaysTrue(t *testing.T) {
	t.Parallel()

	cfg := testConfig()
	mockMantle := mocks.NewMockEthClient()
	mockEth := mocks.NewMockEthClient()
	metrics := observability.NewMetrics()

	relayer, err := newTestRelayer(cfg, mockMantle, mockEth, nil, metrics)
	require.NoError(t, err)

	ctx := context.Background()
	require.True(t, relayer.IsHealthy(ctx))
}

// createMockLockedEventData creates mock ABI-encoded event data for a Locked event
// Non-indexed fields: amount (uint256), sourceChainId (uint256), validUntil (uint64), vcHash (bytes32)
func createMockLockedEventData() []byte {
	data := make([]byte, 128) // 4 fields * 32 bytes

	// amount (1000)
	amount := big.NewInt(1000)
	amountBytes := common.LeftPadBytes(amount.Bytes(), 32)
	copy(data[0:32], amountBytes)

	// sourceChainId (5000)
	chainId := big.NewInt(5000)
	chainIdBytes := common.LeftPadBytes(chainId.Bytes(), 32)
	copy(data[32:64], chainIdBytes)

	// validUntil (future timestamp) - uint64 is still 32-byte padded in ABI
	validUntil := big.NewInt(time.Now().Add(24 * time.Hour).Unix())
	validUntilBytes := common.LeftPadBytes(validUntil.Bytes(), 32)
	copy(data[64:96], validUntilBytes)

	// vcHash (zeros)
	copy(data[96:128], make([]byte, 32))

	return data
}
