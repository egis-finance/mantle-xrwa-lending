package priceupdater

import (
	"context"
	"fmt"
	"math/big"
	"strings"
	"time"

	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/ethclient"
)

const (
	maxOndoRetries = 3              // retries after initial attempt (4 total attempts)
	ondoRetryDelay = 5 * time.Second // base delay between retries
)

// UpdateResult contains the outcome of a price update operation
type UpdateResult struct {
	// OndoPrice is the price fetched from Ondo oracle (18 decimals)
	OndoPrice *big.Int

	// MorphoPrice is the converted price for NAVOracle (24 decimals)
	MorphoPrice *big.Int

	// PreviousPrice is the NAVOracle price before update (24 decimals)
	PreviousPrice *big.Int

	// TxHash is the transaction hash (empty if dry run)
	TxHash common.Hash

	// BlockNumber is the block where the update was confirmed
	BlockNumber uint64

	// GasUsed is the gas consumed by the transaction
	GasUsed uint64

	// DryRun indicates if this was a simulation only
	DryRun bool

	// Duration is how long the update operation took
	Duration time.Duration
}

// Updater orchestrates USDY price updates from Ondo oracle to NAVOracle
//
// Designed to be run as a Railway cron job every 6 hours:
//
//	┌─────────────────┐      ┌─────────────────┐      ┌─────────────────┐
//	│  Ondo Oracle    │      │    Updater      │      │   NAVOracle     │
//	│  (Ethereum)     │      │  (this code)    │      │  (Ethereum)     │
//	│                 │      │                 │      │                 │
//	│  getPrice()     │─────►│  Convert to     │─────►│  updatePrice()  │
//	│  18 decimals    │      │  24 decimals    │      │  24 decimals    │
//	└─────────────────┘      └─────────────────┘      └─────────────────┘
//
// The Updater handles:
//   - Reading current price from Ondo's RWADynamicRateOracle
//   - Converting from 18 to 24 decimal format
//   - Validating the price is within reasonable bounds
//   - Checking admin authorization
//   - Submitting updatePrice() transaction
//   - Waiting for confirmation
type Updater struct {
	ondoClient *OndoClient
	navClient  *NAVClient
	config     *Config
	ethClient  *ethclient.Client // stored for cleanup
}

// NewUpdater creates a price updater from configuration
func NewUpdater(cfg *Config) (*Updater, error) {
	if err := cfg.Validate(); err != nil {
		return nil, fmt.Errorf("invalid configuration: %w", err)
	}

	// Connect to Ethereum
	client, err := ethclient.Dial(cfg.EthereumRPC)
	if err != nil {
		return nil, fmt.Errorf("failed to connect to Ethereum: %w", err)
	}

	// Create Ondo oracle client
	ondoClient, err := NewOndoClient(client, cfg.OndoOracleAddress)
	if err != nil {
		return nil, fmt.Errorf("failed to create Ondo client: %w", err)
	}

	// Create NAVOracle client
	navClient, err := NewNAVClient(client, cfg.NAVOracleAddress, big.NewInt(cfg.ChainID), cfg.AdminPrivateKey)
	if err != nil {
		return nil, fmt.Errorf("failed to create NAV client: %w", err)
	}

	return &Updater{
		ondoClient: ondoClient,
		navClient:  navClient,
		config:     cfg,
		ethClient:  client,
	}, nil
}

// NewUpdaterWithClients creates an updater with pre-configured clients (for testing)
func NewUpdaterWithClients(ondoClient *OndoClient, navClient *NAVClient, cfg *Config) *Updater {
	return &Updater{
		ondoClient: ondoClient,
		navClient:  navClient,
		config:     cfg,
	}
}

// Close releases resources held by the updater (nil-safe for test clients)
func (u *Updater) Close() {
	if u.ethClient != nil {
		u.ethClient.Close()
	}
}

// getOndoPriceWithRetry fetches the Ondo price with retry logic for transient failures
func (u *Updater) getOndoPriceWithRetry(ctx context.Context) (*big.Int, error) {
	var lastErr error
	for attempt := 0; attempt <= maxOndoRetries; attempt++ {
		if attempt > 0 {
			delay := ondoRetryDelay * time.Duration(attempt) // linear: 5s, 10s, 15s
			select {
			case <-ctx.Done():
				return nil, fmt.Errorf("context cancelled after %d attempts: %w", attempt, lastErr)
			case <-time.After(delay):
			}
		}
		price, err := u.ondoClient.GetPrice(ctx)
		if err == nil {
			return price, nil
		}
		// Don't retry our own sanity check failures
		if strings.Contains(err.Error(), "outside reasonable range") {
			return nil, err
		}
		lastErr = err
	}
	return nil, fmt.Errorf("ondo price fetch failed after %d attempts: %w", maxOndoRetries+1, lastErr)
}

