package persistence

import (
	"encoding/json"
	"os"
	"path/filepath"
	"sync"
	"testing"

	"github.com/ethereum/go-ethereum/common"
	"github.com/stretchr/testify/require"
)

func TestNewStore_FileNotExists(t *testing.T) {
	t.Parallel()

	tmpDir := t.TempDir()
	filePath := filepath.Join(tmpDir, "locks.json")

	store, err := NewStore(filePath)
	require.NoError(t, err)
	require.NotNil(t, store)
	require.Equal(t, filePath, store.filePath)
	require.Equal(t, 0, store.Count())
}

func TestNewStore_LoadExisting(t *testing.T) {
	t.Parallel()

	tmpDir := t.TempDir()
	filePath := filepath.Join(tmpDir, "locks.json")

	// Create existing file with sample data
	existingLocks := []ProcessedLock{
		{
			LockId:         "0x1111111111111111111111111111111111111111111111111111111111111111",
			Borrower:       "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
			Amount:         "1000000",
			SourceChainId:  "15000",
			MantleTxHash:   "0x2222222222222222222222222222222222222222222222222222222222222222",
			EthereumTxHash: "0x3333333333333333333333333333333333333333333333333333333333333333",
		},
	}

	data, err := json.MarshalIndent(existingLocks, "", "  ")
	require.NoError(t, err)
	err = os.WriteFile(filePath, data, 0644)
	require.NoError(t, err)

	// Load store
	store, err := NewStore(filePath)
	require.NoError(t, err)
	require.NotNil(t, store)
	require.Equal(t, 1, store.Count())

	// Verify loaded data
	lockIdBytes := common.FromHex(existingLocks[0].LockId)
	var lockIdArray [32]byte
	copy(lockIdArray[:], lockIdBytes)
	require.True(t, store.IsProcessed(lockIdArray))
}

func TestMarkProcessed(t *testing.T) {
	t.Parallel()

	tmpDir := t.TempDir()
	filePath := filepath.Join(tmpDir, "locks.json")

	store, err := NewStore(filePath)
	require.NoError(t, err)

	// Mark a lock as processed
	lockId := [32]byte{0x11, 0x22, 0x33}
	borrower := common.HexToAddress("0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266")
	amount := "1000000"
	sourceChainId := "15000"
	mantleTxHash := common.HexToHash("0x4444444444444444444444444444444444444444444444444444444444444444")
	ethereumTxHash := common.HexToHash("0x5555555555555555555555555555555555555555555555555555555555555555")
	blockNumber := uint64(12345)

	err = store.MarkProcessed(lockId, borrower, amount, sourceChainId, mantleTxHash, ethereumTxHash, blockNumber)
	require.NoError(t, err)

	// Verify persistence file was created
	_, err = os.Stat(filePath)
	require.NoError(t, err)

	// Verify count
	require.Equal(t, 1, store.Count())

	// Verify the lock is marked as processed
	require.True(t, store.IsProcessed(lockId))
}

func TestIsProcessed(t *testing.T) {
	t.Parallel()

	tmpDir := t.TempDir()
	filePath := filepath.Join(tmpDir, "locks.json")

	store, err := NewStore(filePath)
	require.NoError(t, err)

	lockId := [32]byte{0xaa, 0xbb, 0xcc}

	// Initially should not be processed
	require.False(t, store.IsProcessed(lockId))

	// Mark as processed
	borrower := common.HexToAddress("0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266")
	err = store.MarkProcessed(
		lockId,
		borrower,
		"1000000",
		"15000",
		common.HexToHash("0x1111111111111111111111111111111111111111111111111111111111111111"),
		common.HexToHash("0x2222222222222222222222222222222222222222222222222222222222222222"),
		100,
	)
	require.NoError(t, err)

	// Now should be processed
	require.True(t, store.IsProcessed(lockId))
}

