package dvn

import (
	"context"
	"fmt"
	"math/big"
	"strings"
	"sync"
	"time"

	"github.com/egis-finance/mantle-xrwa-lending/relayer/internal/contracts"
	"github.com/egis-finance/mantle-xrwa-lending/relayer/pkg/chain"
	"github.com/egis-finance/mantle-xrwa-lending/relayer/pkg/config"
	"github.com/egis-finance/mantle-xrwa-lending/relayer/pkg/interfaces"
	"github.com/egis-finance/mantle-xrwa-lending/relayer/pkg/logger"
	"github.com/egis-finance/mantle-xrwa-lending/relayer/pkg/observability"
	"github.com/egis-finance/mantle-xrwa-lending/relayer/pkg/persistence"
	"github.com/ethereum/go-ethereum"
	"github.com/ethereum/go-ethereum/accounts/abi"
	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/core/types"
	"github.com/ethereum/go-ethereum/ethclient"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/trace"
)

// Relayer monitors Mantle for Locked events and submits attestations to Ethereum
type Relayer struct {
	cfg            *config.Config
	mantleClient   interfaces.EthClient
	ethereumClient interfaces.EthClient
	signer         *EIP712Signer
	lockerABI      abi.ABI
	receiverABI    abi.ABI
	store          *persistence.Store
	metrics        *observability.Metrics

	// Track processed lock IDs in memory (redundant with persistence for fast lookups)
	processedLocks map[[32]byte]bool
	mu             sync.RWMutex

	// Performance metrics
	eventCount    uint64
	lastEventTime time.Time

	// Health status
	healthyMantle bool
	healthyEth    bool
	healthMu      sync.RWMutex
}

// NewRelayer creates a new DVN relayer instance
func NewRelayer(cfg *config.Config, metrics *observability.Metrics) (*Relayer, error) {
	// Connect to Mantle
	mantleRawClient, err := ethclient.Dial(cfg.Mantle.RPCURL)
	if err != nil {
		return nil, fmt.Errorf("failed to connect to Mantle: %w", err)
	}
	mantleClient := interfaces.NewEthClientAdapter(mantleRawClient)

	// Connect to Ethereum
	ethereumRawClient, err := ethclient.Dial(cfg.Ethereum.RPCURL)
	if err != nil {
		return nil, fmt.Errorf("failed to connect to Ethereum: %w", err)
	}
	ethereumClient := interfaces.NewEthClientAdapter(ethereumRawClient)

	// Initialize EIP-712 signer
	signer, err := NewEIP712Signer(
		cfg.DVN.PrivateKey,
		cfg.Ethereum.ReceiverAddress,
		cfg.Ethereum.ChainID,
	)
	if err != nil {
		return nil, fmt.Errorf("failed to create signer: %w", err)
	}

	// Parse ABIs
	lockerABI, err := abi.JSON(strings.NewReader(contracts.CollateralLockerABI))
	if err != nil {
		return nil, fmt.Errorf("failed to parse locker ABI: %w", err)
	}

	receiverABI, err := abi.JSON(strings.NewReader(contracts.XRWAReceiverABI))
	if err != nil {
		return nil, fmt.Errorf("failed to parse receiver ABI: %w", err)
	}

	// Initialize persistence store (fatal if enabled but fails)
	var store *persistence.Store
	if cfg.Persistence.Enabled {
		var err error
		store, err = persistence.NewStore(cfg.Persistence.FilePath)
		if err != nil {
			return nil, fmt.Errorf("persistence enabled but failed to initialize: %w", err)
		}
		logger.Infow("Persistence enabled", "file", cfg.Persistence.FilePath, "previously_processed", store.Count())
	}

	logger.Infow("DVN relayer initialized",
		"dvn_address", signer.GetSignerAddress(),
		"mantle_locker", cfg.Mantle.LockerAddress,
		"ethereum_receiver", cfg.Ethereum.ReceiverAddress,
		"max_retries", cfg.Retry.MaxRetries,
		"persistence_enabled", cfg.Persistence.Enabled,
	)

	relayer := &Relayer{
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
	}

	// Load previously processed locks into memory map (mutex for safety during future refactoring)
	if store != nil {
		relayer.mu.Lock()
		for _, lock := range store.GetAllProcessed() {
			lockIdBytes := common.FromHex(lock.LockId)
			if len(lockIdBytes) == 32 {
				var lockIdArray [32]byte
				copy(lockIdArray[:], lockIdBytes)
				relayer.processedLocks[lockIdArray] = true
			}
		}
		relayer.mu.Unlock()
		logger.Infow("Loaded processed locks from persistence", "count", len(relayer.processedLocks))
	}

	return relayer, nil
}

