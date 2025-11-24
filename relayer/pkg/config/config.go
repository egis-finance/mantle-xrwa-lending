package config

import (
	"fmt"
	"math/big"
	"os"
	"strconv"
	"time"

	"github.com/ethereum/go-ethereum/common"
	"github.com/joho/godotenv"
)

// Config holds all relayer configuration
type Config struct {
	Mantle      ChainConfig
	Ethereum    ChainConfig
	DVN         DVNConfig
	Retry       RetryConfig
	Relayer     RelayerConfig
	Persistence PersistenceConfig
	Logging     LoggingConfig
	HTTP        HTTPConfig
	Tracing     TracingConfig
}

// RetryConfig holds retry behavior configuration
type RetryConfig struct {
	MaxRetries          int
	EnableBackoff       bool
	HealthCheckInterval int           // seconds
	BaseRetryDelay      time.Duration // base delay for exponential backoff
	RPCTimeout          time.Duration // timeout for RPC calls
}

// RelayerConfig holds relayer-specific tuning parameters
type RelayerConfig struct {
	PollInterval     time.Duration // polling interval when subscription unavailable
	BlockLookback    uint64        // blocks to scan on startup in polling mode
	GasBufferPercent int           // percentage buffer added to gas estimates
}

// PersistenceConfig holds persistence settings
type PersistenceConfig struct {
	Enabled  bool
	FilePath string
}

// ChainConfig holds chain-specific configuration
type ChainConfig struct {
	ChainID       *big.Int
	RPCURL        string
	LockerAddress common.Address // Mantle only
	ReceiverAddress common.Address // Ethereum only
}

// DVNConfig holds DVN private key and address
type DVNConfig struct {
	PrivateKey string
	Address    common.Address
}

// LoggingConfig holds logging configuration
type LoggingConfig struct {
	Level      string // debug, info, warn, error
	Format     string // console, json
	OutputPath string // file path for logs
	MaxSize    int    // max size in MB before rotation
	MaxBackups int    // max number of old log files
	MaxAge     int    // max number of days to retain logs
}

// HTTPConfig holds HTTP server configuration
type HTTPConfig struct {
	Port int // port for metrics and health endpoints
}

// TracingConfig holds OpenTelemetry tracing configuration
type TracingConfig struct {
	Enabled     bool
	Endpoint    string // OTLP endpoint
	ServiceName string
	Environment string
}

// Load reads configuration from environment variables
// Compatible with existing .env file structure
func Load() (*Config, error) {
	// Try to load .env file from parent directory (if running from go/ subdirectory)
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

	// DVN configuration (using DVN1 from .env)
	cfg.DVN.PrivateKey = os.Getenv("DVN1_PRIVATE_KEY")
	if cfg.DVN.PrivateKey == "" {
		return nil, fmt.Errorf("DVN1_PRIVATE_KEY not set")
	}

	dvnAddr := os.Getenv("DVN1_ADDRESS")
	if dvnAddr == "" {
		return nil, fmt.Errorf("DVN1_ADDRESS not set")
	}
	cfg.DVN.Address = common.HexToAddress(dvnAddr)

	// Retry configuration (with defaults)
	cfg.Retry.MaxRetries = getEnvIntWithDefault("RELAYER_MAX_RETRIES", 5)
	cfg.Retry.EnableBackoff = getEnvBoolWithDefault("RELAYER_ENABLE_BACKOFF", true)
	cfg.Retry.HealthCheckInterval = getEnvIntWithDefault("RELAYER_HEALTH_CHECK_INTERVAL", 30)
	cfg.Retry.BaseRetryDelay = time.Duration(getEnvIntWithDefault("RELAYER_BASE_RETRY_DELAY", 1)) * time.Second
	cfg.Retry.RPCTimeout = time.Duration(getEnvIntWithDefault("RELAYER_RPC_TIMEOUT", 30)) * time.Second

	// Relayer tuning configuration (with defaults)
	cfg.Relayer.PollInterval = time.Duration(getEnvIntWithDefault("RELAYER_POLL_INTERVAL", 12)) * time.Second
	cfg.Relayer.BlockLookback = uint64(getEnvIntWithDefault("RELAYER_BLOCK_LOOKBACK", 100))
	cfg.Relayer.GasBufferPercent = getEnvIntWithDefault("RELAYER_GAS_BUFFER_PERCENT", 20)

	// Persistence configuration (with defaults)
	cfg.Persistence.Enabled = getEnvBoolWithDefault("RELAYER_PERSISTENCE_ENABLED", true)
	cfg.Persistence.FilePath = os.Getenv("RELAYER_PERSISTENCE_FILE")
	if cfg.Persistence.FilePath == "" {
		cfg.Persistence.FilePath = "./data/processed_locks.json"
	}

	// Logging configuration (with defaults)
	cfg.Logging.Level = os.Getenv("LOG_LEVEL")
	if cfg.Logging.Level == "" {
		cfg.Logging.Level = "info"
	}
	cfg.Logging.Format = os.Getenv("LOG_FORMAT")
	if cfg.Logging.Format == "" {
		cfg.Logging.Format = "console"
	}
	cfg.Logging.OutputPath = os.Getenv("LOG_FILE")
	cfg.Logging.MaxSize = getEnvIntWithDefault("LOG_MAX_SIZE", 100)
	cfg.Logging.MaxBackups = getEnvIntWithDefault("LOG_MAX_BACKUPS", 3)
	cfg.Logging.MaxAge = getEnvIntWithDefault("LOG_MAX_AGE", 28)

	// HTTP server configuration (with defaults)
	cfg.HTTP.Port = getEnvIntWithDefault("HTTP_PORT", 8080)

	// Tracing configuration (with defaults)
	cfg.Tracing.Enabled = getEnvBoolWithDefault("TRACING_ENABLED", false)
	cfg.Tracing.Endpoint = os.Getenv("TRACING_ENDPOINT")
	if cfg.Tracing.Endpoint == "" {
		cfg.Tracing.Endpoint = "localhost:4317"
	}
	cfg.Tracing.ServiceName = os.Getenv("TRACING_SERVICE_NAME")
	if cfg.Tracing.ServiceName == "" {
		cfg.Tracing.ServiceName = "xrwa-dvn-relayer"
	}
	cfg.Tracing.Environment = os.Getenv("ENVIRONMENT")
	if cfg.Tracing.Environment == "" {
		cfg.Tracing.Environment = "development"
	}

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
