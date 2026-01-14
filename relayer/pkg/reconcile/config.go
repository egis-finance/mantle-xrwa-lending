package reconcile

import (
	"fmt"
	"math/big"
	"os"
	"strconv"

	"github.com/ethereum/go-ethereum/common"
	"github.com/joho/godotenv"
)

// Config holds reconcile command configuration
type Config struct {
	Mantle   ChainConfig
	Ethereum ChainConfig
	Admin    AdminConfig
	Options  ReconcileOptions
}

// ChainConfig holds chain-specific settings
type ChainConfig struct {
	ChainID         *big.Int
	RPCURL          string
	LockerAddress   common.Address // Mantle only
	ReceiverAddress common.Address // Ethereum only
}

// AdminConfig holds admin key for unlock transactions
type AdminConfig struct {
	PrivateKey string
	Address    common.Address
}

// ReconcileOptions holds reconcile behavior settings
type ReconcileOptions struct {
	StartBlock uint64 // Block to start scanning from
	DryRun     bool   // If true, only report - don't execute
	ChunkSize  uint64 // Number of blocks per log query
}

// Load reads configuration from environment
func Load() (*Config, error) {
	_ = godotenv.Load("../../.env")
	_ = godotenv.Load("../.env")
	_ = godotenv.Load(".env")

	cfg := &Config{}

	// Mantle configuration
	mantleChainID, err := getEnvInt("MANTLE_CHAIN_ID")
	if err != nil {
		return nil, fmt.Errorf("MANTLE_CHAIN_ID: %w", err)
	}
	cfg.Mantle.ChainID = big.NewInt(int64(mantleChainID))

	cfg.Mantle.RPCURL = os.Getenv("MANTLE_RPC_VTE")
	if cfg.Mantle.RPCURL == "" {
		return nil, fmt.Errorf("MANTLE_RPC_VTE not set")
	}

	mantleLocker := os.Getenv("MANTLE_LOCKER")
	if mantleLocker == "" {
		return nil, fmt.Errorf("MANTLE_LOCKER not set")
	}
	cfg.Mantle.LockerAddress = common.HexToAddress(mantleLocker)

	// Ethereum configuration
	ethChainID, err := getEnvInt("ETHEREUM_CHAIN_ID")
	if err != nil {
		return nil, fmt.Errorf("ETHEREUM_CHAIN_ID: %w", err)
	}
	cfg.Ethereum.ChainID = big.NewInt(int64(ethChainID))

	cfg.Ethereum.RPCURL = os.Getenv("ETHEREUM_RPC_VTE")
	if cfg.Ethereum.RPCURL == "" {
		return nil, fmt.Errorf("ETHEREUM_RPC_VTE not set")
	}

	ethReceiver := os.Getenv("ETH_RECEIVER")
	if ethReceiver == "" {
		return nil, fmt.Errorf("ETH_RECEIVER not set")
	}
	cfg.Ethereum.ReceiverAddress = common.HexToAddress(ethReceiver)

	// Admin configuration (uses ADMIN_PRIVATE_KEY for unlock calls)
	cfg.Admin.PrivateKey = os.Getenv("ADMIN_PRIVATE_KEY")
	if cfg.Admin.PrivateKey == "" {
		return nil, fmt.Errorf("ADMIN_PRIVATE_KEY not set")
	}

	adminAddr := os.Getenv("ADMIN_ADDRESS")
	if adminAddr != "" {
		cfg.Admin.Address = common.HexToAddress(adminAddr)
	}

	// Reconcile options
	cfg.Options.StartBlock = uint64(getEnvIntWithDefault("RECONCILE_START_BLOCK", 0))
	cfg.Options.DryRun = getEnvBoolWithDefault("RECONCILE_DRY_RUN", true)
	cfg.Options.ChunkSize = uint64(getEnvIntWithDefault("RECONCILE_CHUNK_SIZE", 50000))

	return cfg, nil
}

func getEnvInt(key string) (int, error) {
	val := os.Getenv(key)
	if val == "" {
		return 0, fmt.Errorf("%s not set", key)
	}
	return strconv.Atoi(val)
}

func getEnvIntWithDefault(key string, defaultVal int) int {
	val := os.Getenv(key)
	if val == "" {
		return defaultVal
	}
	intVal, err := strconv.Atoi(val)
	if err != nil {
		return defaultVal
	}
	return intVal
}

func getEnvBoolWithDefault(key string, defaultVal bool) bool {
	val := os.Getenv(key)
	if val == "" {
		return defaultVal
	}
	boolVal, err := strconv.ParseBool(val)
	if err != nil {
		return defaultVal
	}
	return boolVal
}