// Start begins monitoring for Locked events
func (r *Relayer) Start(ctx context.Context) error {
	logger.Info("Starting event monitoring on Mantle")

	// Initial health check to set baseline status
	r.performHealthCheck(ctx)

	// Start health check goroutine
	if r.cfg.Retry.HealthCheckInterval > 0 {
		go r.runHealthChecks(ctx)
	}

	// Start event monitoring
	go r.monitorEvents(ctx)

	return nil
}

// Stop gracefully shuts down the relayer
func (r *Relayer) Stop(ctx context.Context) error {
	logger.Info("Stopping relayer...")

	// Flush persistence before closing connections
	if r.store != nil {
		if err := r.store.Flush(); err != nil {
			logger.Errorw("Failed to flush persistence on shutdown", "error", err)
		} else {
			logger.Info("Persistence flushed successfully")
		}
	}

	r.mantleClient.Close()
	r.ethereumClient.Close()
	return nil
}

// monitorEvents subscribes to Locked events with automatic reconnection
func (r *Relayer) monitorEvents(ctx context.Context) {
	backoff := r.cfg.Retry.BaseRetryDelay
	if backoff == 0 {
		backoff = time.Second
	}
	maxBackoff := 30 * time.Second

	for {
		select {
		case <-ctx.Done():
			return
		default:
		}

		err := r.runSubscription(ctx)
		if err == nil {
			return // Clean shutdown via context cancellation
		}

		logger.Warnw("Subscription failed, retrying with backoff", "chain", "mantle",
			"error", err, "backoff", backoff)
		r.metrics.RPCErrorsTotal.WithLabelValues("mantle", "subscription").Inc()

		select {
		case <-ctx.Done():
			return
		case <-time.After(backoff):
			// Exponential backoff capped at maxBackoff
			backoff = backoff * 2
			if backoff > maxBackoff {
				backoff = maxBackoff
			}
		}
	}
}

// runSubscription attempts to subscribe and process events, returns error on failure
func (r *Relayer) runSubscription(ctx context.Context) error {
	// 1. Snapshot current block BEFORE backfill to close the gap later
	gapStartBlock, err := r.getLatestBlock(ctx)
	if err != nil {
		logger.Warnw("Failed to get block for gap tracking, gap may exist", "error", err)
		gapStartBlock = 0 // Will skip catch-up if we couldn't get the block
	}

	// 2. Backfill from cursor - on failure, fall back to polling (has retry semantics)
	if err := r.backfillFromCursor(ctx); err != nil {
		logger.Warnw("Backfill failed, falling back to polling mode",
			"chain", "mantle",
			"error", err,
		)
		r.pollEvents(ctx) // Cursor already at failedBlock-1, polling retries from there
		return nil
	}

	query := chain.CreateLockedEventQuery(r.cfg.Mantle.LockerAddress)

	// 3. Start subscription for real-time events
	logs := make(chan types.Log, 100) // Buffer prevents blocking during catch-up
	sub, err := r.mantleClient.SubscribeFilterLogs(ctx, query, logs)
	if err != nil {
		logger.Errorw("Failed to subscribe to logs, falling back to polling", "error", err)
		r.metrics.RPCErrorsTotal.WithLabelValues("mantle", "subscribe_filter_logs").Inc()
		// Fallback to polling mode
		r.pollEvents(ctx)
		return nil // pollEvents handles its own loop until context done
	}
	defer sub.Unsubscribe()

	logger.Infow("Subscribed to Locked events", "contract", r.cfg.Mantle.LockerAddress)

	// 5. Start log consumer goroutine - drains events while catch-up runs
	// This prevents buffer overflow if many events arrive during catch-up
	logsDone := make(chan struct{})
	go func() {
		defer close(logsDone)
		for vLog := range logs {
			processCtx, cancel := context.WithTimeout(ctx, 2*time.Minute)
			_ = r.processLockedEvent(processCtx, vLog)
			cancel()
		}
	}()

	// 6. Catch-up query to close gap between backfill end and subscription start
	// Runs concurrently with log draining - dedup handles any overlap
	if gapStartBlock > 0 {
		if err := r.catchUpFromBlock(ctx, gapStartBlock); err != nil {
			logger.Warnw("Catch-up failed, falling back to polling mode",
				"chain", "mantle",
				"from_block", gapStartBlock,
				"error", err,
			)
			sub.Unsubscribe() // Closes logs channel, goroutine will exit
			<-logsDone        // Wait for goroutine to finish draining
			r.pollEvents(ctx) // Polling has retry semantics from cursor
			return nil
		}
	}

	// 7. Wait for subscription error or context cancellation
	// Log consumer goroutine continues processing events in parallel
	select {
	case <-ctx.Done():
		// Context cancelled - sub.Unsubscribe() called via defer, closes logs channel
		<-logsDone // Wait for goroutine to finish
		return nil
	case err := <-sub.Err():
		// Subscription error - goroutine will exit when logs channel closes
		<-logsDone
		return fmt.Errorf("subscription error: %w", err)
	}
}

