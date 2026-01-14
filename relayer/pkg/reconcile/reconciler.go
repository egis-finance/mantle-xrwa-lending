package reconcile

import (
	"context"
	"crypto/ecdsa"
	"fmt"
	"math/big"
	"strings"
	"time"

	"github.com/ethereum/go-ethereum"
	"github.com/ethereum/go-ethereum/accounts/abi"
	"github.com/ethereum/go-ethereum/accounts/abi/bind"
	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/core/types"
	"github.com/ethereum/go-ethereum/crypto"
	"github.com/ethereum/go-ethereum/ethclient"

	"github.com/egis-finance/mantle-xrwa-lending/relayer/internal/contracts"
	"github.com/egis-finance/mantle-xrwa-lending/relayer/pkg/logger"
)

// OrphanedLock represents a lock that exists on Mantle but not attested on Ethereum
type OrphanedLock struct {
	Borrower   common.Address
	LockId     [32]byte
	Amount     *big.Int
	ValidUntil uint64
	IsExpired  bool
	BlockNum   uint64
}

// ReconcileResult holds the reconciliation outcome
type ReconcileResult struct {
	TotalLocks     int
	ConsumedLocks  int
	OrphanedLocks  int
	ExpiredOrphans int
	ValidOrphans   int
	UnlockedCount  int
	Errors         []error
}

// Reconciler handles cross-chain lock reconciliation
type Reconciler struct {
	cfg           *Config
	mantleClient  *ethclient.Client
	ethClient     *ethclient.Client
	lockerABI     abi.ABI
	receiverABI   abi.ABI
	adminKey      *ecdsa.PrivateKey
}

// NewReconciler creates a new reconciler instance
func NewReconciler(cfg *Config) (*Reconciler, error) {
	mantleClient, err := ethclient.Dial(cfg.Mantle.RPCURL)
	if err != nil {
		return nil, fmt.Errorf("connect to Mantle: %w", err)
	}

	ethClient, err := ethclient.Dial(cfg.Ethereum.RPCURL)
	if err != nil {
		return nil, fmt.Errorf("connect to Ethereum: %w", err)
	}

	lockerABI, err := abi.JSON(strings.NewReader(contracts.CollateralLockerABI))
	if err != nil {
		return nil, fmt.Errorf("parse locker ABI: %w", err)
	}

	receiverABI, err := abi.JSON(strings.NewReader(contracts.XRWAReceiverABI))
	if err != nil {
		return nil, fmt.Errorf("parse receiver ABI: %w", err)
	}

	// Parse admin private key (strip 0x prefix if present)
	keyStr := strings.TrimPrefix(cfg.Admin.PrivateKey, "0x")
	adminKey, err := crypto.HexToECDSA(keyStr)
	if err != nil {
		return nil, fmt.Errorf("parse admin key: %w", err)
	}

	return &Reconciler{
		cfg:          cfg,
		mantleClient: mantleClient,
		ethClient:    ethClient,
		lockerABI:    lockerABI,
		receiverABI:  receiverABI,
		adminKey:     adminKey,
	}, nil
}

// Close releases resources
func (r *Reconciler) Close() {
	if r.mantleClient != nil {
		r.mantleClient.Close()
	}
	if r.ethClient != nil {
		r.ethClient.Close()
	}
}

