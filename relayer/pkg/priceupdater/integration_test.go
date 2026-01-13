// Integration tests for price updater against Tenderly VTE
//
// These tests require:
//   - ETHEREUM_RPC_VTE environment variable pointing to Ethereum VTE
//   - ETH_ORACLE environment variable with NAVOracle address
//   - ADMIN_PRIVATE_KEY environment variable for write operations
//
// Tests will skip gracefully if environment is not configured.
//
// Run with: go test -tags=integration ./pkg/priceupdater/...
//
//go:build integration

package priceupdater

import (
	"context"
	"math/big"
	"os"
	"testing"
	"time"

	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/ethclient"
	"github.com/joho/godotenv"
)

func init() {
	// Load .env files for integration tests
	_ = godotenv.Load("../../../.env")
	_ = godotenv.Load("../../.env")
	_ = godotenv.Load("../.env")
	_ = godotenv.Load(".env")
}

// skipIfNoVTE skips the test if VTE is not configured
func skipIfNoVTE(t *testing.T) {
	t.Helper()
	if os.Getenv("ETHEREUM_RPC_VTE") == "" {
		t.Skip("ETHEREUM_RPC_VTE not set, skipping integration test")
	}
}

// skipIfNoOracle skips the test if NAVOracle is not configured
func skipIfNoOracle(t *testing.T) {
	t.Helper()
	skipIfNoVTE(t)
	if os.Getenv("ETH_ORACLE") == "" {
		t.Skip("ETH_ORACLE not set, skipping integration test")
	}
}

// skipIfNoAdminKey skips the test if admin key is not configured
func skipIfNoAdminKey(t *testing.T) {
	t.Helper()
	skipIfNoOracle(t)
	if os.Getenv("ADMIN_PRIVATE_KEY") == "" {
		t.Skip("ADMIN_PRIVATE_KEY not set, skipping integration test")
	}
}

// TestIntegration_OndoOracleRead tests reading from Ondo oracle on Ethereum VTE
func TestIntegration_OndoOracleRead(t *testing.T) {
	skipIfNoVTE(t)

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	client, err := ethclient.DialContext(ctx, os.Getenv("ETHEREUM_RPC_VTE"))
	if err != nil {
		t.Fatalf("Failed to connect to Ethereum VTE: %v", err)
	}
	defer client.Close()

	// Create Ondo client using well-known Ethereum oracle address
	ondoClient, err := NewOndoClient(client, OndoOracleEthereum)
	if err != nil {
		t.Fatalf("Failed to create Ondo client: %v", err)
	}

	// Fetch price
	price, err := ondoClient.GetPrice(ctx)
	if err != nil {
		t.Fatalf("Failed to get price from Ondo oracle: %v", err)
	}

	// Verify price is reasonable ($0.50 - $2.00)
	minPrice := big.NewInt(500_000_000_000_000_000)  // $0.50
	maxPrice := big.NewInt(2_000_000_000_000_000_000) // $2.00

	if price.Cmp(minPrice) < 0 || price.Cmp(maxPrice) > 0 {
		t.Errorf("Price %s outside reasonable range", price)
	}

	t.Logf("Ondo oracle price: %s (%s)", price, FormatPriceUSD(price))
}

// TestIntegration_NAVOracleRead tests reading from NAVOracle on Ethereum VTE
func TestIntegration_NAVOracleRead(t *testing.T) {
	skipIfNoOracle(t)

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	client, err := ethclient.DialContext(ctx, os.Getenv("ETHEREUM_RPC_VTE"))
	if err != nil {
		t.Fatalf("Failed to connect to Ethereum VTE: %v", err)
	}
	defer client.Close()

	oracleAddr := common.HexToAddress(os.Getenv("ETH_ORACLE"))

	// Create NAV client (with dummy private key for read-only operations)
	dummyKey := "0000000000000000000000000000000000000000000000000000000000000001"
	navClient, err := NewNAVClient(client, oracleAddr, big.NewInt(1), dummyKey)
	if err != nil {
		t.Fatalf("Failed to create NAV client: %v", err)
	}

	// Fetch state
	state, err := navClient.GetState(ctx)
	if err != nil {
		t.Fatalf("Failed to get NAVOracle state: %v", err)
	}

	t.Logf("NAVOracle state:")
	t.Logf("  Current Price: %s (%s)", state.CurrentPrice, FormatMorphoPrice(state.CurrentPrice))
	t.Logf("  Last Update:   %s", state.LastUpdate)
	t.Logf("  Is Stale:      %v", state.IsStale)
	t.Logf("  Admin:         %s", state.Admin.Hex())

	// Verify price is non-zero
	if state.CurrentPrice.Sign() <= 0 {
		t.Error("NAVOracle price should be positive")
	}

	// Admin should be non-zero address
	if state.Admin == (common.Address{}) {
		t.Error("NAVOracle admin should not be zero address")
	}
}