// backfillFromCursor processes missed events between the persisted cursor and current block.
// Called on subscription startup to catch events missed during downtime.
func (r *Relayer) backfillFromCursor(ctx context.Context) error {
	if r.store == nil {
		return nil // No persistence, nothing to backfill
	}

	cursor := r.store.GetLastProcessedBlock()
	if cursor == 0 {
		return nil // First run, no backfill needed
	}

	// Get current block
	var currentBlock uint64
	blockCtx, cancel := context.WithTimeout(ctx, 30*time.Second)
	err := chain.RetryWithBackoff(blockCtx, r.cfg.Retry.MaxRetries, r.cfg.Retry.BaseRetryDelay, r.metrics, "get_block_number", func() error {
		var blockErr error
		currentBlock, blockErr = r.mantleClient.BlockNumber(blockCtx)
		return blockErr
	})
	cancel()

	if err != nil {
		return fmt.Errorf("failed to get current block: %w", err)
	}

	// Guard against underflow when currentBlock == 0 (genesis or chain reset)
	if currentBlock == 0 {
		return nil
	}

	// Range validation: cursor+1 to currentBlock-1 must be valid
	// If cursor >= currentBlock-1, range would be empty or invalid
	if cursor >= currentBlock-1 {
		return nil // Already caught up or would create invalid range
	}

	logger.Infow("Backfilling missed events",
		"chain", "mantle",
		"from_block", cursor+1,
		"to_block", currentBlock-1,
	)

	// Query historical logs
	query := chain.CreateLockedEventQuery(r.cfg.Mantle.LockerAddress)
	query.FromBlock = big.NewInt(int64(cursor + 1))
	query.ToBlock = big.NewInt(int64(currentBlock - 1))

	var logs []types.Log
	logsCtx, logsCancel := context.WithTimeout(ctx, 60*time.Second)
	err = chain.RetryWithBackoff(logsCtx, r.cfg.Retry.MaxRetries, r.cfg.Retry.BaseRetryDelay, r.metrics, "filter_logs", func() error {
		var filterErr error
		logs, filterErr = r.mantleClient.FilterLogs(logsCtx, query)
		return filterErr
	})
	logsCancel()

	if err != nil {
		return fmt.Errorf("failed to filter backfill logs: %w", err)
	}

	if len(logs) == 0 {
		logger.Infow("No missed events to backfill", "chain", "mantle")
		if err := r.store.SetLastProcessedBlock(currentBlock - 1); err != nil {
			logger.Warnw("Failed to update cursor after empty backfill", "error", err)
		}
		return nil
	}

	logger.Infow("Processing backfill events", "chain", "mantle", "count", len(logs))

	// Process events - on failure, set cursor to retry entire failed block
	var failedBlock uint64
	hasFailure := false

	for _, vLog := range logs {
		if err := r.processLockedEvent(ctx, vLog); err != nil {
			logger.Errorw("Backfill event failed, will retry block on next startup",
				"chain", "mantle",
				"block", vLog.BlockNumber,
				"error", err,
			)
			failedBlock = uint64(vLog.BlockNumber)
			hasFailure = true
			break
		}
	}

	// Set cursor: block before failure (to retry), or end of range (all succeeded)
	if hasFailure {
		if failedBlock > 0 {
			cursorBlock := failedBlock - 1
			if err := r.store.SetLastProcessedBlock(cursorBlock); err != nil {
				logger.Warnw("Failed to persist backfill cursor", "error", err, "block", cursorBlock)
			}
		}
		// Cursor set for retry; return error to signal partial failure
		return fmt.Errorf("backfill failed at block %d", failedBlock)
	}

	// All succeeded: advance to end of queried range
	if err := r.store.SetLastProcessedBlock(currentBlock - 1); err != nil {
		logger.Warnw("Failed to persist backfill cursor", "error", err, "block", currentBlock-1)
	}
	return nil
}

