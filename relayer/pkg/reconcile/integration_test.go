//go:build integration

package reconcile

import (
	"context"
	"os"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

// Integration tests require VTE environment variables to be set.
// Run with: go test -tags=integration ./pkg/reconcile/... -v

func TestReconciler_Integration_DryRun(t *testing.T) {
	// Skip if VTE environment not configured
	if os.Getenv("MANTLE_RPC_VTE") == "" || os.Getenv("ETHEREUM_RPC_VTE") == "" {
		t.Skip("VTE environment variables not set, skipping integration test")
	}

	// Ensure required vars are set
	requiredVars := []string{
		"MANTLE_CHAIN_ID",
		"MANTLE_RPC_VTE",
		"MANTLE_LOCKER",
		"ETHEREUM_CHAIN_ID",
		"ETHEREUM_RPC_VTE",
		"ETH_RECEIVER",
		"ADMIN_PRIVATE_KEY",
	}

	for _, v := range requiredVars {
		if os.Getenv(v) == "" {
			t.Skipf("Required env var %s not set", v)
		}
	}

	// Force dry run mode for safety
	_ = os.Setenv("RECONCILE_DRY_RUN", "true")
	_ = os.Setenv("RECONCILE_START_BLOCK", "0")
	defer func() {
		_ = os.Unsetenv("RECONCILE_DRY_RUN")
		_ = os.Unsetenv("RECONCILE_START_BLOCK")
	}()

	cfg, err := Load()
	require.NoError(t, err)
	require.True(t, cfg.Options.DryRun, "Integration test must run in dry-run mode")

	// Create reconciler
	rec, err := NewReconciler(cfg)
	require.NoError(t, err)
	defer rec.Close()

	// Run reconciliation with timeout
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()

	result, err := rec.Run(ctx)
	require.NoError(t, err)
	require.NotNil(t, result)

	// Log results
	t.Logf("Reconciliation results:")
	t.Logf("  Total locks scanned: %d", result.TotalLocks)
	t.Logf("  Consumed locks: %d", result.ConsumedLocks)
	t.Logf("  Orphaned locks: %d", result.OrphanedLocks)
	t.Logf("  Expired orphans: %d", result.ExpiredOrphans)
	t.Logf("  Valid orphans: %d", result.ValidOrphans)
	t.Logf("  Unlocked count: %d (should be 0 in dry-run)", result.UnlockedCount)
	t.Logf("  Errors: %d", len(result.Errors))

	// Verify dry-run behavior: no unlocks executed
	require.Equal(t, 0, result.UnlockedCount, "Dry-run should not execute unlocks")

	// Verify consistency
	require.Equal(t, result.TotalLocks, result.ConsumedLocks+result.OrphanedLocks)
	require.Equal(t, result.OrphanedLocks, result.ExpiredOrphans+result.ValidOrphans)
}

func TestReconciler_Integration_ConnectsBothChains(t *testing.T) {
	if os.Getenv("MANTLE_RPC_VTE") == "" || os.Getenv("ETHEREUM_RPC_VTE") == "" {
		t.Skip("VTE environment variables not set")
	}

	requiredVars := []string{
		"MANTLE_CHAIN_ID",
		"MANTLE_RPC_VTE",
		"MANTLE_LOCKER",
		"ETHEREUM_CHAIN_ID",
		"ETHEREUM_RPC_VTE",
		"ETH_RECEIVER",
		"ADMIN_PRIVATE_KEY",
	}

	for _, v := range requiredVars {
		if os.Getenv(v) == "" {
			t.Skipf("Required env var %s not set", v)
		}
	}

	cfg, err := Load()
	require.NoError(t, err)

	rec, err := NewReconciler(cfg)
	require.NoError(t, err)
	defer rec.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	// Verify Mantle connection
	mantleBlock, err := rec.mantleClient.BlockNumber(ctx)
	require.NoError(t, err)
	require.Greater(t, mantleBlock, uint64(0))
	t.Logf("Connected to Mantle VTE, current block: %d", mantleBlock)

	// Verify Ethereum connection
	ethBlock, err := rec.ethClient.BlockNumber(ctx)
	require.NoError(t, err)
	require.Greater(t, ethBlock, uint64(0))
	t.Logf("Connected to Ethereum VTE, current block: %d", ethBlock)
}

func TestReconciler_Integration_ChunkedScanning(t *testing.T) {
	if os.Getenv("MANTLE_RPC_VTE") == "" {
		t.Skip("VTE environment not configured")
	}

	requiredVars := []string{
		"MANTLE_CHAIN_ID",
		"MANTLE_RPC_VTE",
		"MANTLE_LOCKER",
		"ETHEREUM_CHAIN_ID",
		"ETHEREUM_RPC_VTE",
		"ETH_RECEIVER",
		"ADMIN_PRIVATE_KEY",
	}

	for _, v := range requiredVars {
		if os.Getenv(v) == "" {
			t.Skipf("Required env var %s not set", v)
		}
	}

	// Use small chunk size to test chunking logic
	_ = os.Setenv("RECONCILE_CHUNK_SIZE", "1000")
	_ = os.Setenv("RECONCILE_DRY_RUN", "true")
	_ = os.Setenv("RECONCILE_START_BLOCK", "0")
	defer func() {
		_ = os.Unsetenv("RECONCILE_CHUNK_SIZE")
		_ = os.Unsetenv("RECONCILE_DRY_RUN")
		_ = os.Unsetenv("RECONCILE_START_BLOCK")
	}()

	cfg, err := Load()
	require.NoError(t, err)
	require.Equal(t, uint64(1000), cfg.Options.ChunkSize)

	rec, err := NewReconciler(cfg)
	require.NoError(t, err)
	defer rec.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Minute)
	defer cancel()

	// Get current block to understand scan range
	currentBlock, err := rec.mantleClient.BlockNumber(ctx)
	require.NoError(t, err)

	t.Logf("Scanning from block 0 to %d with chunk size 1000", currentBlock)
	t.Logf("Expected chunks: ~%d", currentBlock/1000)

	result, err := rec.Run(ctx)
	require.NoError(t, err)
	require.NotNil(t, result)

	t.Logf("Scan completed, found %d locks", result.TotalLocks)
}
