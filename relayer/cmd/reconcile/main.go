package main

import (
	"context"
	"fmt"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/egis-finance/mantle-xrwa-lending/relayer/pkg/logger"
	"github.com/egis-finance/mantle-xrwa-lending/relayer/pkg/reconcile"
)

func main() {
	// Initialize logger
	if err := logger.Init(logger.Config{
		Level:  getEnvOrDefault("LOG_LEVEL", "info"),
		Format: getEnvOrDefault("LOG_FORMAT", "console"),
	}); err != nil {
		fmt.Fprintf(os.Stderr, "Failed to initialize logger: %v\n", err)
		os.Exit(1)
	}
	defer func() {
		_ = logger.Sync()
	}()

	logger.Info("Starting cross-chain lock reconciliation")

	// Load configuration
	cfg, err := reconcile.Load()
	if err != nil {
		logger.Fatalw("Failed to load configuration", "error", err)
	}

	logger.Infow("Configuration loaded",
		"mantle_chain_id", cfg.Mantle.ChainID,
		"ethereum_chain_id", cfg.Ethereum.ChainID,
		"start_block", cfg.Options.StartBlock,
		"dry_run", cfg.Options.DryRun,
		"chunk_size", cfg.Options.ChunkSize)

	// Create reconciler
	rec, err := reconcile.NewReconciler(cfg)
	if err != nil {
		logger.Fatalw("Failed to create reconciler", "error", err)
	}
	defer rec.Close()

	// Setup context with cancellation
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// Handle signals
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)
	go func() {
		<-sigChan
		logger.Info("Shutdown signal received")
		cancel()
	}()

	// Run reconciliation
	start := time.Now()
	result, err := rec.Run(ctx)
	if err != nil {
		logger.Fatalw("Reconciliation failed", "error", err)
	}

	// Report results
	logger.Infow("Reconciliation complete",
		"duration", time.Since(start).String(),
		"total_locks", result.TotalLocks,
		"consumed", result.ConsumedLocks,
		"orphaned", result.OrphanedLocks,
		"expired_orphans", result.ExpiredOrphans,
		"valid_orphans", result.ValidOrphans,
		"unlocked", result.UnlockedCount,
		"errors", len(result.Errors))

	if len(result.Errors) > 0 {
		logger.Warnw("Reconciliation completed with errors", "error_count", len(result.Errors))
		os.Exit(1)
	}

	if result.ValidOrphans > 0 {
		logger.Infow("Valid orphans found - consider running relayer rescan",
			"valid_orphans", result.ValidOrphans,
			"hint", "RELAYER_START_BLOCK=<block> ./bin/relayer")
	}

	logger.Info("Reconciliation finished successfully")
}

func getEnvOrDefault(key, defaultVal string) string {
	if val := os.Getenv(key); val != "" {
		return val
	}
	return defaultVal
}
