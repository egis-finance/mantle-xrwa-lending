package main

import (
	"context"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/egis-finance/mantle-xrwa-lending/relayer/pkg/config"
	"github.com/egis-finance/mantle-xrwa-lending/relayer/pkg/dvn"
	"github.com/ethereum/go-ethereum/log"
)

func main() {
	// Initialize logger with simple text format
	glogger := log.NewGlogHandler(log.NewTerminalHandler(os.Stdout, true))
	log.SetDefault(log.NewLogger(glogger))

	log.Info("Starting xRWA DVN Relayer")

	// Load configuration
	cfg, err := config.Load()
	if err != nil {
		log.Crit("Failed to load configuration", "error", err)
	}

	log.Info("Configuration loaded",
		"mantle_chain_id", cfg.Mantle.ChainID,
		"ethereum_chain_id", cfg.Ethereum.ChainID,
	)

	// Create context with cancellation
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// Initialize DVN relayer
	relayer, err := dvn.NewRelayer(cfg)
	if err != nil {
		log.Crit("Failed to create relayer", "error", err)
	}

	// Start relayer
	if err := relayer.Start(ctx); err != nil {
		log.Crit("Failed to start relayer", "error", err)
	}

	log.Info("Relayer started successfully")

	// Handle graceful shutdown
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)

	<-sigChan
	log.Info("Shutdown signal received, stopping relayer...")

	// Give relayer 10 seconds to stop gracefully
	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer shutdownCancel()

	if err := relayer.Stop(shutdownCtx); err != nil {
		log.Error("Error during shutdown", "error", err)
	}

	log.Info("Relayer stopped successfully")
}
