package dvn

import (
	"context"
	"fmt"
	"math/big"
	"strings"
	"time"

	"github.com/egis-finance/mantle-xrwa-lending/relayer/internal/contracts"
	"github.com/egis-finance/mantle-xrwa-lending/relayer/pkg/chain"
	"github.com/egis-finance/mantle-xrwa-lending/relayer/pkg/config"
	"github.com/egis-finance/mantle-xrwa-lending/relayer/pkg/persistence"
	"github.com/ethereum/go-ethereum/accounts/abi"
	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/core/types"
	"github.com/ethereum/go-ethereum/ethclient"
	"github.com/ethereum/go-ethereum/log"
)

// Relayer monitors Mantle for Locked events and submits attestations to Ethereum
type Relayer struct {
	cfg            *config.Config
	mantleClient   *ethclient.Client
	ethereumClient *ethclient.Client
	signer         *EIP712Signer
	lockerABI      abi.ABI
	receiverABI    abi.ABI
	store          *persistence.Store

	// Track processed lock IDs in memory (redundant with persistence for fast lookups)
	processedLocks map[[32]byte]bool

	// Performance metrics
	eventCount     uint64
	lastEventTime  time.Time
}

// NewRelayer creates a new DVN relayer instance
func NewRelayer(cfg *config.Config) (*Relayer, error) {
	// Connect to Mantle
	mantleClient, err := ethclient.Dial(cfg.Mantle.RPCURL)
	if err != nil {
		return nil, fmt.Errorf("failed to connect to Mantle: %w", err)
	}

	// Connect to Ethereum
	ethereumClient, err := ethclient.Dial(cfg.Ethereum.RPCURL)
	if err != nil {
		return nil, fmt.Errorf("failed to connect to Ethereum: %w", err)
	}

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
			log.Warn("Failed to initialize persistence store, continuing without persistence", "error", err)
		} else {
			log.Info("Persistence enabled", "file", cfg.Persistence.FilePath, "previously_processed", store.Count())
		}
	}

	log.Info("DVN relayer initialized",
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
		processedLocks: make(map[[32]byte]bool),
		eventCount:     0,
		lastEventTime:  time.Now(),
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
		log.Info("Loaded processed locks from persistence", "count", len(relayer.processedLocks))
	}

	return relayer, nil
}

