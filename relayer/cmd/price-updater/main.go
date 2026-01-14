// Price Updater - Automated USDY Price Feed for Morpho Blue Integration
//
// This service fetches USDY prices from Ondo's authoritative oracle and pushes them
// to our NAVOracle contract, which Morpho Blue uses for collateral valuation.
//
// Designed to run as a Railway cron job on a 6-hour schedule:
//
//	┌──────────────────────────────────────────────────────────────────────────┐
//	│                         Price Update Flow                                 │
//	├──────────────────────────────────────────────────────────────────────────┤
//	│                                                                           │
//	│   Railway Cron (0 */6 * * *)                                             │
//	│         │                                                                 │
//	│         ▼                                                                 │
//	│   ┌─────────────┐     getPrice()      ┌─────────────────┐                │
//	│   │   Ondo      │◄───────────────────│  Price Updater  │                │
//	│   │   Oracle    │   $1.12 (18 dec)    │  (this binary)  │                │
//	│   └─────────────┘                     └────────┬────────┘                │
//	│                                                │                          │
//	│                                                │ updatePrice()            │
//	│                                                │ $1.12 (24 dec)           │
//	│                                                ▼                          │
//	│   ┌─────────────┐     price()         ┌─────────────────┐                │
//	│   │   Morpho    │◄───────────────────│   NAVOracle     │                │
//	│   │   Blue      │   $1.098 (haircut)  │   (Ethereum)    │                │
//	│   └─────────────┘                     └─────────────────┘                │
//	│                                                                           │
//	└──────────────────────────────────────────────────────────────────────────┘
//
// Key Design Decisions:
//
//  1. Push vs Pull: We use a push model where this service writes prices to NAVOracle,
//     rather than having NAVOracle pull from Ondo. This keeps NAVOracle simple and
//     gas-efficient (no external calls during Morpho transactions).
//
//  2. Decimal Conversion: Ondo returns 18 decimals, Morpho needs 24 decimals.
//     We multiply by 10^6 during conversion.
//
//  3. Staleness: NAVOracle has a 24-hour staleness window. Running every 6 hours
//     provides a 4x safety margin (can tolerate 3 consecutive failures).
//
//  4. Idempotency: If the price hasn't changed, we skip the transaction to save gas.
//
// Environment Variables (loaded from .env):
//
//	ETHEREUM_RPC_VTE     - Ethereum RPC endpoint
//	ETH_ORACLE           - NAVOracle contract address
//	ADMIN_PRIVATE_KEY    - Private key for updatePrice() calls
//	ETHEREUM_CHAIN_ID    - Chain ID (10001 for VTE, 1 for mainnet)
//	ONDO_ORACLE_ADDRESS  - (Optional) Override Ondo oracle address
//	PRICE_UPDATER_DRY_RUN- (Optional) Set to "true" for simulation mode
//	LOG_LEVEL            - (Optional) debug, info, warn, error
//
// Exit Codes:
//
//	0 - Success (price updated or no update needed)
//	1 - Configuration error
//	2 - Connection error (RPC unreachable)
//	3 - Authorization error (signer not admin)
//	4 - Transaction error (reverted or failed)
package main

import (
	"context"
	"fmt"
	"os"
	"strings"
	"time"

	"github.com/egis-finance/mantle-xrwa-lending/relayer/pkg/priceupdater"
)

const (
	// Exit codes
	exitSuccess       = 0
	exitConfigError   = 1
	exitConnError     = 2
	exitAuthError     = 3
	exitTxError       = 4

	// Operation timeout (2 minutes should be plenty for a single update)
	operationTimeout = 2 * time.Minute
)

func main() {
	os.Exit(run())
}

func run() int {
	ctx, cancel := context.WithTimeout(context.Background(), operationTimeout)
	defer cancel()

	// Load configuration
	cfg, err := priceupdater.Load()
	if err != nil {
		fmt.Fprintf(os.Stderr, "Configuration error: %v\n", err)
		return exitConfigError
	}

	logInfo("Starting USDY price updater")
	logInfo("  NAVOracle:   %s", cfg.NAVOracleAddress.Hex())
	logInfo("  Ondo Oracle: %s", cfg.OndoOracleAddress.Hex())
	logInfo("  Chain ID:    %d", cfg.ChainID)
	logInfo("  Dry Run:     %v", cfg.DryRun)

	// Create updater
	updater, err := priceupdater.NewUpdater(cfg)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Failed to create updater: %v\n", err)
		return exitConnError
	}
	defer updater.Close()

	// Pre-flight health check
	logInfo("Running health check...")
	if err := updater.CheckHealth(ctx); err != nil {
		fmt.Fprintf(os.Stderr, "Health check failed: %v\n", err)
		// Determine exit code based on error type
		if strings.Contains(err.Error(), "admin") {
			return exitAuthError
		}
		return exitConnError
	}
	logInfo("Health check passed")

	// Fetch and display current state
	navState, err := updater.GetNAVState(ctx)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Failed to get NAVOracle state: %v\n", err)
		return exitConnError
	}

	logInfo("Current NAVOracle state:")
	logInfo("  Price:       %s (%s)", navState.CurrentPrice.String(), priceupdater.FormatMorphoPrice(navState.CurrentPrice))
	logInfo("  Last Update: %s", navState.LastUpdate.Format(time.RFC3339))
	logInfo("  Is Stale:    %v", navState.IsStale)
	logInfo("  Admin:       %s", navState.Admin.Hex())
	logInfo("  Signer:      %s", updater.SignerAddress().Hex())

	// Run the price update
	logInfo("Fetching price from Ondo oracle...")
	result, err := updater.Run(ctx)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Price update failed: %v\n", err)
		return exitTxError
	}

	// Report results
	logInfo("Price update complete:")
	logInfo("  Ondo Price (18 dec):    %s (%s)", result.OndoPrice.String(), priceupdater.FormatPriceUSD(result.OndoPrice))
	logInfo("  Morpho Price (24 dec):  %s (%s)", result.MorphoPrice.String(), priceupdater.FormatMorphoPrice(result.MorphoPrice))
	logInfo("  Previous Price:         %s (%s)", result.PreviousPrice.String(), priceupdater.FormatMorphoPrice(result.PreviousPrice))

	if result.DryRun {
		logInfo("  Mode: DRY RUN (no transaction submitted)")
	} else if result.TxHash == ([32]byte{}) {
		logInfo("  Mode: SKIPPED (price unchanged and not stale)")
	} else {
		logInfo("  TX Hash:    %s", result.TxHash.Hex())
		logInfo("  Block:      %d", result.BlockNumber)
		logInfo("  Gas Used:   %d", result.GasUsed)
	}

	logInfo("  Duration:   %s", result.Duration)
	logInfo("Price update successful")

	return exitSuccess
}

// logInfo prints a formatted info message to stdout
func logInfo(format string, args ...interface{}) {
	timestamp := time.Now().Format("2006-01-02T15:04:05Z07:00")
	msg := fmt.Sprintf(format, args...)
	fmt.Printf("[%s] INFO  %s\n", timestamp, msg)
}