// pollEvents uses cursor-based polling with persistence
func (r *Relayer) pollEvents(ctx context.Context) {
	query := chain.CreateLockedEventQuery(r.cfg.Mantle.LockerAddress)

	// Load cursor from persistence, or initialize to current block
	fromBlock := r.getInitialFromBlock(ctx)
	logger.Infow("Polling mode active", "chain", "mantle", "starting_block", fromBlock)

	for {
		// Wait for new blocks
		latestBlock, err := r.waitForNewBlock(ctx, fromBlock)
		if err != nil {
			if ctx.Err() != nil {
				return // Context cancelled, clean shutdown
			}
			logger.Errorw("Error waiting for new block", "error", err)
			continue
		}

		// Query logs from cursor to latest
		query.FromBlock = big.NewInt(int64(fromBlock))
		query.ToBlock = big.NewInt(int64(latestBlock))

		var logs []types.Log
		logsCtx, logsCancel := context.WithTimeout(ctx, 30*time.Second)
		err = chain.RetryWithBackoff(logsCtx, r.cfg.Retry.MaxRetries, r.cfg.Retry.BaseRetryDelay, r.metrics, "filter_logs", func() error {
			var filterErr error
			logs, filterErr = r.mantleClient.FilterLogs(logsCtx, query)
			if filterErr != nil {
				r.metrics.RPCErrorsTotal.WithLabelValues("mantle", "filter_logs").Inc()
			} else {
				r.metrics.RPCCallsTotal.WithLabelValues("mantle", "filter_logs").Inc()
			}
			return filterErr
		})
		logsCancel()

		if err != nil {
			logger.Errorw("Failed to filter logs after retries", "chain", "mantle", "chain", "mantle",
			"error", err, "from", fromBlock, "to", latestBlock)
			continue
		}

		if len(logs) > 0 {
			logger.Infow("Found lock events in block range",
				"chain", "mantle",
				"from_block", fromBlock,
				"to_block", latestBlock,
				"event_count", len(logs),
			)
		} else {
			logger.Debugw("No events in block range", "chain", "mantle", "from", fromBlock, "to", latestBlock)
		}

		// Process events - on failure, retry entire failed block (dedup handles repeats)
		var failedBlock uint64
		hasFailure := false

		for _, vLog := range logs {
			if err := r.processLockedEvent(ctx, vLog); err != nil {
				logger.Errorw("Event processing failed, will retry entire block",
					"chain", "mantle",
					"block", vLog.BlockNumber,
					"error", err,
				)
				failedBlock = uint64(vLog.BlockNumber)
				hasFailure = true
				break
			}
		}

		// Cursor advancement: retry whole failed block, or advance past range
		if hasFailure {
			// Set cursor to block BEFORE failure so next poll includes failed block
			if failedBlock > 0 {
				cursorBlock := failedBlock - 1
				fromBlock = failedBlock // Next poll starts from failed block
				if r.store != nil {
					if err := r.store.SetLastProcessedBlock(cursorBlock); err != nil {
						logger.Errorw("Failed to persist block cursor",
							"chain", "mantle",
							"error", err,
							"block", cursorBlock,
						)
					}
				}
			}
			// failedBlock == 0: don't advance cursor, retry from current fromBlock
		} else {
			// All succeeded (or no logs): advance past the queried range
			fromBlock = latestBlock + 1
			if r.store != nil {
				if err := r.store.SetLastProcessedBlock(latestBlock); err != nil {
					logger.Errorw("Failed to persist block cursor",
						"chain", "mantle",
						"error", err,
						"block", latestBlock,
					)
				}
			}
		}
	}
}

// getInitialFromBlock returns the starting block for polling
func (r *Relayer) getInitialFromBlock(ctx context.Context) uint64 {
	// Try to load from persistence
	if r.store != nil {
		cursor := r.store.GetLastProcessedBlock()
		if cursor > 0 {
			logger.Infow("Resuming from persisted cursor", "chain", "mantle", "block", cursor)
			return cursor + 1
		}
	}

	// First run: start from current block
	blockCtx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()

	var latestBlock uint64
	err := chain.RetryWithBackoff(blockCtx, r.cfg.Retry.MaxRetries, r.cfg.Retry.BaseRetryDelay, r.metrics, "get_latest_block", func() error {
		var blockErr error
		latestBlock, blockErr = r.mantleClient.BlockNumber(blockCtx)
		if blockErr != nil {
			r.metrics.RPCErrorsTotal.WithLabelValues("mantle", "block_number").Inc()
		} else {
			r.metrics.RPCCallsTotal.WithLabelValues("mantle", "block_number").Inc()
		}
		return blockErr
	})

	if err != nil {
		logger.Warnw("Failed to get current block, starting from 0", "chain", "mantle", "error", err)
		return 0
	}

	logger.Infow("First run, starting from current block", "chain", "mantle", "block", latestBlock)
	return latestBlock
}