// Run executes the reconciliation process
func (r *Reconciler) Run(ctx context.Context) (*ReconcileResult, error) {
	result := &ReconcileResult{}

	// Determine scan range
	startBlock := r.cfg.Options.StartBlock
	if startBlock == 0 {
		return nil, fmt.Errorf("RECONCILE_START_BLOCK must be set")
	}

	currentBlock, err := r.mantleClient.BlockNumber(ctx)
	if err != nil {
		return nil, fmt.Errorf("get current block: %w", err)
	}

	logger.Infow("Starting reconciliation scan",
		"start_block", startBlock,
		"current_block", currentBlock,
		"dry_run", r.cfg.Options.DryRun)

	// Scan all Locked events
	locks, err := r.scanLockedEvents(ctx, startBlock, currentBlock)
	if err != nil {
		return nil, fmt.Errorf("scan locked events: %w", err)
	}
	result.TotalLocks = len(locks)
	logger.Infow("Scanned Locked events", "count", len(locks))

	// Check each lock against Ethereum consumed mapping
	orphans := make([]OrphanedLock, 0)
	now := uint64(time.Now().Unix())

	for _, lock := range locks {
		consumed, err := r.isConsumed(ctx, lock.LockId)
		if err != nil {
			logger.Warnw("Failed to check consumed status",
				"lock_id", fmt.Sprintf("%x", lock.LockId),
				"error", err)
			result.Errors = append(result.Errors, err)
			continue
		}

		if consumed {
			result.ConsumedLocks++
			continue
		}

		// Orphaned lock found
		orphan := OrphanedLock{
			Borrower:   lock.Borrower,
			LockId:     lock.LockId,
			Amount:     lock.Amount,
			ValidUntil: lock.ValidUntil,
			IsExpired:  lock.ValidUntil < now,
			BlockNum:   lock.Raw.BlockNumber,
		}
		orphans = append(orphans, orphan)

		if orphan.IsExpired {
			result.ExpiredOrphans++
		} else {
			result.ValidOrphans++
		}
	}
	result.OrphanedLocks = len(orphans)

	logger.Infow("Reconciliation analysis complete",
		"total_locks", result.TotalLocks,
		"consumed", result.ConsumedLocks,
		"orphaned", result.OrphanedLocks,
		"expired_orphans", result.ExpiredOrphans,
		"valid_orphans", result.ValidOrphans)

	// Report orphaned locks
	for _, orphan := range orphans {
		status := "VALID"
		if orphan.IsExpired {
			status = "EXPIRED"
		}
		logger.Infow("Orphaned lock",
			"status", status,
			"borrower", orphan.Borrower.Hex(),
			"lock_id", fmt.Sprintf("0x%x", orphan.LockId),
			"amount", orphan.Amount.String(),
			"valid_until", orphan.ValidUntil,
			"block", orphan.BlockNum)
	}

	// Execute unlocks for expired orphans (unless dry run)
	if !r.cfg.Options.DryRun {
		for _, orphan := range orphans {
			if !orphan.IsExpired {
				logger.Infow("Skipping valid orphan (can still be attested)",
					"lock_id", fmt.Sprintf("0x%x", orphan.LockId))
				continue
			}

			err := r.executeUnlock(ctx, orphan)
			if err != nil {
				logger.Errorw("Failed to unlock",
					"lock_id", fmt.Sprintf("0x%x", orphan.LockId),
					"error", err)
				result.Errors = append(result.Errors, err)
				continue
			}
			result.UnlockedCount++
		}
	} else {
		logger.Info("Dry run mode - no unlocks executed")
	}

	return result, nil
}

// scanLockedEvents queries all Locked events in chunks
func (r *Reconciler) scanLockedEvents(ctx context.Context, fromBlock, toBlock uint64) ([]*contracts.LockedEvent, error) {
	var allEvents []*contracts.LockedEvent
	chunkSize := r.cfg.Options.ChunkSize

	query := ethereum.FilterQuery{
		Addresses: []common.Address{r.cfg.Mantle.LockerAddress},
		Topics:    [][]common.Hash{{contracts.LockedEventSignature}},
	}

	for start := fromBlock; start <= toBlock; start += chunkSize {
		end := min(start+chunkSize-1, toBlock)

		query.FromBlock = big.NewInt(int64(start))
		query.ToBlock = big.NewInt(int64(end))

		logger.Debugw("Scanning block range", "from", start, "to", end)

		logs, err := r.mantleClient.FilterLogs(ctx, query)
		if err != nil {
			return nil, fmt.Errorf("filter logs [%d-%d]: %w", start, end, err)
		}

		for _, log := range logs {
			event, err := contracts.ParseLockedEvent(log, r.lockerABI)
			if err != nil {
				logger.Warnw("Failed to parse Locked event",
					"tx", log.TxHash.Hex(),
					"error", err)
				continue
			}
			allEvents = append(allEvents, event)
		}
	}

	return allEvents, nil
}

