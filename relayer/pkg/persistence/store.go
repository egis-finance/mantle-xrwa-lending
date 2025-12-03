package persistence

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"time"

	"github.com/egis-finance/mantle-xrwa-lending/relayer/pkg/logger"
	"github.com/ethereum/go-ethereum/common"
)

// ProcessedLock represents a lock event that has been successfully processed
type ProcessedLock struct {
	LockId         string    `json:"lockId"`
	Borrower       string    `json:"borrower"`
	Amount         string    `json:"amount"`
	SourceChainId  string    `json:"sourceChainId"`
	MantleTxHash   string    `json:"mantleTxHash"`
	EthereumTxHash string    `json:"ethereumTxHash"`
	ProcessedAt    time.Time `json:"processedAt"`
	BlockNumber    uint64    `json:"blockNumber"`
}

// persistedState represents the full JSON structure on disk
type persistedState struct {
	LastProcessedBlock uint64          `json:"lastProcessedBlock"`
	Locks              []ProcessedLock `json:"locks"`
}

// Store provides persistent storage for processed lock events and block cursor
type Store struct {
	filePath           string
	locks              map[[32]byte]ProcessedLock
	lastProcessedBlock uint64
	mu                 sync.RWMutex
}

// NewStore creates a new persistence store
func NewStore(filePath string) (*Store, error) {
	// Ensure directory exists
	dir := filepath.Dir(filePath)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return nil, fmt.Errorf("failed to create persistence directory: %w", err)
	}

	store := &Store{
		filePath: filePath,
		locks:    make(map[[32]byte]ProcessedLock),
	}

	// Load existing data
	if err := store.load(); err != nil {
		logger.Warnw("Failed to load persistence file (will create new)", "error", err, "path", filePath)
	}

	logger.Infow("Persistence store initialized",
		"file", filePath,
		"loaded_locks", len(store.locks),
		"last_processed_block", store.lastProcessedBlock,
	)

	return store, nil
}

// GetLastProcessedBlock returns the last block that was fully processed
func (s *Store) GetLastProcessedBlock() uint64 {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.lastProcessedBlock
}

// SetLastProcessedBlock updates the cursor and persists immediately
func (s *Store) SetLastProcessedBlock(block uint64) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	s.lastProcessedBlock = block

	if err := s.save(); err != nil {
		return fmt.Errorf("failed to persist block cursor: %w", err)
	}

	logger.Debugw("Block cursor updated", "chain", "mantle", "block", block)
	return nil
}

// IsProcessed checks if a lock ID has already been processed
func (s *Store) IsProcessed(lockId [32]byte) bool {
	s.mu.RLock()
	defer s.mu.RUnlock()
	_, exists := s.locks[lockId]
	return exists
}

// GetProcessedLock retrieves details of a processed lock
func (s *Store) GetProcessedLock(lockId [32]byte) (ProcessedLock, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	lock, exists := s.locks[lockId]
	return lock, exists
}

// MarkProcessed records a successfully processed lock
func (s *Store) MarkProcessed(
	lockId [32]byte,
	borrower common.Address,
	amount string,
	sourceChainId string,
	mantleTxHash common.Hash,
	ethereumTxHash common.Hash,
	blockNumber uint64,
) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	lock := ProcessedLock{
		LockId:         common.Bytes2Hex(lockId[:]),
		Borrower:       borrower.Hex(),
		Amount:         amount,
		SourceChainId:  sourceChainId,
		MantleTxHash:   mantleTxHash.Hex(),
		EthereumTxHash: ethereumTxHash.Hex(),
		ProcessedAt:    time.Now().UTC(),
		BlockNumber:    blockNumber,
	}

	s.locks[lockId] = lock

	logger.Debugw("Lock marked as processed in persistence",
		"lock_id", lock.LockId,
		"borrower", lock.Borrower,
		"eth_tx", lock.EthereumTxHash,
	)

	// Persist to disk immediately (atomic write)
	if err := s.save(); err != nil {
		return fmt.Errorf("failed to save persistence: %w", err)
	}

	return nil
}

// GetAllProcessed returns all processed locks
func (s *Store) GetAllProcessed() []ProcessedLock {
	s.mu.RLock()
	defer s.mu.RUnlock()

	locks := make([]ProcessedLock, 0, len(s.locks))
	for _, lock := range s.locks {
		locks = append(locks, lock)
	}
	return locks
}

// Count returns the number of processed locks
func (s *Store) Count() int {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return len(s.locks)
}

// load reads the persistence file from disk
// Handles both legacy format (array of locks) and new format (object with cursor)
func (s *Store) load() error {
	data, err := os.ReadFile(s.filePath)
	if err != nil {
		if os.IsNotExist(err) {
			return nil // File doesn't exist yet, start fresh
		}
		return err
	}

	// Try new format first (object with lastProcessedBlock and locks)
	var state persistedState
	if err := json.Unmarshal(data, &state); err == nil && state.Locks != nil {
		s.lastProcessedBlock = state.LastProcessedBlock
		s.locks = s.locksSliceToMap(state.Locks)
		return nil
	}

	// Fall back to legacy format (array of locks)
	var locks []ProcessedLock
	if err := json.Unmarshal(data, &locks); err != nil {
		return fmt.Errorf("failed to unmarshal persistence data: %w", err)
	}

	s.locks = s.locksSliceToMap(locks)
	s.lastProcessedBlock = 0 // No cursor in legacy format
	logger.Infow("Migrated from legacy persistence format")

	return nil
}

// locksSliceToMap converts a slice of ProcessedLock to a map keyed by lockId
func (s *Store) locksSliceToMap(locks []ProcessedLock) map[[32]byte]ProcessedLock {
	result := make(map[[32]byte]ProcessedLock, len(locks))
	for _, lock := range locks {
		lockIdBytes := common.FromHex(lock.LockId)
		if len(lockIdBytes) != 32 {
			logger.Warnw("Invalid lock ID in persistence file, skipping", "lock_id", lock.LockId)
			continue
		}
		var lockIdArray [32]byte
		copy(lockIdArray[:], lockIdBytes)
		result[lockIdArray] = lock
	}
	return result
}

// save writes the persistence data to disk atomically
func (s *Store) save() error {
	// Convert map to slice for JSON serialization
	locks := make([]ProcessedLock, 0, len(s.locks))
	for _, lock := range s.locks {
		locks = append(locks, lock)
	}

	state := persistedState{
		LastProcessedBlock: s.lastProcessedBlock,
		Locks:              locks,
	}

	data, err := json.MarshalIndent(state, "", "  ")
	if err != nil {
		return fmt.Errorf("failed to marshal persistence data: %w", err)
	}

	// Atomic write: write to temp file, then rename
	tempFile := s.filePath + ".tmp"
	if err := os.WriteFile(tempFile, data, 0644); err != nil {
		return fmt.Errorf("failed to write temp file: %w", err)
	}

	if err := os.Rename(tempFile, s.filePath); err != nil {
		if removeErr := os.Remove(tempFile); removeErr != nil {
			logger.Warnw("Failed to clean up temp file after rename failure",
				"temp_file", tempFile,
				"rename_error", err,
				"remove_error", removeErr,
			)
		}
		return fmt.Errorf("failed to rename temp file: %w", err)
	}

	return nil
}

// Flush explicitly saves the current state to disk
func (s *Store) Flush() error {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.save()
}
