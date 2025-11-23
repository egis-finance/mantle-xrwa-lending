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
	healthyMantle  bool
	healthyEth     bool
	healthMu       sync.RWMutex
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

	// Initialize persistence store
	var store *persistence.Store
	if cfg.Persistence.Enabled {
		var err error
		store, err = persistence.NewStore(cfg.Persistence.FilePath)
		if err != nil {
			logger.Warnw("Failed to initialize persistence store, continuing without persistence", "error", err)
		} else {
			logger.Infow("Persistence enabled", "file", cfg.Persistence.FilePath, "previously_processed", store.Count())
		}
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

	// Load previously processed locks into memory map
	if store != nil {
		for _, lock := range store.GetAllProcessed() {
			lockIdBytes := common.FromHex(lock.LockId)
			if len(lockIdBytes) == 32 {
				var lockIdArray [32]byte
				copy(lockIdArray[:], lockIdBytes)
				relayer.processedLocks[lockIdArray] = true
			}
		}
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
	r.mantleClient.Close()
	r.ethereumClient.Close()
	return nil
}

// monitorEvents subscribes to Locked events and processes them
func (r *Relayer) monitorEvents(ctx context.Context) {
	query := chain.CreateLockedEventQuery(r.cfg.Mantle.LockerAddress)

	// Subscribe to new logs
	logs := make(chan types.Log)
	sub, err := r.mantleClient.SubscribeFilterLogs(ctx, query, logs)
	if err != nil {
		logger.Errorw("Failed to subscribe to logs", "error", err)
		r.metrics.RPCErrorsTotal.WithLabelValues("mantle", "subscribe_filter_logs").Inc()
		// Fallback to polling if subscription fails
		r.pollEvents(ctx)
		return
	}
	defer sub.Unsubscribe()

	logger.Infow("Subscribed to Locked events", "contract", r.cfg.Mantle.LockerAddress)

	for {
		select {
		case <-ctx.Done():
			return
		case err := <-sub.Err():
			logger.Errorw("Subscription error", "error", err)
			r.metrics.RPCErrorsTotal.WithLabelValues("mantle", "subscription").Inc()
			// Attempt to resubscribe
			time.Sleep(5 * time.Second)
			r.monitorEvents(ctx)
			return
		case vLog := <-logs:
			r.processLockedEvent(ctx, vLog)
		}
	}
}

// pollEvents falls back to polling when subscription isn't available
func (r *Relayer) pollEvents(ctx context.Context) {
	ticker := time.NewTicker(12 * time.Second)
	defer ticker.Stop()

	query := chain.CreateLockedEventQuery(r.cfg.Mantle.LockerAddress)
	fromBlock := uint64(0)

	logger.Infow("Polling mode active", "interval", "12s", "starting_block", fromBlock)

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			// Get latest block with retry and timeout
			var latestBlock uint64
			blockCtx, blockCancel := context.WithTimeout(ctx, 30*time.Second)
			err := chain.RetryWithBackoff(blockCtx, r.cfg.Retry.MaxRetries, r.metrics, "get_latest_block", func() error {
				var err error
				latestBlock, err = r.mantleClient.BlockNumber(blockCtx)
				if err != nil {
					r.metrics.RPCErrorsTotal.WithLabelValues("mantle", "block_number").Inc()
				} else {
					r.metrics.RPCCallsTotal.WithLabelValues("mantle", "block_number").Inc()
				}
				return err
			})
			blockCancel()

			if err != nil {
				logger.Errorw("Failed to get latest block after retries", "error", err)
				continue
			}

			if fromBlock == 0 {
				// Start from recent blocks to avoid scanning entire history
				if latestBlock > 100 {
					fromBlock = latestBlock - 100
				}
				logger.Infow("Starting block scan", "from_block", fromBlock, "to_block", latestBlock)
			}

			// Skip if no new blocks to process
			if fromBlock > latestBlock {
				logger.Debugw("No new blocks to process", "from", fromBlock, "latest", latestBlock)
				continue
			}

			// Query logs from last processed block to latest
			query.FromBlock = big.NewInt(int64(fromBlock))
			query.ToBlock = big.NewInt(int64(latestBlock))

			var logs []types.Log
			logsCtx, logsCancel := context.WithTimeout(ctx, 30*time.Second)
			err = chain.RetryWithBackoff(logsCtx, r.cfg.Retry.MaxRetries, r.metrics, "filter_logs", func() error {
				var err error
				logs, err = r.mantleClient.FilterLogs(logsCtx, query)
				if err != nil {
					r.metrics.RPCErrorsTotal.WithLabelValues("mantle", "filter_logs").Inc()
				} else {
					r.metrics.RPCCallsTotal.WithLabelValues("mantle", "filter_logs").Inc()
				}
				return err
			})
			logsCancel()

			if err != nil {
				logger.Errorw("Failed to filter logs after retries", "error", err, "from", fromBlock, "to", latestBlock)
				continue
			}

			if len(logs) > 0 {
				logger.Infow("Found lock events in block range",
					"from_block", fromBlock,
					"to_block", latestBlock,
					"event_count", len(logs),
				)
			} else {
				logger.Debugw("No events in block range", "from", fromBlock, "to", latestBlock)
			}

			for _, vLog := range logs {
				r.processLockedEvent(ctx, vLog)
			}

			fromBlock = latestBlock + 1
		}
	}
}