// isConsumed checks if a lockId has been consumed on Ethereum
func (r *Reconciler) isConsumed(ctx context.Context, lockId [32]byte) (bool, error) {
	data, err := r.receiverABI.Pack("consumed", lockId)
	if err != nil {
		return false, fmt.Errorf("pack consumed call: %w", err)
	}

	msg := ethereum.CallMsg{
		To:   &r.cfg.Ethereum.ReceiverAddress,
		Data: data,
	}

	result, err := r.ethClient.CallContract(ctx, msg, nil)
	if err != nil {
		return false, fmt.Errorf("call consumed: %w", err)
	}

	var consumed bool
	err = r.receiverABI.UnpackIntoInterface(&consumed, "consumed", result)
	if err != nil {
		return false, fmt.Errorf("unpack consumed result: %w", err)
	}

	return consumed, nil
}

// executeUnlock submits an unlock transaction on Mantle
func (r *Reconciler) executeUnlock(ctx context.Context, orphan OrphanedLock) error {
	logger.Infow("Executing unlock",
		"borrower", orphan.Borrower.Hex(),
		"amount", orphan.Amount.String(),
		"lock_id", fmt.Sprintf("0x%x", orphan.LockId))

	// Pack unlock call data
	data, err := r.lockerABI.Pack("unlock", orphan.Borrower, orphan.Amount, orphan.LockId)
	if err != nil {
		return fmt.Errorf("pack unlock: %w", err)
	}

	// Get nonce and gas price
	fromAddr := crypto.PubkeyToAddress(r.adminKey.PublicKey)
	nonce, err := r.mantleClient.PendingNonceAt(ctx, fromAddr)
	if err != nil {
		return fmt.Errorf("get nonce: %w", err)
	}

	gasPrice, err := r.mantleClient.SuggestGasPrice(ctx)
	if err != nil {
		return fmt.Errorf("get gas price: %w", err)
	}

	// Estimate gas
	msg := ethereum.CallMsg{
		From: fromAddr,
		To:   &r.cfg.Mantle.LockerAddress,
		Data: data,
	}
	gasLimit, err := r.mantleClient.EstimateGas(ctx, msg)
	if err != nil {
		return fmt.Errorf("estimate gas: %w", err)
	}
	gasLimit = gasLimit * 120 / 100 // 20% buffer

	// Create and sign transaction
	tx := types.NewTransaction(
		nonce,
		r.cfg.Mantle.LockerAddress,
		big.NewInt(0),
		gasLimit,
		gasPrice,
		data,
	)

	signer := types.NewEIP155Signer(r.cfg.Mantle.ChainID)
	signedTx, err := types.SignTx(tx, signer, r.adminKey)
	if err != nil {
		return fmt.Errorf("sign tx: %w", err)
	}

	// Submit transaction
	err = r.mantleClient.SendTransaction(ctx, signedTx)
	if err != nil {
		return fmt.Errorf("send tx: %w", err)
	}

	logger.Infow("Unlock transaction submitted",
		"tx_hash", signedTx.Hash().Hex(),
		"borrower", orphan.Borrower.Hex(),
		"amount", orphan.Amount.String())

	// Wait for confirmation
	receipt, err := bind.WaitMined(ctx, r.mantleClient, signedTx)
	if err != nil {
		return fmt.Errorf("wait for tx: %w", err)
	}

	if receipt.Status != types.ReceiptStatusSuccessful {
		return fmt.Errorf("tx reverted: %s", signedTx.Hash().Hex())
	}

	logger.Infow("Unlock confirmed",
		"tx_hash", signedTx.Hash().Hex(),
		"gas_used", receipt.GasUsed)

	return nil
}