// TestIntegration_PriceConversion tests the full conversion pipeline
func TestIntegration_PriceConversion(t *testing.T) {
	skipIfNoVTE(t)

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	client, err := ethclient.DialContext(ctx, os.Getenv("ETHEREUM_RPC_VTE"))
	if err != nil {
		t.Fatalf("Failed to connect to Ethereum VTE: %v", err)
	}
	defer client.Close()

	// Fetch Ondo price
	ondoClient, err := NewOndoClient(client, OndoOracleEthereum)
	if err != nil {
		t.Fatalf("Failed to create Ondo client: %v", err)
	}

	ondoPrice, err := ondoClient.GetPrice(ctx)
	if err != nil {
		t.Fatalf("Failed to get Ondo price: %v", err)
	}

	// Convert to Morpho format
	morphoPrice := ConvertToMorphoFormat(ondoPrice)

	// Verify conversion is exactly × 10^6
	expectedMorpho := new(big.Int).Mul(ondoPrice, big.NewInt(1_000_000))
	if morphoPrice.Cmp(expectedMorpho) != 0 {
		t.Errorf("Morpho price %s != expected %s", morphoPrice, expectedMorpho)
	}

	// Verify USD display is consistent
	ondoUSD := FormatPriceUSD(ondoPrice)
	morphoUSD := FormatMorphoPrice(morphoPrice)
	if ondoUSD != morphoUSD {
		t.Errorf("USD display mismatch: Ondo %s vs Morpho %s", ondoUSD, morphoUSD)
	}

	t.Logf("Ondo price (18 dec):   %s (%s)", ondoPrice, ondoUSD)
	t.Logf("Morpho price (24 dec): %s (%s)", morphoPrice, morphoUSD)
}

// TestIntegration_UpdaterHealthCheck tests the updater health check
func TestIntegration_UpdaterHealthCheck(t *testing.T) {
	skipIfNoAdminKey(t)

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	cfg, err := Load()
	if err != nil {
		t.Fatalf("Failed to load config: %v", err)
	}

	updater, err := NewUpdater(cfg)
	if err != nil {
		t.Fatalf("Failed to create updater: %v", err)
	}

	err = updater.CheckHealth(ctx)
	if err != nil {
		t.Fatalf("Health check failed: %v", err)
	}

	t.Log("Health check passed")
	t.Logf("  Ondo Oracle:  %s", updater.OndoOracleAddress().Hex())
	t.Logf("  NAV Oracle:   %s", updater.NAVOracleAddress().Hex())
	t.Logf("  Signer:       %s", updater.SignerAddress().Hex())
}

// TestIntegration_UpdaterDryRun tests the updater in dry run mode
func TestIntegration_UpdaterDryRun(t *testing.T) {
	skipIfNoAdminKey(t)

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	cfg, err := Load()
	if err != nil {
		t.Fatalf("Failed to load config: %v", err)
	}

	// Force dry run mode for this test
	cfg.DryRun = true

	updater, err := NewUpdater(cfg)
	if err != nil {
		t.Fatalf("Failed to create updater: %v", err)
	}

	result, err := updater.Run(ctx)
	if err != nil {
		t.Fatalf("Dry run failed: %v", err)
	}

	// Verify dry run flag is set
	if !result.DryRun {
		t.Error("Expected DryRun to be true")
	}

	// Verify no transaction was submitted
	if result.TxHash != ([32]byte{}) {
		t.Error("Expected no TxHash in dry run mode")
	}

	t.Logf("Dry run result:")
	t.Logf("  Ondo Price:     %s (%s)", result.OndoPrice, FormatPriceUSD(result.OndoPrice))
	t.Logf("  Morpho Price:   %s (%s)", result.MorphoPrice, FormatMorphoPrice(result.MorphoPrice))
	t.Logf("  Previous Price: %s (%s)", result.PreviousPrice, FormatMorphoPrice(result.PreviousPrice))
	t.Logf("  Duration:       %s", result.Duration)
}