// getLatestBlock fetches the current block number from Mantle with retry
func (r *Relayer) getLatestBlock(ctx context.Context) (uint64, error) {
	blockCtx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()

	var latestBlock uint64
	err := chain.RetryWithBackoff(blockCtx, r.cfg.Retry.MaxRetries, r.cfg.Retry.BaseRetryDelay, r.metrics, "get_latest_block", func() error {
		var blockErr error
		latestBlock, blockErr = r.mantleClient.BlockNumber(blockCtx)
		if blockErr != nil {
			r.metrics.RPCErrorsTotal.WithLabelValues("mantle", "block_number").Inc()
		} else {
			r.metrics.RPCCallsTotal.WithLabelValues("mantle", "block_number").Inc()
		}
		return blockErr
	})

	if err != nil {
		return 0, fmt.Errorf("failed to get latest block: %w", err)
	}
	return latestBlock, nil
}

// catchUpFromBlock queries and processes logs from fromBlock to latest.
// Used to close the gap between backfill end and subscription start.
// Deduplication (memory + persistence) handles any overlap with already-processed events.
func (r *Relayer) catchUpFromBlock(ctx context.Context, fromBlock uint64) error {
	// Get current block for the range upper bound
	currentBlock, err := r.getLatestBlock(ctx)
	if err != nil {
		return fmt.Errorf("failed to get current block for catch-up: %w", err)
	}

	// Nothing to catch up if we're already past or at current
	if fromBlock > currentBlock {
		return nil
	}

	logger.Infow("Catching up events after backfill",
		"chain", "mantle",
		"from_block", fromBlock,
		"to_block", currentBlock,
	)

	query := chain.CreateLockedEventQuery(r.cfg.Mantle.LockerAddress)
	query.FromBlock = big.NewInt(int64(fromBlock))
	query.ToBlock = big.NewInt(int64(currentBlock))

	var logs []types.Log
	logsCtx, logsCancel := context.WithTimeout(ctx, 60*time.Second)
	err = chain.RetryWithBackoff(logsCtx, r.cfg.Retry.MaxRetries, r.cfg.Retry.BaseRetryDelay, r.metrics, "filter_logs", func() error {
		var filterErr error
		logs, filterErr = r.mantleClient.FilterLogs(logsCtx, query)
		return filterErr
	})
	logsCancel()

	if err != nil {
		return fmt.Errorf("failed to filter catch-up logs: %w", err)
	}

	if len(logs) == 0 {
		logger.Debugw("No events in catch-up range", "chain", "mantle")
		return nil
	}

	logger.Infow("Processing catch-up events", "chain", "mantle", "count", len(logs))

	// Process each log - stop on first failure to trigger polling fallback
	for _, vLog := range logs {
		processCtx, cancel := context.WithTimeout(ctx, 2*time.Minute)
		if err := r.processLockedEvent(processCtx, vLog); err != nil {
			cancel()
			logger.Warnw("Failed to process catch-up event",
				"chain", "mantle",
				"block", vLog.BlockNumber,
				"error", err,
			)
			// Return error so caller can fall back to polling (has retry semantics)
			return fmt.Errorf("catch-up failed at block %d: %w", vLog.BlockNumber, err)
		}
		cancel()
	}

	return nil
}

// waitForNewBlock blocks until a new block is available or context is cancelled
func (r *Relayer) waitForNewBlock(ctx context.Context, lastProcessedBlock uint64) (uint64, error) {
	ticker := time.NewTicker(2 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return 0, ctx.Err()
		case <-ticker.C:
			blockCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
			current, err := r.mantleClient.BlockNumber(blockCtx)
			cancel()

			if err != nil {
				r.metrics.RPCErrorsTotal.WithLabelValues("mantle", "block_number").Inc()
				logger.Warnw("Failed to get block number while waiting", "chain", "mantle", "error", err)
				continue
			}

			r.metrics.RPCCallsTotal.WithLabelValues("mantle", "block_number").Inc()

			if current >= lastProcessedBlock {
				return current, nil
			}
		}
	}
}