// Start begins monitoring for Locked events
func (r *Relayer) Start(ctx context.Context) error {
	log.Info("Starting event monitoring on Mantle")

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
	log.Info("Stopping relayer...")
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
		log.Error("Failed to subscribe to logs", "error", err)
		// Fallback to polling if subscription fails
		r.pollEvents(ctx)
		return
	}
	defer sub.Unsubscribe()

	log.Info("Subscribed to Locked events", "contract", r.cfg.Mantle.LockerAddress)

	for {
		select {
		case <-ctx.Done():
			return
		case err := <-sub.Err():
			log.Error("Subscription error", "error", err)
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
	ticker := time.NewTicker(12 * time.Second) // Poll every block (~12s)
	defer ticker.Stop()

	query := chain.CreateLockedEventQuery(r.cfg.Mantle.LockerAddress)
	fromBlock := uint64(0)

	log.Info("Polling mode active", "interval", "12s", "starting_block", fromBlock)

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			// Get latest block with retry
			var latestBlock uint64
			err := chain.RetryWithBackoff(ctx, r.cfg.Retry.MaxRetries, "get_latest_block", func() error {
				var err error
				latestBlock, err = r.mantleClient.BlockNumber(ctx)
				return err
			})
			if err != nil {
				log.Error("Failed to get latest block after retries", "error", err)
				continue
			}

			if fromBlock == 0 {
				// Start from recent blocks to avoid scanning entire history
				if latestBlock > 100 {
					fromBlock = latestBlock - 100
				}
				log.Info("Starting block scan", "from_block", fromBlock, "to_block", latestBlock)
			}

			// Skip if no new blocks to process
			if fromBlock > latestBlock {
				log.Debug("No new blocks to process", "from", fromBlock, "latest", latestBlock)
				continue
			}

			// Query logs from last processed block to latest
			query.FromBlock = big.NewInt(int64(fromBlock))
			query.ToBlock = big.NewInt(int64(latestBlock))

			var logs []types.Log
			err = chain.RetryWithBackoff(ctx, r.cfg.Retry.MaxRetries, "filter_logs", func() error {
				var err error
				logs, err = r.mantleClient.FilterLogs(ctx, query)
				return err
			})
			if err != nil {
				log.Error("Failed to filter logs after retries", "error", err, "from", fromBlock, "to", latestBlock)
				continue
			}

			if len(logs) > 0 {
				log.Info("Found lock events in block range",
					"from_block", fromBlock,
					"to_block", latestBlock,
					"event_count", len(logs),
				)
			} else {
				log.Debug("No events in block range", "from", fromBlock, "to", latestBlock)
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

	// Parse the event
	event, err := contracts.ParseLockedEvent(vLog, r.lockerABI)
	if err != nil {
		log.Error("Failed to parse Locked event", "error", err, "tx", vLog.TxHash, "block", vLog.BlockNumber)
		return
	}

	// Check if already processed (memory-first for speed)
	if r.processedLocks[event.LockId] {
		log.Debug("Lock already processed (memory cache)", "lock_id", common.Bytes2Hex(event.LockId[:]))
		return
	}

	// Double-check persistence store
	if r.store != nil && r.store.IsProcessed(event.LockId) {
		log.Debug("Lock already processed (persistence)", "lock_id", common.Bytes2Hex(event.LockId[:]))
		r.processedLocks[event.LockId] = true // Update memory cache
		return
	}

	r.eventCount++
	r.lastEventTime = time.Now()

	log.Info("New lock detected",
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

	// Sign the message with retry
	var v uint8
	var rSig, sSig [32]byte
	err = chain.RetryWithBackoff(ctx, 3, "sign_lock_message", func() error {
		var err error
		v, rSig, sSig, err = r.signer.SignLockMessage(lockMsg)
		return err
	})
	if err != nil {
		log.Error("Failed to sign lock message after retries", "error", err, "lock_id", common.Bytes2Hex(event.LockId[:]))
		return
	}

	log.Info("Lock message signed",
		"lock_id", common.Bytes2Hex(event.LockId[:]),
		"v", v,
		"signer", r.signer.GetSignerAddress(),
	)

	// Submit attestation to Ethereum with retry
	var ethTxHash common.Hash
	err = chain.RetryWithBackoff(ctx, r.cfg.Retry.MaxRetries, "submit_attestation", func() error {
		var err error
		ethTxHash, err = r.submitAttestationWithHash(ctx, lockMsg, v, rSig, sSig)
		return err
	})
	if err != nil {
		log.Error("Failed to submit attestation after retries", "error", err, "lock_id", common.Bytes2Hex(event.LockId[:]))
		return
	}

	// Mark as processed in memory
	r.processedLocks[event.LockId] = true

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
			log.Warn("Failed to persist processed lock", "error", err, "lock_id", common.Bytes2Hex(event.LockId[:]))
		}
	}

	processingTime := time.Since(startTime)
	log.Info("Attestation submitted successfully",
		"lock_id", common.Bytes2Hex(event.LockId[:]),
		"borrower", event.Borrower,
		"eth_tx", ethTxHash,
		"processing_time", processingTime,
		"total_processed", r.eventCount,
	)
}

// submitAttestation sends the signed attestation to XRWAReceiver
func (r *Relayer) submitAttestation(ctx context.Context, msg contracts.LockMessage, v uint8, rSig, sSig [32]byte) error {
	_, err := r.submitAttestationWithHash(ctx, msg, v, rSig, sSig)
	return err
}

// submitAttestationWithHash sends the signed attestation and returns the transaction hash
func (r *Relayer) submitAttestationWithHash(ctx context.Context, msg contracts.LockMessage, v uint8, rSig, sSig [32]byte) (common.Hash, error) {
	// Pack the function call
	data, err := contracts.PackMintWithAttestation(r.receiverABI, msg, v, rSig, sSig)
	if err != nil {
		return common.Hash{}, fmt.Errorf("failed to pack function call: %w", err)
	}

	log.Debug("Submitting attestation transaction",
		"receiver", r.cfg.Ethereum.ReceiverAddress,
		"data_size", len(data),
	)

	// Submit transaction using chain helper
	txHash, err := chain.SubmitTransaction(
		ctx,
		r.ethereumClient,
		r.cfg.DVN.PrivateKey,
		r.cfg.Ethereum.ReceiverAddress,
		data,
	)
	if err != nil {
		return common.Hash{}, fmt.Errorf("failed to submit transaction: %w", err)
	}

	log.Info("Attestation transaction submitted",
		"tx_hash", txHash,
		"receiver", r.cfg.Ethereum.ReceiverAddress,
	)

	return txHash, nil
}

// runHealthChecks periodically checks connection health
func (r *Relayer) runHealthChecks(ctx context.Context) {
	ticker := time.NewTicker(time.Duration(r.cfg.Retry.HealthCheckInterval) * time.Second)
	defer ticker.Stop()

	log.Info("Health checks started", "interval", fmt.Sprintf("%ds", r.cfg.Retry.HealthCheckInterval))

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
	// Check Mantle connection
	mantleBlock, err := r.mantleClient.BlockNumber(ctx)
	if err != nil {
		log.Warn("Mantle health check failed", "error", err)
	} else {
		log.Debug("Mantle health check OK", "latest_block", mantleBlock)
	}

	// Check Ethereum connection
	ethBlock, err := r.ethereumClient.BlockNumber(ctx)
	if err != nil {
		log.Warn("Ethereum health check failed", "error", err)
	} else {
		log.Debug("Ethereum health check OK", "latest_block", ethBlock)
	}

	// Log performance metrics
	if r.eventCount > 0 {
		timeSinceLastEvent := time.Since(r.lastEventTime)
		log.Info("Relayer metrics",
			"total_processed", r.eventCount,
			"time_since_last_event", timeSinceLastEvent,
			"persistence_enabled", r.store != nil,
		)
	}
}
