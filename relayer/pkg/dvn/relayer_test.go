package dvn

import (
	"context"
	"math/big"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/egis-finance/mantle-xrwa-lending/relayer/internal/contracts"
	"github.com/egis-finance/mantle-xrwa-lending/relayer/pkg/config"
	"github.com/egis-finance/mantle-xrwa-lending/relayer/pkg/interfaces"
	"github.com/egis-finance/mantle-xrwa-lending/relayer/pkg/mocks"
	"github.com/egis-finance/mantle-xrwa-lending/relayer/pkg/observability"
	"github.com/egis-finance/mantle-xrwa-lending/relayer/pkg/persistence"
	"github.com/ethereum/go-ethereum"
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
	_ = relayer.processLockedEvent(ctx, vLog)

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

func TestBackfillFromCursor_RangeValidation(t *testing.T) {
	t.Parallel()

	cfg := testConfig()
	mockMantle := mocks.NewMockEthClient()
	mockEth := mocks.NewMockEthClient()
	metrics := observability.NewMetrics()

	// Create temp file for persistence
	tmpFile, err := os.CreateTemp("", "test_cursor_*.json")
	require.NoError(t, err)
	defer func() { _ = tmpFile.Close() }()
	defer func() { _ = os.Remove(tmpFile.Name()) }()

	store, err := persistence.NewStore(tmpFile.Name())
	require.NoError(t, err)

	// Set cursor to currentBlock - 1 (edge case: range would be empty)
	currentBlock := uint64(1000)
	err = store.SetLastProcessedBlock(currentBlock - 1)
	require.NoError(t, err)

	mockMantle.BlockNumberFunc = func(ctx context.Context) (uint64, error) {
		return currentBlock, nil
	}
	mockMantle.FilterLogsFunc = func(ctx context.Context, q ethereum.FilterQuery) ([]types.Log, error) {
		t.Fatal("FilterLogs should not be called when range is invalid")
		return nil, nil
	}

	relayer, err := newTestRelayer(cfg, mockMantle, mockEth, store, metrics)
	require.NoError(t, err)

	// Should return nil without calling FilterLogs (range validation)
	ctx := context.Background()
	err = relayer.backfillFromCursor(ctx)
	require.NoError(t, err, "backfill should succeed when cursor at boundary")

	// Verify FilterLogs was NOT called
	require.Equal(t, 0, mockMantle.FilterLogsCalls, "FilterLogs should not be called for invalid range")
}

func TestBackfillFromCursor_FailureSetsCorrectCursor(t *testing.T) {
	t.Parallel()

	cfg := testConfig()
	cfg.Retry.MaxRetries = 1              // Reduce retries for faster test
	cfg.Retry.BaseRetryDelay = time.Millisecond // Speed up retry delay
	mockMantle := mocks.NewMockEthClient()
	mockEth := mocks.NewMockEthClient()
	metrics := observability.NewMetrics()

	// Create temp file for persistence
	tmpFile, err := os.CreateTemp("", "test_backfill_*.json")
	require.NoError(t, err)
	defer func() { _ = tmpFile.Close() }()
	defer func() { _ = os.Remove(tmpFile.Name()) }()

	store, err := persistence.NewStore(tmpFile.Name())
	require.NoError(t, err)

	// Set cursor to block 90, current block is 100
	initialCursor := uint64(90)
	currentBlock := uint64(100)
	failedBlock := uint64(95)

	err = store.SetLastProcessedBlock(initialCursor)
	require.NoError(t, err)

	mockMantle.BlockNumberFunc = func(ctx context.Context) (uint64, error) {
		return currentBlock, nil
	}

	borrower := common.HexToAddress("0x3333333333333333333333333333333333333333")
	lockId1 := common.HexToHash("0x1111")
	lockId2 := common.HexToHash("0x2222")

	// Return 3 logs in blocks 93, 95, 97 - middle one (95) will fail via SendTransaction error
	mockMantle.FilterLogsFunc = func(ctx context.Context, q ethereum.FilterQuery) ([]types.Log, error) {
		return []types.Log{
			{
				Address:     cfg.Mantle.LockerAddress,
				Topics:      []common.Hash{contracts.LockedEventSignature, common.BytesToHash(borrower.Bytes()), lockId1},
				Data:        createMockLockedEventData(),
				BlockNumber: 93,
				TxHash:      common.HexToHash("0xaaaa"),
			},
			{
				Address:     cfg.Mantle.LockerAddress,
				Topics:      []common.Hash{contracts.LockedEventSignature, common.BytesToHash(borrower.Bytes()), lockId2},
				Data:        createMockLockedEventData(),
				BlockNumber: failedBlock,
				TxHash:      common.HexToHash("0xbbbb"),
			},
			{
				Address:     cfg.Mantle.LockerAddress,
				Topics:      []common.Hash{contracts.LockedEventSignature, common.BytesToHash(borrower.Bytes()), common.HexToHash("0x3333")},
				Data:        createMockLockedEventData(),
				BlockNumber: 97,
				TxHash:      common.HexToHash("0xcccc"),
			},
		}, nil
	}

	// Make SendTransaction fail persistently for all attempts (fails all retries)
	mockEth.SendTransactionFunc = func(ctx context.Context, tx *types.Transaction) error {
		return context.DeadlineExceeded
	}

	relayer, err := newTestRelayer(cfg, mockMantle, mockEth, store, metrics)
	require.NoError(t, err)

	// Mark first event's lockId as already processed (so it succeeds via dedup)
	var lockIdBytes1 [32]byte
	copy(lockIdBytes1[:], lockId1.Bytes())
	relayer.mu.Lock()
	relayer.processedLocks[lockIdBytes1] = true
	relayer.mu.Unlock()

	// Run backfill - second event will fail (SendTransaction fails)
	ctx := context.Background()
	err = relayer.backfillFromCursor(ctx)
	// Backfill now returns error on partial failure to trigger polling fallback
	require.Error(t, err)
	require.Contains(t, err.Error(), "backfill failed at block")

	// Cursor should be set to failedBlock - 1 (block 94)
	// so next backfill retries from block 95
	expectedCursor := failedBlock - 1
	actualCursor := store.GetLastProcessedBlock()
	require.Equal(t, expectedCursor, actualCursor, "cursor should be set to block before failure")
}

func TestBackfillFromCursor_AllSucceedAdvancesToEnd(t *testing.T) {
	t.Parallel()

	cfg := testConfig()
	mockMantle := mocks.NewMockEthClient()
	mockEth := mocks.NewMockEthClient()
	metrics := observability.NewMetrics()

	// Create temp file for persistence
	tmpFile, err := os.CreateTemp("", "test_backfill_success_*.json")
	require.NoError(t, err)
	defer func() { _ = tmpFile.Close() }()
	defer func() { _ = os.Remove(tmpFile.Name()) }()

	store, err := persistence.NewStore(tmpFile.Name())
	require.NoError(t, err)

	// Set cursor to block 90, current block is 100
	initialCursor := uint64(90)
	currentBlock := uint64(100)

	err = store.SetLastProcessedBlock(initialCursor)
	require.NoError(t, err)

	mockMantle.BlockNumberFunc = func(ctx context.Context) (uint64, error) {
		return currentBlock, nil
	}

	borrower := common.HexToAddress("0x3333333333333333333333333333333333333333")

	// Return 2 logs, both will be "processed" (via dedup)
	lockId1 := common.HexToHash("0x1111")
	lockId2 := common.HexToHash("0x2222")

	mockMantle.FilterLogsFunc = func(ctx context.Context, q ethereum.FilterQuery) ([]types.Log, error) {
		return []types.Log{
			{
				Address:     cfg.Mantle.LockerAddress,
				Topics:      []common.Hash{contracts.LockedEventSignature, common.BytesToHash(borrower.Bytes()), lockId1},
				Data:        createMockLockedEventData(),
				BlockNumber: 93,
				TxHash:      common.HexToHash("0xaaaa"),
			},
			{
				Address:     cfg.Mantle.LockerAddress,
				Topics:      []common.Hash{contracts.LockedEventSignature, common.BytesToHash(borrower.Bytes()), lockId2},
				Data:        createMockLockedEventData(),
				BlockNumber: 95,
				TxHash:      common.HexToHash("0xbbbb"),
			},
		}, nil
	}

	relayer, err := newTestRelayer(cfg, mockMantle, mockEth, store, metrics)
	require.NoError(t, err)

	// Mark both events as already processed (so they succeed via dedup)
	var lockIdBytes1, lockIdBytes2 [32]byte
	copy(lockIdBytes1[:], lockId1.Bytes())
	copy(lockIdBytes2[:], lockId2.Bytes())
	relayer.mu.Lock()
	relayer.processedLocks[lockIdBytes1] = true
	relayer.processedLocks[lockIdBytes2] = true
	relayer.mu.Unlock()

	// Run backfill
	ctx := context.Background()
	err = relayer.backfillFromCursor(ctx)
	require.NoError(t, err)

	// Cursor should advance to currentBlock - 1 (end of range)
	expectedCursor := currentBlock - 1
	actualCursor := store.GetLastProcessedBlock()
	require.Equal(t, expectedCursor, actualCursor, "cursor should advance to end of range on success")
}

func TestPollingLoop_FailureRetriesWholeBlock(t *testing.T) {
	t.Parallel()

	cfg := testConfig()
	cfg.Retry.MaxRetries = 1
	cfg.Retry.BaseRetryDelay = time.Millisecond
	mockMantle := mocks.NewMockEthClient()
	mockEth := mocks.NewMockEthClient()
	metrics := observability.NewMetrics()

	// Create temp file for persistence
	tmpFile, err := os.CreateTemp("", "test_polling_*.json")
	require.NoError(t, err)
	defer func() { _ = tmpFile.Close() }()
	defer func() { _ = os.Remove(tmpFile.Name()) }()

	store, err := persistence.NewStore(tmpFile.Name())
	require.NoError(t, err)

	// Start with cursor at block 50
	initialCursor := uint64(50)
	latestBlock := uint64(60)
	failedBlock := uint64(55)

	err = store.SetLastProcessedBlock(initialCursor)
	require.NoError(t, err)

	// Track BlockNumber calls to control flow
	blockNumberCalls := 0
	mockMantle.BlockNumberFunc = func(ctx context.Context) (uint64, error) {
		blockNumberCalls++
		return latestBlock, nil
	}

	borrower := common.HexToAddress("0x4444444444444444444444444444444444444444")
	lockId1 := common.HexToHash("0x5555")
	lockId2 := common.HexToHash("0x6666")

	// Return logs at blocks 52, 55 (will fail), 58
	filterLogsCalls := 0
	mockMantle.FilterLogsFunc = func(ctx context.Context, q ethereum.FilterQuery) ([]types.Log, error) {
		filterLogsCalls++
		return []types.Log{
			{
				Address:     cfg.Mantle.LockerAddress,
				Topics:      []common.Hash{contracts.LockedEventSignature, common.BytesToHash(borrower.Bytes()), lockId1},
				Data:        createMockLockedEventData(),
				BlockNumber: 52,
				TxHash:      common.HexToHash("0xdddd"),
			},
			{
				Address:     cfg.Mantle.LockerAddress,
				Topics:      []common.Hash{contracts.LockedEventSignature, common.BytesToHash(borrower.Bytes()), lockId2},
				Data:        createMockLockedEventData(),
				BlockNumber: failedBlock,
				TxHash:      common.HexToHash("0xeeee"),
			},
		}, nil
	}

	// Fail transaction submission consistently
	mockEth.SendTransactionFunc = func(ctx context.Context, tx *types.Transaction) error {
		return context.DeadlineExceeded
	}

	relayer, err := newTestRelayer(cfg, mockMantle, mockEth, store, metrics)
	require.NoError(t, err)

	// Mark first event as already processed
	var lockIdBytes1 [32]byte
	copy(lockIdBytes1[:], lockId1.Bytes())
	relayer.mu.Lock()
	relayer.processedLocks[lockIdBytes1] = true
	relayer.mu.Unlock()

	// Run polling with timeout - needs enough time for at least one iteration (2s ticker + overhead)
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	// Run pollEvents in goroutine since it's blocking
	done := make(chan struct{})
	go func() {
		relayer.pollEvents(ctx)
		close(done)
	}()

	// Wait for context to expire
	<-ctx.Done()
	<-done

	// Verify cursor was set to failedBlock - 1
	// This ensures the next poll will retry the failed block
	expectedCursor := failedBlock - 1
	actualCursor := store.GetLastProcessedBlock()
	require.Equal(t, expectedCursor, actualCursor,
		"cursor should be set to block before failure so next poll retries failed block")
}

func TestCatchUpFromBlock_ClosesGap(t *testing.T) {
	t.Parallel()

	cfg := testConfig()
	cfg.Retry.MaxRetries = 1
	cfg.Retry.BaseRetryDelay = time.Millisecond
	mockMantle := mocks.NewMockEthClient()
	mockEth := mocks.NewMockEthClient()
	metrics := observability.NewMetrics()

	// Create temp file for persistence
	tmpFile, err := os.CreateTemp("", "test_catchup_*.json")
	require.NoError(t, err)
	defer func() { _ = tmpFile.Close() }()
	defer func() { _ = os.Remove(tmpFile.Name()) }()

	store, err := persistence.NewStore(tmpFile.Name())
	require.NoError(t, err)

	// Simulate gap: fromBlock=100, currentBlock=105
	fromBlock := uint64(100)
	currentBlock := uint64(105)

	mockMantle.BlockNumberFunc = func(ctx context.Context) (uint64, error) {
		return currentBlock, nil
	}

	borrower := common.HexToAddress("0x7777777777777777777777777777777777777777")
	lockId1 := common.HexToHash("0x8888")
	lockId2 := common.HexToHash("0x9999")

	// Return logs in the gap range [100, 105]
	filterLogsCalled := false
	mockMantle.FilterLogsFunc = func(ctx context.Context, q ethereum.FilterQuery) ([]types.Log, error) {
		filterLogsCalled = true
		// Verify correct range
		require.Equal(t, int64(fromBlock), q.FromBlock.Int64(), "FromBlock should match")
		require.Equal(t, int64(currentBlock), q.ToBlock.Int64(), "ToBlock should match")
		return []types.Log{
			{
				Address:     cfg.Mantle.LockerAddress,
				Topics:      []common.Hash{contracts.LockedEventSignature, common.BytesToHash(borrower.Bytes()), lockId1},
				Data:        createMockLockedEventData(),
				BlockNumber: 101,
				TxHash:      common.HexToHash("0xaaaa"),
			},
			{
				Address:     cfg.Mantle.LockerAddress,
				Topics:      []common.Hash{contracts.LockedEventSignature, common.BytesToHash(borrower.Bytes()), lockId2},
				Data:        createMockLockedEventData(),
				BlockNumber: 103,
				TxHash:      common.HexToHash("0xbbbb"),
			},
		}, nil
	}

	relayer, err := newTestRelayer(cfg, mockMantle, mockEth, store, metrics)
	require.NoError(t, err)

	// Mark both events as already processed (so dedup skips them - simulating overlap)
	var lockIdBytes1, lockIdBytes2 [32]byte
	copy(lockIdBytes1[:], lockId1.Bytes())
	copy(lockIdBytes2[:], lockId2.Bytes())
	relayer.mu.Lock()
	relayer.processedLocks[lockIdBytes1] = true
	relayer.processedLocks[lockIdBytes2] = true
	relayer.mu.Unlock()

	// Run catch-up
	ctx := context.Background()
	err = relayer.catchUpFromBlock(ctx, fromBlock)
	require.NoError(t, err)

	// Verify FilterLogs was called with correct range
	require.True(t, filterLogsCalled, "FilterLogs should be called for catch-up range")
}

func TestBackfillFromCursor_FailureReturnsError(t *testing.T) {
	t.Parallel()

	cfg := testConfig()
	cfg.Retry.MaxRetries = 1
	cfg.Retry.BaseRetryDelay = time.Millisecond
	mockMantle := mocks.NewMockEthClient()
	mockEth := mocks.NewMockEthClient()
	metrics := observability.NewMetrics()

	// Create temp file for persistence
	tmpFile, err := os.CreateTemp("", "test_backfill_err_*.json")
	require.NoError(t, err)
	defer func() { _ = tmpFile.Close() }()
	defer func() { _ = os.Remove(tmpFile.Name()) }()

	store, err := persistence.NewStore(tmpFile.Name())
	require.NoError(t, err)

	// Set cursor to block 50, current block is 60
	err = store.SetLastProcessedBlock(50)
	require.NoError(t, err)

	mockMantle.BlockNumberFunc = func(ctx context.Context) (uint64, error) {
		return 60, nil
	}

	borrower := common.HexToAddress("0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa")
	lockId := common.HexToHash("0xbbbb")

	mockMantle.FilterLogsFunc = func(ctx context.Context, q ethereum.FilterQuery) ([]types.Log, error) {
		return []types.Log{
			{
				Address:     cfg.Mantle.LockerAddress,
				Topics:      []common.Hash{contracts.LockedEventSignature, common.BytesToHash(borrower.Bytes()), lockId},
				Data:        createMockLockedEventData(),
				BlockNumber: 55,
				TxHash:      common.HexToHash("0xcccc"),
			},
		}, nil
	}

	// Make SendTransaction fail
	mockEth.SendTransactionFunc = func(ctx context.Context, tx *types.Transaction) error {
		return context.DeadlineExceeded
	}

	relayer, err := newTestRelayer(cfg, mockMantle, mockEth, store, metrics)
	require.NoError(t, err)

	// Run backfill - should now return error on failure
	ctx := context.Background()
	err = relayer.backfillFromCursor(ctx)
	require.Error(t, err, "backfill should return error on failure")
	require.Contains(t, err.Error(), "backfill failed at block 55")

	// Cursor should be set to failedBlock - 1
	expectedCursor := uint64(54)
	actualCursor := store.GetLastProcessedBlock()
	require.Equal(t, expectedCursor, actualCursor)
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