// processLockedEvent handles a single Locked event
func (r *Relayer) processLockedEvent(ctx context.Context, vLog types.Log) error {
	startTime := time.Now()

	// Start parent tracing span
	spanCtx, span := observability.StartSpan(ctx, "relayer", "processLockedEvent",
		trace.WithAttributes(
			attribute.String("tx_hash", vLog.TxHash.Hex()),
			attribute.Int64("block_number", int64(vLog.BlockNumber)),
		),
	)
	defer span.End()

	// Parse the event
	event, err := contracts.ParseLockedEvent(vLog, r.lockerABI)
	if err != nil {
		logger.Errorw("Failed to parse Locked event",
			"chain", "mantle",
			"error", err,
			"tx", vLog.TxHash,
			"block", vLog.BlockNumber,
		)
		r.metrics.LocksFailed.Inc()
		observability.RecordError(spanCtx, err)
		return fmt.Errorf("failed to parse Locked event: %w", err)
	}

	// Add event details to span
	span.SetAttributes(
		attribute.String("lock_id", common.Bytes2Hex(event.LockId[:])),
		attribute.String("borrower", event.Borrower.Hex()),
		attribute.String("amount", event.Amount.String()),
	)

	// Check if already processed (memory-first for speed)
	r.mu.RLock()
	alreadyProcessed := r.processedLocks[event.LockId]
	r.mu.RUnlock()

	if alreadyProcessed {
		logger.Debugw("Lock already processed (memory cache)", "lock_id", common.Bytes2Hex(event.LockId[:]))
		r.metrics.LocksDuplicate.Inc()
		return nil // Skip is intentional, not a failure
	}

	// Double-check persistence store
	if r.store != nil && r.store.IsProcessed(event.LockId) {
		logger.Debugw("Lock already processed (persistence)", "lock_id", common.Bytes2Hex(event.LockId[:]))
		r.mu.Lock()
		r.processedLocks[event.LockId] = true
		r.mu.Unlock()
		r.metrics.LocksDuplicate.Inc()
		return nil // Skip is intentional, not a failure
	}

	// Check on-chain consumed status (authoritative source of truth)
	// This handles cases where persistence was lost but minting already occurred
	consumed, err := r.isConsumedOnChain(spanCtx, event.LockId)
	if err != nil {
		logger.Warnw("Failed to check on-chain consumed status, proceeding with submission",
			"chain", "mantle",
			"error", err,
			"lock_id", common.Bytes2Hex(event.LockId[:]),
		)
	} else if consumed {
		logger.Infow("Lock already consumed on-chain, marking as processed",
			"lock_id", common.Bytes2Hex(event.LockId[:]),
		)
		r.mu.Lock()
		r.processedLocks[event.LockId] = true
		r.mu.Unlock()
		r.metrics.LocksDuplicate.Inc()
		return nil // Already consumed, skip is intentional
	}

	r.mu.Lock()
	r.eventCount++
	r.lastEventTime = time.Now()
	r.mu.Unlock()

	logger.Infow("New lock detected",
		"chain", "mantle",
		"borrower", event.Borrower,
		"lock_id", common.Bytes2Hex(event.LockId[:]),
		"amount", event.Amount,
		"source_chain_id", event.SourceChainId,
		"valid_until", event.ValidUntil,
		"vc_hash", common.Bytes2Hex(event.VcHash[:]),
		"tx", vLog.TxHash,
		"block", vLog.BlockNumber,
		"event_index", vLog.Index,
	)

	// Create LockMessage
	lockMsg := contracts.LockMessage{
		Borrower:      event.Borrower,
		LockId:        event.LockId,
		Amount:        event.Amount,
		SourceChainId: event.SourceChainId,
		SourceLocker:  r.cfg.Mantle.LockerAddress,
		ValidUntil:    event.ValidUntil,
		VcHash:        event.VcHash,
	}

	// Sign the message with retry and tracing
	signStart := time.Now()
	signCtx, signSpan := observability.StartSpan(spanCtx, "relayer", "signLockMessage",
		trace.WithAttributes(
			attribute.String("lock_id", common.Bytes2Hex(event.LockId[:])),
		),
	)

	var v uint8
	var rSig, sSig [32]byte
	err = chain.RetryWithBackoff(signCtx, 3, r.cfg.Retry.BaseRetryDelay, r.metrics, "sign_lock_message", func() error {
		var err error
		v, rSig, sSig, err = r.signer.SignLockMessage(lockMsg)
		return err
	})

	signSpan.End()
	r.metrics.SignatureDuration.Observe(time.Since(signStart).Seconds())

	if err != nil {
		logger.Errorw("Failed to sign lock message after retries",
			"chain", "mantle",
			"error", err,
			"lock_id", common.Bytes2Hex(event.LockId[:]),
		)
		r.metrics.LocksFailed.Inc()
		observability.RecordError(spanCtx, err)
		return fmt.Errorf("failed to sign lock message: %w", err)
	}

	logger.Infow("Lock message signed",
		"lock_id", common.Bytes2Hex(event.LockId[:]),
		"v", v,
		"signer", r.signer.GetSignerAddress(),
	)

	// Submit attestation to Ethereum with retry and tracing
	submitCtx, submitSpan := observability.StartSpan(spanCtx, "relayer", "submitAttestation",
		trace.WithAttributes(
			attribute.String("lock_id", common.Bytes2Hex(event.LockId[:])),
		),
	)

	var ethTxHash common.Hash
	err = chain.RetryWithBackoff(submitCtx, r.cfg.Retry.MaxRetries, r.cfg.Retry.BaseRetryDelay, r.metrics, "submit_attestation", func() error {
		var err error
		ethTxHash, err = r.submitAttestationWithHash(submitCtx, lockMsg, v, rSig, sSig)
		return err
	})

	submitSpan.End()

	if err != nil {
		logger.Errorw("Failed to submit attestation after retries",
			"chain", "mantle",
			"error", err,
			"lock_id", common.Bytes2Hex(event.LockId[:]),
		)
		r.metrics.LocksFailed.Inc()
		observability.RecordError(spanCtx, err)
		return fmt.Errorf("failed to submit attestation: %w", err)
	}

	// Mark as processed in memory
	r.mu.Lock()
	r.processedLocks[event.LockId] = true
	r.mu.Unlock()

	// Persist to disk
	if r.store != nil {
		if err := r.store.MarkProcessed(
			event.LockId,
			event.Borrower,
			event.Amount.String(),
			event.SourceChainId.String(),
			vLog.TxHash,
			ethTxHash,
			vLog.BlockNumber,
		); err != nil {
			logger.Warnw("Failed to persist processed lock",
				"chain", "mantle",
			"error", err,
				"lock_id", common.Bytes2Hex(event.LockId[:]),
			)
		}
	}

	processingTime := time.Since(startTime)
	r.metrics.ProcessingDuration.Observe(processingTime.Seconds())
	r.metrics.LocksProcessed.Inc()

	logger.Infow("Attestation submitted successfully",
		"lock_id", common.Bytes2Hex(event.LockId[:]),
		"borrower", event.Borrower,
		"eth_tx", ethTxHash,
		"processing_time", processingTime,
		"total_processed", r.eventCount,
	)

	return nil
}