func TestGetProcessedLock(t *testing.T) {
	t.Parallel()

	tmpDir := t.TempDir()
	filePath := filepath.Join(tmpDir, "locks.json")

	store, err := NewStore(filePath)
	require.NoError(t, err)

	lockId := [32]byte{0x01, 0x02, 0x03}
	borrower := common.HexToAddress("0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266")
	amount := "5000000"
	sourceChainId := "15000"
	mantleTxHash := common.HexToHash("0x7777777777777777777777777777777777777777777777777777777777777777")
	ethereumTxHash := common.HexToHash("0x8888888888888888888888888888888888888888888888888888888888888888")
	blockNumber := uint64(54321)

	// Mark as processed
	err = store.MarkProcessed(lockId, borrower, amount, sourceChainId, mantleTxHash, ethereumTxHash, blockNumber)
	require.NoError(t, err)

	// Retrieve lock
	lock, exists := store.GetProcessedLock(lockId)
	require.True(t, exists)
	require.Equal(t, borrower.Hex(), lock.Borrower)
	require.Equal(t, amount, lock.Amount)
	require.Equal(t, sourceChainId, lock.SourceChainId)
	require.Equal(t, mantleTxHash.Hex(), lock.MantleTxHash)
	require.Equal(t, ethereumTxHash.Hex(), lock.EthereumTxHash)
	require.Equal(t, blockNumber, lock.BlockNumber)
}

func TestGetAllProcessed(t *testing.T) {
	t.Parallel()

	tmpDir := t.TempDir()
	filePath := filepath.Join(tmpDir, "locks.json")

	store, err := NewStore(filePath)
	require.NoError(t, err)

	// Add multiple locks
	numLocks := 5
	for i := 0; i < numLocks; i++ {
		lockId := [32]byte{byte(i)}
		borrower := common.HexToAddress("0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266")
		err = store.MarkProcessed(
			lockId,
			borrower,
			"1000000",
			"15000",
			common.HexToHash("0x1111111111111111111111111111111111111111111111111111111111111111"),
			common.HexToHash("0x2222222222222222222222222222222222222222222222222222222222222222"),
			uint64(i),
		)
		require.NoError(t, err)
	}

	// Get all processed locks
	allLocks := store.GetAllProcessed()
	require.Len(t, allLocks, numLocks)
}

func TestConcurrentWrites(t *testing.T) {
	t.Parallel()

	tmpDir := t.TempDir()
	filePath := filepath.Join(tmpDir, "locks.json")

	store, err := NewStore(filePath)
	require.NoError(t, err)

	// Concurrent writes
	numGoroutines := 10
	var wg sync.WaitGroup
	wg.Add(numGoroutines)

	for i := 0; i < numGoroutines; i++ {
		go func(index int) {
			defer wg.Done()

			lockId := [32]byte{byte(index)}
			borrower := common.HexToAddress("0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266")
			err := store.MarkProcessed(
				lockId,
				borrower,
				"1000000",
				"15000",
				common.HexToHash("0x1111111111111111111111111111111111111111111111111111111111111111"),
				common.HexToHash("0x2222222222222222222222222222222222222222222222222222222222222222"),
				uint64(index),
			)
			require.NoError(t, err)
		}(i)
	}

	wg.Wait()

	// Verify all locks were processed
	require.Equal(t, numGoroutines, store.Count())
}

func TestAtomicWrites(t *testing.T) {
	t.Parallel()

	tmpDir := t.TempDir()
	filePath := filepath.Join(tmpDir, "locks.json")

	store, err := NewStore(filePath)
	require.NoError(t, err)

	// Mark a lock as processed
	lockId := [32]byte{0xde, 0xad, 0xbe, 0xef}
	borrower := common.HexToAddress("0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266")
	err = store.MarkProcessed(
		lockId,
		borrower,
		"1000000",
		"15000",
		common.HexToHash("0x1111111111111111111111111111111111111111111111111111111111111111"),
		common.HexToHash("0x2222222222222222222222222222222222222222222222222222222222222222"),
		999,
	)
	require.NoError(t, err)

	// Verify temp file was removed
	tempFile := filePath + ".tmp"
	_, err = os.Stat(tempFile)
	require.True(t, os.IsNotExist(err), "temp file should not exist after atomic write")

	// Verify final file exists and is valid
	content, err := os.ReadFile(filePath)
	require.NoError(t, err)

	var locks []ProcessedLock
	err = json.Unmarshal(content, &locks)
	require.NoError(t, err)
	require.Len(t, locks, 1)
}