// Run executes a complete price update cycle
//
// Steps:
//  1. Fetch current price from Ondo oracle
//  2. Convert to Morpho format (18 → 24 decimals)
//  3. Validate admin authorization
//  4. Check if update is needed (price changed significantly)
//  5. Submit updatePrice() transaction (unless dry run)
//  6. Wait for confirmation
//
// Returns UpdateResult with details of the operation
func (u *Updater) Run(ctx context.Context) (*UpdateResult, error) {
	start := time.Now()
	result := &UpdateResult{
		DryRun: u.config.DryRun,
	}

	// Step 1: Fetch Ondo price (with retry for transient failures)
	ondoPrice, err := u.getOndoPriceWithRetry(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch Ondo price: %w", err)
	}
	result.OndoPrice = ondoPrice

	// Step 2: Convert to Morpho format
	morphoPrice := ConvertToMorphoFormat(ondoPrice)
	result.MorphoPrice = morphoPrice

	// Step 3: Fetch current NAVOracle state
	navState, err := u.navClient.GetState(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch NAVOracle state: %w", err)
	}
	result.PreviousPrice = navState.CurrentPrice

	// Step 4: Validate admin authorization
	signerAddr := u.navClient.SignerAddress()
	if navState.Admin != signerAddr {
		return nil, fmt.Errorf("signer %s is not the NAVOracle admin %s", signerAddr.Hex(), navState.Admin.Hex())
	}

	// Step 5: Check if update is needed
	// Skip if price hasn't changed (saves gas)
	if navState.CurrentPrice.Cmp(morphoPrice) == 0 && !navState.IsStale {
		result.Duration = time.Since(start)
		return result, nil // No update needed
	}

	// Step 6: Submit transaction (unless dry run)
	if u.config.DryRun {
		result.Duration = time.Since(start)
		return result, nil
	}

	tx, err := u.navClient.UpdatePrice(ctx, morphoPrice)
	if err != nil {
		return nil, fmt.Errorf("failed to submit updatePrice transaction: %w", err)
	}
	result.TxHash = tx.Hash()

	// Step 7: Wait for confirmation
	receipt, err := u.navClient.WaitForReceipt(ctx, tx)
	if err != nil {
		return nil, fmt.Errorf("transaction failed: %w", err)
	}
	result.BlockNumber = receipt.BlockNumber.Uint64()
	result.GasUsed = receipt.GasUsed

	result.Duration = time.Since(start)
	return result, nil
}

// CheckHealth verifies NAVOracle connectivity and admin access
//
// Ondo oracle health is tested in Run() with retry logic instead of here
// to avoid transient failures aborting the cron job prematurely.
//
// Returns nil if healthy, error describing the issue otherwise
func (u *Updater) CheckHealth(ctx context.Context) error {
	// Check NAVOracle is readable
	navState, err := u.navClient.GetState(ctx)
	if err != nil {
		return fmt.Errorf("cannot read NAVOracle: %w", err)
	}

	// Check admin authorization
	signerAddr := u.navClient.SignerAddress()
	if navState.Admin != signerAddr {
		return fmt.Errorf("signer %s is not admin %s", signerAddr.Hex(), navState.Admin.Hex())
	}

	return nil
}

// GetOndoPrice fetches the current USDY price from Ondo oracle
func (u *Updater) GetOndoPrice(ctx context.Context) (*big.Int, error) {
	return u.ondoClient.GetPrice(ctx)
}

// GetNAVState fetches the current NAVOracle state
func (u *Updater) GetNAVState(ctx context.Context) (*NAVOracleState, error) {
	return u.navClient.GetState(ctx)
}

// OndoOracleAddress returns the Ondo oracle address being used
func (u *Updater) OndoOracleAddress() common.Address {
	return u.ondoClient.OracleAddress()
}

// NAVOracleAddress returns the NAVOracle address being updated
func (u *Updater) NAVOracleAddress() common.Address {
	return u.navClient.OracleAddress()
}

// SignerAddress returns the address that will sign transactions
func (u *Updater) SignerAddress() common.Address {
	return u.navClient.SignerAddress()
}