// TestIntegration_FullPriceUpdate tests a real price update (CAUTION: modifies state)
// This test is disabled by default as it submits transactions
func TestIntegration_FullPriceUpdate(t *testing.T) {
	// Disable by default - uncomment to run
	t.Skip("Skipping full price update test (modifies chain state)")

	skipIfNoAdminKey(t)

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()

	cfg, err := Load()
	if err != nil {
		t.Fatalf("Failed to load config: %v", err)
	}

	// Ensure NOT dry run for this test
	cfg.DryRun = false

	updater, err := NewUpdater(cfg)
	if err != nil {
		t.Fatalf("Failed to create updater: %v", err)
	}

	result, err := updater.Run(ctx)
	if err != nil {
		t.Fatalf("Price update failed: %v", err)
	}

	t.Logf("Full price update result:")
	t.Logf("  Ondo Price:     %s (%s)", result.OndoPrice, FormatPriceUSD(result.OndoPrice))
	t.Logf("  Morpho Price:   %s (%s)", result.MorphoPrice, FormatMorphoPrice(result.MorphoPrice))
	t.Logf("  Previous Price: %s (%s)", result.PreviousPrice, FormatMorphoPrice(result.PreviousPrice))
	t.Logf("  TX Hash:        %s", result.TxHash.Hex())
	t.Logf("  Block:          %d", result.BlockNumber)
	t.Logf("  Gas Used:       %d", result.GasUsed)
	t.Logf("  Duration:       %s", result.Duration)
}

// TestIntegration_MantleOndoOracle tests reading from Ondo oracle on Mantle VTE
func TestIntegration_MantleOndoOracle(t *testing.T) {
	mantleRPC := os.Getenv("MANTLE_RPC_VTE")
	if mantleRPC == "" {
		t.Skip("MANTLE_RPC_VTE not set, skipping Mantle integration test")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	client, err := ethclient.DialContext(ctx, mantleRPC)
	if err != nil {
		t.Fatalf("Failed to connect to Mantle VTE: %v", err)
	}
	defer client.Close()

	// Create Ondo client using Mantle oracle address
	ondoClient, err := NewOndoClient(client, OndoOracleMantle)
	if err != nil {
		t.Fatalf("Failed to create Ondo client: %v", err)
	}

	// Fetch price
	price, err := ondoClient.GetPrice(ctx)
	if err != nil {
		t.Fatalf("Failed to get price from Mantle Ondo oracle: %v", err)
	}

	t.Logf("Mantle Ondo oracle price: %s (%s)", price, FormatPriceUSD(price))

	// Verify price is reasonable
	minPrice := big.NewInt(500_000_000_000_000_000)  // $0.50
	maxPrice := big.NewInt(2_000_000_000_000_000_000) // $2.00

	if price.Cmp(minPrice) < 0 || price.Cmp(maxPrice) > 0 {
		t.Errorf("Price %s outside reasonable range", price)
	}
}

// TestIntegration_ComparePricesBetweenChains compares Ondo prices on Ethereum vs Mantle
func TestIntegration_ComparePricesBetweenChains(t *testing.T) {
	ethRPC := os.Getenv("ETHEREUM_RPC_VTE")
	mantleRPC := os.Getenv("MANTLE_RPC_VTE")
	if ethRPC == "" || mantleRPC == "" {
		t.Skip("Both ETHEREUM_RPC_VTE and MANTLE_RPC_VTE required")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	// Connect to Ethereum
	ethClient, err := ethclient.DialContext(ctx, ethRPC)
	if err != nil {
		t.Fatalf("Failed to connect to Ethereum: %v", err)
	}
	defer ethClient.Close()

	// Connect to Mantle
	mantleClient, err := ethclient.DialContext(ctx, mantleRPC)
	if err != nil {
		t.Fatalf("Failed to connect to Mantle: %v", err)
	}
	defer mantleClient.Close()

	// Fetch Ethereum price
	ethOndoClient, _ := NewOndoClient(ethClient, OndoOracleEthereum)
	ethPrice, err := ethOndoClient.GetPrice(ctx)
	if err != nil {
		t.Fatalf("Failed to get Ethereum price: %v", err)
	}

	// Fetch Mantle price
	mantleOndoClient, _ := NewOndoClient(mantleClient, OndoOracleMantle)
	mantlePrice, err := mantleOndoClient.GetPrice(ctx)
	if err != nil {
		t.Fatalf("Failed to get Mantle price: %v", err)
	}

	t.Logf("Ethereum Ondo price: %s (%s)", ethPrice, FormatPriceUSD(ethPrice))
	t.Logf("Mantle Ondo price:   %s (%s)", mantlePrice, FormatPriceUSD(mantlePrice))

	// Calculate difference
	diff := new(big.Int).Sub(ethPrice, mantlePrice)
	if diff.Sign() < 0 {
		diff.Neg(diff)
	}

	// Allow up to 5% difference (VTE forks may be at different times)
	maxDiff := new(big.Int).Div(ethPrice, big.NewInt(20)) // 5%
	if diff.Cmp(maxDiff) > 0 {
		t.Logf("Warning: Price difference >5%% (diff: %s)", diff)
	}
}
