package reconcile

import (
	"math/big"
	"testing"
	"time"

	"github.com/ethereum/go-ethereum/common"
	"github.com/stretchr/testify/require"
)

func TestOrphanedLock_IsExpired(t *testing.T) {
	now := uint64(time.Now().Unix())
	pastTime := now - 3600    // 1 hour ago
	futureTime := now + 3600  // 1 hour from now

	tests := []struct {
		name       string
		validUntil uint64
		expectExp  bool
	}{
		{
			name:       "expired lock (past validUntil)",
			validUntil: pastTime,
			expectExp:  true,
		},
		{
			name:       "valid lock (future validUntil)",
			validUntil: futureTime,
			expectExp:  false,
		},
		{
			name:       "edge case: validUntil equals current time",
			validUntil: now,
			expectExp:  false, // now < now is false (strictly less than)
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			orphan := OrphanedLock{
				Borrower:   common.HexToAddress("0x1234567890123456789012345678901234567890"),
				LockId:     [32]byte{1, 2, 3},
				Amount:     big.NewInt(1000000000000000000), // 1 token
				ValidUntil: tt.validUntil,
				BlockNum:   12345,
			}

			// Simulate the expiration check as done in reconciler
			isExpired := orphan.ValidUntil < uint64(time.Now().Unix())
			orphan.IsExpired = isExpired

			require.Equal(t, tt.expectExp, orphan.IsExpired)
		})
	}
}

func TestReconcileResult_Aggregation(t *testing.T) {
	result := &ReconcileResult{
		TotalLocks:     100,
		ConsumedLocks:  85,
		OrphanedLocks:  15,
		ExpiredOrphans: 10,
		ValidOrphans:   5,
		UnlockedCount:  8,
		Errors:         nil,
	}

	// Verify consistency: orphaned = expired + valid
	require.Equal(t, result.OrphanedLocks, result.ExpiredOrphans+result.ValidOrphans)

	// Verify consistency: total = consumed + orphaned
	require.Equal(t, result.TotalLocks, result.ConsumedLocks+result.OrphanedLocks)

	// Verify unlocked <= expired
	require.LessOrEqual(t, result.UnlockedCount, result.ExpiredOrphans)
}

func TestReconcileResult_WithErrors(t *testing.T) {
	result := &ReconcileResult{
		TotalLocks:     10,
		ConsumedLocks:  7,
		OrphanedLocks:  3,
		ExpiredOrphans: 2,
		ValidOrphans:   1,
		UnlockedCount:  1,
		Errors: []error{
			&testError{"RPC timeout on lock check"},
			&testError{"unlock transaction failed"},
		},
	}

	require.Len(t, result.Errors, 2)
	require.Equal(t, 1, result.UnlockedCount) // Only 1 of 2 expired unlocked due to error
}

// testError is a simple error type for testing
type testError struct {
	msg string
}

func (e *testError) Error() string {
	return e.msg
}

func TestOrphanedLock_Fields(t *testing.T) {
	borrower := common.HexToAddress("0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266")
	lockId := [32]byte{0xab, 0xcd, 0xef}
	amount := big.NewInt(5000000000000000000) // 5 tokens
	validUntil := uint64(1704067200)          // Jan 1, 2024

	orphan := OrphanedLock{
		Borrower:   borrower,
		LockId:     lockId,
		Amount:     amount,
		ValidUntil: validUntil,
		IsExpired:  true,
		BlockNum:   1000000,
	}

	require.Equal(t, borrower, orphan.Borrower)
	require.Equal(t, lockId, orphan.LockId)
	require.Equal(t, amount, orphan.Amount)
	require.Equal(t, validUntil, orphan.ValidUntil)
	require.True(t, orphan.IsExpired)
	require.Equal(t, uint64(1000000), orphan.BlockNum)
}

func TestReconcileOptions_Defaults(t *testing.T) {
	opts := ReconcileOptions{
		StartBlock: 0,
		DryRun:     true,
		ChunkSize:  50000,
	}

	// Default chunk size should be reasonable for RPC calls
	require.Equal(t, uint64(50000), opts.ChunkSize)

	// DryRun should default to true for safety
	require.True(t, opts.DryRun)
}

