package main

import (
	"context"
	"fmt"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/egis-finance/mantle-xrwa-lending/relayer/pkg/config"
	"github.com/egis-finance/mantle-xrwa-lending/relayer/pkg/dvn"
	"github.com/egis-finance/mantle-xrwa-lending/relayer/pkg/logger"
	"github.com/egis-finance/mantle-xrwa-lending/relayer/pkg/observability"
)

func main() {
	// Load configuration first
	cfg, err := config.Load()
	if err != nil {
		fmt.Fprintf(os.Stderr, "Failed to load configuration: %v\n", err)
		os.Exit(1)
	}

	// Initialize logger from config
	if err := logger.Init(logger.Config{
		Level:      cfg.Logging.Level,
		Format:     cfg.Logging.Format,
		OutputPath: cfg.Logging.OutputPath,
		MaxSize:    cfg.Logging.MaxSize,
		MaxBackups: cfg.Logging.MaxBackups,
		MaxAge:     cfg.Logging.MaxAge,
	}); err != nil {
		fmt.Fprintf(os.Stderr, "Failed to initialize logger: %v\n", err)
		os.Exit(1)
	}
	defer func() {
		_ = logger.Sync() // Best effort flush, ignore error on shutdown
	}()

	logger.Info("Starting xRWA DVN Relayer")

	logger.Infow("Configuration loaded",
		"mantle_chain_id", cfg.Mantle.ChainID,
		"ethereum_chain_id", cfg.Ethereum.ChainID,
		"log_level", cfg.Logging.Level,
		"http_port", cfg.HTTP.Port,
		"tracing_enabled", cfg.Tracing.Enabled,
	)

	// Initialize tracing (if enabled)
	tracingShutdown, err := observability.InitTracing(observability.TracingConfig{
		Enabled:     cfg.Tracing.Enabled,
		Endpoint:    cfg.Tracing.Endpoint,
		ServiceName: cfg.Tracing.ServiceName,
		Environment: cfg.Tracing.Environment,
	})
	if err != nil {
		logger.Fatalw("Failed to initialize tracing", "error", err)
	}
	defer func() {
		if tracingShutdown != nil {
			ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
			defer cancel()
			if err := tracingShutdown(ctx); err != nil {
				logger.Errorw("Error shutting down tracing", "error", err)
			}
		}
	}()

	if cfg.Tracing.Enabled {
		logger.Infow("Tracing initialized",
			"endpoint", cfg.Tracing.Endpoint,
			"service", cfg.Tracing.ServiceName,
		)
	}

	// Initialize metrics
	metrics := observability.NewMetrics()

	// Create context with cancellation
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// Initialize DVN relayer
	relayer, err := dvn.NewRelayer(cfg, metrics)
	if err != nil {
		logger.Fatalw("Failed to create relayer", "error", err)
	}

	// Create HTTP server for metrics and health endpoints
	httpServer := observability.NewServer(cfg.HTTP.Port, relayer)

	// Start HTTP server in separate goroutine
	go func() {
		logger.Infow("Starting HTTP server", "port", cfg.HTTP.Port)
		if err := httpServer.Start(); err != nil && err != http.ErrServerClosed {
			logger.Errorw("HTTP server error", "error", err)
		}
	}()

	// Start relayer
	if err := relayer.Start(ctx); err != nil {
		logger.Fatalw("Failed to start relayer", "error", err)
	}

	logger.Info("Relayer started successfully")

	// Handle graceful shutdown
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)

	<-sigChan
	logger.Info("Shutdown signal received, stopping relayer...")

	// Cancel context to signal goroutines to exit
	cancel()

	// Give relayer 10 seconds to stop gracefully
	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer shutdownCancel()

	// Stop HTTP server
	if err := httpServer.Stop(shutdownCtx); err != nil {
		logger.Errorw("Error stopping HTTP server", "error", err)
	}

	// Stop relayer (flushes persistence and closes connections)
	if err := relayer.Stop(shutdownCtx); err != nil {
		logger.Errorw("Error during relayer shutdown", "error", err)
	}

	logger.Info("Relayer stopped successfully")
}