// processLockedEvent handles a single Locked event
func (r *Relayer) processLockedEvent(ctx context.Context, vLog types.Log) {
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
			"error", err,
			"tx", vLog.TxHash,
			"block", vLog.BlockNumber,
		)
		r.metrics.LocksFailed.Inc()
		observability.RecordError(spanCtx, err)
		return
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
		return
	}

	// Double-check persistence store
	if r.store != nil && r.store.IsProcessed(event.LockId) {
		logger.Debugw("Lock already processed (persistence)", "lock_id", common.Bytes2Hex(event.LockId[:]))
		r.mu.Lock()
		r.processedLocks[event.LockId] = true
		r.mu.Unlock()
		r.metrics.LocksDuplicate.Inc()
		return
	}

	r.mu.Lock()
	r.eventCount++
	r.lastEventTime = time.Now()
	r.mu.Unlock()

	logger.Infow("New lock detected",
		"borrower", event.Borrower,
		"lock_id", common.Bytes2Hex(event.LockId[:]),
		"amount", event.Amount,
		"chain_id", event.SourceChainId,
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
	err = chain.RetryWithBackoff(signCtx, 3, r.metrics, "sign_lock_message", func() error {
		var err error
		v, rSig, sSig, err = r.signer.SignLockMessage(lockMsg)
		return err
	})

	signSpan.End()
	r.metrics.SignatureDuration.Observe(time.Since(signStart).Seconds())

	if err != nil {
		logger.Errorw("Failed to sign lock message after retries",
			"error", err,
			"lock_id", common.Bytes2Hex(event.LockId[:]),
		)
		r.metrics.LocksFailed.Inc()
		observability.RecordError(spanCtx, err)
		return
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
	err = chain.RetryWithBackoff(submitCtx, r.cfg.Retry.MaxRetries, r.metrics, "submit_attestation", func() error {
		var err error
		ethTxHash, err = r.submitAttestationWithHash(submitCtx, lockMsg, v, rSig, sSig)
		return err
	})

	submitSpan.End()

	if err != nil {
		logger.Errorw("Failed to submit attestation after retries",
			"error", err,
			"lock_id", common.Bytes2Hex(event.LockId[:]),
		)
		r.metrics.LocksFailed.Inc()
		observability.RecordError(spanCtx, err)
		return
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

	// Check Mantle connection
	mantleBlock, err := r.mantleClient.BlockNumber(checkCtx)
	r.healthMu.Lock()
	if err != nil {
		r.healthyMantle = false
		r.metrics.HealthCheckStatus.WithLabelValues("mantle").Set(0)
		logger.Warnw("Mantle health check failed", "error", err)
	} else {
		r.healthyMantle = true
		r.metrics.HealthCheckStatus.WithLabelValues("mantle").Set(1)
		logger.Debugw("Mantle health check OK", "latest_block", mantleBlock)
	}
	r.healthMu.Unlock()

	// Check Ethereum connection
	ethBlock, err := r.ethereumClient.BlockNumber(checkCtx)
	r.healthMu.Lock()
	if err != nil {
		r.healthyEth = false
		r.metrics.HealthCheckStatus.WithLabelValues("ethereum").Set(0)
		logger.Warnw("Ethereum health check failed", "error", err)
	} else {
		r.healthyEth = true
		r.metrics.HealthCheckStatus.WithLabelValues("ethereum").Set(1)
		logger.Debugw("Ethereum health check OK", "latest_block", ethBlock)
	}
	r.healthMu.Unlock()

	// Log performance metrics
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
		"event_count":          eventCount,
		"last_event_time":      lastEventTime.Format(time.RFC3339),
		"mantle_healthy":       healthyMantle,
		"ethereum_healthy":     healthyEth,
		"persistence_enabled":  r.store != nil,
	}

	if r.store != nil {
		stats["persistence_count"] = r.store.Count()
	}

	return stats
}