// submitAttestationWithHash sends the signed attestation and returns the transaction hash
func (r *Relayer) submitAttestationWithHash(ctx context.Context, msg contracts.LockMessage, v uint8, rSig, sSig [32]byte) (common.Hash, error) {
	// Pack the function call
	data, err := contracts.PackMintWithAttestation(r.receiverABI, msg, v, rSig, sSig)
	if err != nil {
		return common.Hash{}, fmt.Errorf("failed to pack function call: %w", err)
	}

	logger.Debugw("Submitting attestation transaction",
		"receiver", r.cfg.Ethereum.ReceiverAddress,
		"data_size", len(data),
	)

	// Submit transaction using chain helper
	txHash, gasUsed, err := chain.SubmitTransaction(
		ctx,
		r.ethereumClient,
		r.cfg.DVN.PrivateKey,
		r.cfg.Ethereum.ReceiverAddress,
		data,
		r.metrics,
		chain.SubmitTransactionOpts{
			RPCTimeout:       r.cfg.Retry.RPCTimeout,
			GasBufferPercent: r.cfg.Relayer.GasBufferPercent,
		},
	)
	if err != nil {
		return common.Hash{}, fmt.Errorf("failed to submit transaction: %w", err)
	}

	// Record gas used
	if gasUsed > 0 {
		r.metrics.GasUsed.WithLabelValues("mint_with_attestation").Observe(float64(gasUsed))
	}

	logger.Infow("Attestation transaction submitted",
		"tx_hash", txHash,
		"receiver", r.cfg.Ethereum.ReceiverAddress,
		"gas_used", gasUsed,
	)

	return txHash, nil
}