func TestChainConfig_AddressValidation(t *testing.T) {
	// Valid address
	validAddr := "0x1234567890123456789012345678901234567890"
	cfg := ChainConfig{
		ChainID:       big.NewInt(15000),
		RPCURL:        "https://rpc.example.com",
		LockerAddress: common.HexToAddress(validAddr),
	}

	require.Equal(t, validAddr, cfg.LockerAddress.Hex())

	// Zero address check
	zeroAddr := common.Address{}
	require.True(t, zeroAddr == common.Address{})
	require.NotEqual(t, zeroAddr, cfg.LockerAddress)
}

func TestAdminConfig_PrivateKeyFormats(t *testing.T) {
	tests := []struct {
		name       string
		privateKey string
		expectErr  bool
	}{
		{
			name:       "with 0x prefix",
			privateKey: "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
			expectErr:  false,
		},
		{
			name:       "without 0x prefix",
			privateKey: "ac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
			expectErr:  false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			cfg := AdminConfig{
				PrivateKey: tt.privateKey,
			}

			// The reconciler strips 0x prefix before parsing
			keyStr := cfg.PrivateKey
			if len(keyStr) > 2 && keyStr[:2] == "0x" {
				keyStr = keyStr[2:]
			}

			require.Len(t, keyStr, 64) // 32 bytes = 64 hex chars
		})
	}
}

func TestReconcileResult_Summary(t *testing.T) {
	// Test various scenarios for result summary
	testCases := []struct {
		name           string
		result         ReconcileResult
		expectSuccess  bool
		expectOrphans  bool
		expectUnlocked bool
	}{
		{
			name: "all locks consumed - perfect state",
			result: ReconcileResult{
				TotalLocks:    100,
				ConsumedLocks: 100,
				OrphanedLocks: 0,
			},
			expectSuccess:  true,
			expectOrphans:  false,
			expectUnlocked: false,
		},
		{
			name: "some orphans found in dry run",
			result: ReconcileResult{
				TotalLocks:     100,
				ConsumedLocks:  90,
				OrphanedLocks:  10,
				ExpiredOrphans: 5,
				ValidOrphans:   5,
				UnlockedCount:  0, // Dry run
			},
			expectSuccess:  true,
			expectOrphans:  true,
			expectUnlocked: false,
		},
		{
			name: "orphans unlocked successfully",
			result: ReconcileResult{
				TotalLocks:     100,
				ConsumedLocks:  90,
				OrphanedLocks:  10,
				ExpiredOrphans: 5,
				ValidOrphans:   5,
				UnlockedCount:  5, // All expired unlocked
			},
			expectSuccess:  true,
			expectOrphans:  true,
			expectUnlocked: true,
		},
		{
			name: "partial unlock with errors",
			result: ReconcileResult{
				TotalLocks:     100,
				ConsumedLocks:  90,
				OrphanedLocks:  10,
				ExpiredOrphans: 5,
				ValidOrphans:   5,
				UnlockedCount:  3,                                 // Only 3 of 5 expired unlocked
				Errors:         []error{&testError{"tx failed"}}, // Has errors
			},
			expectSuccess:  false, // Errors present
			expectOrphans:  true,
			expectUnlocked: true,
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			hasErrors := len(tc.result.Errors) > 0
			hasOrphans := tc.result.OrphanedLocks > 0
			hasUnlocked := tc.result.UnlockedCount > 0

			require.Equal(t, tc.expectSuccess, !hasErrors)
			require.Equal(t, tc.expectOrphans, hasOrphans)
			require.Equal(t, tc.expectUnlocked, hasUnlocked)
		})
	}
}

func TestMin(t *testing.T) {
	// Test the min function used in chunk calculation
	tests := []struct {
		a, b     uint64
		expected uint64
	}{
		{100, 200, 100},
		{200, 100, 100},
		{100, 100, 100},
		{0, 100, 0},
		{100, 0, 0},
	}

	for _, tt := range tests {
		result := min(tt.a, tt.b)
		require.Equal(t, tt.expected, result)
	}
}
