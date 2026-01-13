// Package priceupdater provides automated USDY price updates for the NAVOracle contract.
//
// Architecture Overview:
// This package implements a "push oracle" pattern where prices are periodically fetched
// from Ondo's authoritative RWADynamicRateOracle and pushed to our NAVOracle contract.
// The NAVOracle is then queried by Morpho Blue during borrow/liquidation operations.
//
// Price Flow:
//
//	Ondo RWADynamicRateOracle (Ethereum)    NAVOracle (Ethereum)       Morpho Blue
//	         │                                    │                         │
//	         │  getPrice() → 18 decimals          │                         │
//	         ├────────────────────────────────────►                         │
//	         │                                    │                         │
//	         │  updatePrice() → 24 decimals       │                         │
//	         │  (after conversion)                │                         │
//	         ├────────────────────────────────────►                         │
//	         │                                    │  price() → 24 decimals  │
//	         │                                    ├─────────────────────────►
//	         │                                    │  (on borrow/liquidate)  │
//
// Decimal Conversion:
// Ondo oracle returns prices in 18 decimals (e.g., 1.12 USDY = 1_120_000_000_000_000_000)
// Morpho Blue expects 10^(36 + loanDecimals - collateralDecimals) = 10^(36 + 6 - 18) = 10^24
// Conversion: multiply Ondo price by 10^6
//
// Staleness:
// NAVOracle enforces a 24-hour staleness window. If lastUpdate + 24h < block.timestamp,
// price() reverts with StalePrice error, blocking all borrows and liquidations.
// The price updater should run at least every 6-12 hours to maintain adequate buffer.
package priceupdater

import (
	"fmt"
	"os"
	"strconv"

	"github.com/ethereum/go-ethereum/common"
	"github.com/joho/godotenv"
)

// Well-known Ondo RWADynamicRateOracle addresses
// These are the authoritative USDY price sources maintained by Ondo Finance
var (
	// OndoOracleEthereum is the Ondo USDY price oracle on Ethereum mainnet
	// Returns USDY redemption price in 18 decimals via getPrice()
	// Source: https://docs.ondo.finance/addresses
	OndoOracleEthereum = common.HexToAddress("0xA0219AA5B31e65Bc920B5b6DFb8EdF0988121De0")

	// OndoOracleMantle is the Ondo USDY price oracle on Mantle network
	// Returns USDY redemption price in 18 decimals via getPrice()
	// Source: https://docs.ondo.finance/addresses
	OndoOracleMantle = common.HexToAddress("0xA96abbe61AfEdEB0D14a20440Ae7100D9aB4882f")
)

// Config holds all price updater configuration
type Config struct {
	// EthereumRPC is the Ethereum RPC endpoint (VTE or mainnet)
	EthereumRPC string

	// NAVOracleAddress is our deployed NAVOracle contract address
	NAVOracleAddress common.Address

	// OndoOracleAddress is the Ondo price oracle to read from
	// Defaults to OndoOracleEthereum if not specified
	OndoOracleAddress common.Address

	// AdminPrivateKey is the private key authorized to call updatePrice()
	// Must match the admin address set in NAVOracle contract
	AdminPrivateKey string

	// ChainID is the Ethereum chain ID (1 for mainnet, custom for VTE)
	ChainID int64

	// DryRun if true, fetches and logs price but doesn't submit transaction
	DryRun bool

	// LogLevel controls logging verbosity (debug, info, warn, error)
	LogLevel string
}

// Load reads price updater configuration from environment variables.
// Compatible with the project's root .env file structure.
//
// Required environment variables:
//   - ETHEREUM_RPC_VTE: Ethereum RPC endpoint
//   - ETH_ORACLE: Deployed NAVOracle contract address
//   - ADMIN_PRIVATE_KEY: Private key for updatePrice() calls
//   - ETHEREUM_CHAIN_ID: Chain ID (10001 for VTE, 1 for mainnet)
//
// Optional environment variables:
//   - ONDO_ORACLE_ADDRESS: Override Ondo oracle address (defaults to Ethereum mainnet)
//   - PRICE_UPDATER_DRY_RUN: Set to "true" to skip transaction submission
//   - LOG_LEVEL: Logging verbosity (default: info)
func Load() (*Config, error) {
	// Search for .env in multiple locations (relayer subdirectory structure)
	_ = godotenv.Load("../../.env")
	_ = godotenv.Load("../.env")
	_ = godotenv.Load(".env")

	cfg := &Config{}

	// Required: Ethereum RPC
	cfg.EthereumRPC = os.Getenv("ETHEREUM_RPC_VTE")
	if cfg.EthereumRPC == "" {
		return nil, fmt.Errorf("ETHEREUM_RPC_VTE not set")
	}

	// Required: NAVOracle address
	navOracle := os.Getenv("ETH_ORACLE")
	if navOracle == "" {
		return nil, fmt.Errorf("ETH_ORACLE not set")
	}
	cfg.NAVOracleAddress = common.HexToAddress(navOracle)

	// Required: Admin private key
	cfg.AdminPrivateKey = os.Getenv("ADMIN_PRIVATE_KEY")
	if cfg.AdminPrivateKey == "" {
		return nil, fmt.Errorf("ADMIN_PRIVATE_KEY not set")
	}

	// Required: Chain ID
	chainIDStr := os.Getenv("ETHEREUM_CHAIN_ID")
	if chainIDStr == "" {
		return nil, fmt.Errorf("ETHEREUM_CHAIN_ID not set")
	}
	chainID, err := strconv.ParseInt(chainIDStr, 10, 64)
	if err != nil {
		return nil, fmt.Errorf("invalid ETHEREUM_CHAIN_ID: %w", err)
	}
	cfg.ChainID = chainID

	// Optional: Ondo oracle address (default to Ethereum mainnet oracle)
	ondoOracle := os.Getenv("ONDO_ORACLE_ADDRESS")
	if ondoOracle != "" {
		cfg.OndoOracleAddress = common.HexToAddress(ondoOracle)
	} else {
		cfg.OndoOracleAddress = OndoOracleEthereum
	}

	// Optional: Dry run mode
	cfg.DryRun = os.Getenv("PRICE_UPDATER_DRY_RUN") == "true"

	// Optional: Log level (default: info)
	cfg.LogLevel = os.Getenv("LOG_LEVEL")
	if cfg.LogLevel == "" {
		cfg.LogLevel = "info"
	}

	return cfg, nil
}

// Validate checks that the configuration is valid for operation
func (c *Config) Validate() error {
	if c.EthereumRPC == "" {
		return fmt.Errorf("EthereumRPC is required")
	}
	if c.NAVOracleAddress == (common.Address{}) {
		return fmt.Errorf("NAVOracleAddress is required")
	}
	if c.OndoOracleAddress == (common.Address{}) {
		return fmt.Errorf("OndoOracleAddress is required")
	}
	if c.AdminPrivateKey == "" {
		return fmt.Errorf("AdminPrivateKey is required")
	}
	if c.ChainID == 0 {
		return fmt.Errorf("ChainID is required")
	}
	return nil
}