func TestCount(t *testing.T) {
	t.Parallel()

	tmpDir := t.TempDir()
	filePath := filepath.Join(tmpDir, "locks.json")

	store, err := NewStore(filePath)
	require.NoError(t, err)

	// Initially count should be 0
	require.Equal(t, 0, store.Count())

	// Add locks and verify count
	for i := 0; i < 3; i++ {
		lockId := [32]byte{byte(i)}
		borrower := common.HexToAddress("0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266")
		err = store.MarkProcessed(
			lockId,
			borrower,
			"1000000",
			"15000",
			common.HexToHash("0x1111111111111111111111111111111111111111111111111111111111111111"),
			common.HexToHash("0x2222222222222222222222222222222222222222222222222222222222222222"),
			uint64(i),
		)
		require.NoError(t, err)
		require.Equal(t, i+1, store.Count())
	}
}

func TestFlush(t *testing.T) {
	t.Parallel()

	tmpDir := t.TempDir()
	filePath := filepath.Join(tmpDir, "locks.json")

	store, err := NewStore(filePath)
	require.NoError(t, err)

	// Add a lock
	lockId := [32]byte{0xff, 0xee, 0xdd}
	borrower := common.HexToAddress("0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266")
	err = store.MarkProcessed(
		lockId,
		borrower,
		"1000000",
		"15000",
		common.HexToHash("0x1111111111111111111111111111111111111111111111111111111111111111"),
		common.HexToHash("0x2222222222222222222222222222222222222222222222222222222222222222"),
		555,
	)
	require.NoError(t, err)

	// Explicit flush
	err = store.Flush()
	require.NoError(t, err)

	// Verify file was written
	_, err = os.Stat(filePath)
	require.NoError(t, err)
}

func TestNewStore_InvalidLockIDInFile(t *testing.T) {
	t.Parallel()

	tmpDir := t.TempDir()
	filePath := filepath.Join(tmpDir, "locks.json")

	// Create file with invalid lock ID
	invalidLocks := []ProcessedLock{
		{
			LockId:    "0xinvalid", // Invalid length
			Borrower:  "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
			Amount:    "1000000",
		},
		{
			LockId:    "0x1111111111111111111111111111111111111111111111111111111111111111",
			Borrower:  "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
			Amount:    "2000000",
		},
	}

	data, err := json.MarshalIndent(invalidLocks, "", "  ")
	require.NoError(t, err)
	err = os.WriteFile(filePath, data, 0644)
	require.NoError(t, err)

	// Load store (should skip invalid lock ID)
	store, err := NewStore(filePath)
	require.NoError(t, err)

	// Only valid lock should be loaded
	require.Equal(t, 1, store.Count())
}

func TestNewStore_CorruptedFile(t *testing.T) {
	t.Parallel()

	tmpDir := t.TempDir()
	filePath := filepath.Join(tmpDir, "locks.json")

	// Create corrupted JSON file
	err := os.WriteFile(filePath, []byte("not valid json"), 0644)
	require.NoError(t, err)

	// Should handle gracefully (logs warning but doesn't error)
	store, err := NewStore(filePath)
	require.NoError(t, err)
	require.Equal(t, 0, store.Count())
}

func TestLoadExistingData_Persistence(t *testing.T) {
	t.Parallel()

	tmpDir := t.TempDir()
	filePath := filepath.Join(tmpDir, "locks.json")

	// Create first store and add data
	store1, err := NewStore(filePath)
	require.NoError(t, err)

	lockId := [32]byte{0x99, 0x88, 0x77}
	borrower := common.HexToAddress("0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266")
	err = store1.MarkProcessed(
		lockId,
		borrower,
		"9999999",
		"15000",
		common.HexToHash("0x1111111111111111111111111111111111111111111111111111111111111111"),
		common.HexToHash("0x2222222222222222222222222222222222222222222222222222222222222222"),
		777,
	)
	require.NoError(t, err)

	// Create second store from same file
	store2, err := NewStore(filePath)
	require.NoError(t, err)

	// Data should be loaded from file
	require.Equal(t, 1, store2.Count())
	require.True(t, store2.IsProcessed(lockId))

	lock, exists := store2.GetProcessedLock(lockId)
	require.True(t, exists)
	require.Equal(t, "9999999", lock.Amount)
	require.Equal(t, uint64(777), lock.BlockNumber)
}