// runHealthChecks periodically checks connection health
func (r *Relayer) runHealthChecks(ctx context.Context) {
	ticker := time.NewTicker(time.Duration(r.cfg.Retry.HealthCheckInterval) * time.Second)
	defer ticker.Stop()

	logger.Infow("Health checks started", "interval", fmt.Sprintf("%ds", r.cfg.Retry.HealthCheckInterval))

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			r.performHealthCheck(ctx)
		}
	}
}

// performHealthCheck checks connectivity to both chains
func (r *Relayer) performHealthCheck(ctx context.Context) {
	checkCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	// Check both chain connections
	mantleBlock, mantleErr := r.mantleClient.BlockNumber(checkCtx)
	ethBlock, ethErr := r.ethereumClient.BlockNumber(checkCtx)

	r.updateHealthStatus("mantle", mantleErr == nil, mantleBlock, mantleErr)
	r.updateHealthStatus("ethereum", ethErr == nil, ethBlock, ethErr)

	// Log periodic performance metrics
	r.logPerformanceMetrics()
}

// updateHealthStatus updates health state and metrics for a chain
func (r *Relayer) updateHealthStatus(chain string, healthy bool, block uint64, err error) {
	r.healthMu.Lock()
	defer r.healthMu.Unlock()

	status := 0.0
	if healthy {
		status = 1.0
	}

	if chain == "mantle" {
		r.healthyMantle = healthy
	} else {
		r.healthyEth = healthy
	}
	r.metrics.HealthCheckStatus.WithLabelValues(chain).Set(status)

	if err != nil {
		logger.Warnw("Health check failed", "chain", chain, "error", err)
	} else {
		logger.Debugw("Health check OK", "chain", chain, "latest_block", block)
	}
}

// logPerformanceMetrics logs periodic relayer statistics
func (r *Relayer) logPerformanceMetrics() {
	r.mu.RLock()
	eventCount := r.eventCount
	lastEventTime := r.lastEventTime
	r.mu.RUnlock()

	if eventCount > 0 {
		timeSinceLastEvent := time.Since(lastEventTime)
		logger.Infow("Relayer metrics",
			"total_processed", eventCount,
			"time_since_last_event", timeSinceLastEvent,
			"persistence_enabled", r.store != nil,
		)
	}
}

// IsHealthy implements observability.HealthChecker interface
func (r *Relayer) IsHealthy(ctx context.Context) bool {
	// Healthy if no critical errors (always true for now, can be enhanced)
	return true
}

// IsReady implements observability.HealthChecker interface
func (r *Relayer) IsReady(ctx context.Context) bool {
	r.healthMu.RLock()
	defer r.healthMu.RUnlock()

	// Ready if both RPC connections are healthy
	return r.healthyMantle && r.healthyEth
}

// GetStats implements observability.HealthChecker interface
func (r *Relayer) GetStats() map[string]interface{} {
	r.mu.RLock()
	eventCount := r.eventCount
	lastEventTime := r.lastEventTime
	r.mu.RUnlock()

	r.healthMu.RLock()
	healthyMantle := r.healthyMantle
	healthyEth := r.healthyEth
	r.healthMu.RUnlock()

	stats := map[string]interface{}{
		"event_count":         eventCount,
		"last_event_time":     lastEventTime.Format(time.RFC3339),
		"mantle_healthy":      healthyMantle,
		"ethereum_healthy":    healthyEth,
		"persistence_enabled": r.store != nil,
	}

	if r.store != nil {
		stats["persistence_count"] = r.store.Count()
	}

	return stats
}

// isConsumedOnChain checks if a lockId has already been consumed on Ethereum
// This is the authoritative source of truth for whether AcUSDY was minted
func (r *Relayer) isConsumedOnChain(ctx context.Context, lockId [32]byte) (bool, error) {
	// Pack the consumed(bytes32) call
	data, err := r.receiverABI.Pack("consumed", lockId)
	if err != nil {
		return false, fmt.Errorf("failed to pack consumed call: %w", err)
	}

	// Call the contract
	receiverAddr := r.cfg.Ethereum.ReceiverAddress
	callMsg := ethereum.CallMsg{
		To:   &receiverAddr,
		Data: data,
	}
	result, err := r.ethereumClient.CallContract(ctx, callMsg, nil)
	if err != nil {
		return false, fmt.Errorf("failed to call consumed: %w", err)
	}

	// Unpack the result
	var consumed bool
	err = r.receiverABI.UnpackIntoInterface(&consumed, "consumed", result)
	if err != nil {
		return false, fmt.Errorf("failed to unpack consumed result: %w", err)
	}

	return consumed, nil
}
