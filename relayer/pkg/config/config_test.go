package config

import (
	"os"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestLoad_Success(t *testing.T) {
	// Set all required environment variables
	envVars := map[string]string{
		"MANTLE_CHAIN_ID":    "15000",
		"MANTLE_RPC_VTE":     "https://mantle-rpc.example.com",
		"MANTLE_LOCKER":      "0x1111111111111111111111111111111111111111",
		"ETHEREUM_CHAIN_ID":  "10001",
		"ETHEREUM_RPC_VTE":   "https://ethereum-rpc.example.com",
		"ETH_RECEIVER":       "0x2222222222222222222222222222222222222222",
		"DVN1_PRIVATE_KEY":   "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
		"DVN1_ADDRESS":       "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
	}

	for key, value := range envVars {
		require.NoError(t, os.Setenv(key, value))
		defer func(k string) { _ = os.Unsetenv(k) }(key)
	}

	cfg, err := Load()
	require.NoError(t, err)
	require.NotNil(t, cfg)

	// Verify Mantle configuration
	require.Equal(t, int64(15000), cfg.Mantle.ChainID.Int64())
	require.Equal(t, "https://mantle-rpc.example.com", cfg.Mantle.RPCURL)
	require.Equal(t, "0x1111111111111111111111111111111111111111", cfg.Mantle.LockerAddress.Hex())

	// Verify Ethereum configuration
	require.Equal(t, int64(10001), cfg.Ethereum.ChainID.Int64())
	require.Equal(t, "https://ethereum-rpc.example.com", cfg.Ethereum.RPCURL)
	require.Equal(t, "0x2222222222222222222222222222222222222222", cfg.Ethereum.ReceiverAddress.Hex())

	// Verify DVN configuration
	require.Equal(t, "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80", cfg.DVN.PrivateKey)
	require.Equal(t, "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266", cfg.DVN.Address.Hex())

	// Verify default values for retry configuration
	require.Equal(t, 5, cfg.Retry.MaxRetries)
	require.True(t, cfg.Retry.EnableBackoff)
	require.Equal(t, 30, cfg.Retry.HealthCheckInterval)
}

func TestLoad_MissingMantleChainID(t *testing.T) {
	// Clear environment
	os.Clearenv()

	_, err := Load()
	require.Error(t, err)
	require.Contains(t, err.Error(), "MANTLE_CHAIN_ID")
}

func TestLoad_MissingMantleRPC(t *testing.T) {
	// Set partial environment
	os.Clearenv()
	require.NoError(t, os.Setenv("MANTLE_CHAIN_ID", "15000"))
	defer func() { _ = os.Unsetenv("MANTLE_CHAIN_ID") }()

	_, err := Load()
	require.Error(t, err)
	require.Contains(t, err.Error(), "MANTLE_RPC_VTE")
}

func TestLoad_MissingMantleLocker(t *testing.T) {
	os.Clearenv()
	require.NoError(t, os.Setenv("MANTLE_CHAIN_ID", "15000"))
	require.NoError(t, os.Setenv("MANTLE_RPC_VTE", "https://mantle-rpc.example.com"))
	defer func() { _ = os.Unsetenv("MANTLE_CHAIN_ID") }()
	defer func() { _ = os.Unsetenv("MANTLE_RPC_VTE") }()

	_, err := Load()
	require.Error(t, err)
	require.Contains(t, err.Error(), "MANTLE_LOCKER")
}

func TestLoad_MissingEthereumChainID(t *testing.T) {
	os.Clearenv()
	require.NoError(t, os.Setenv("MANTLE_CHAIN_ID", "15000"))
	require.NoError(t, os.Setenv("MANTLE_RPC_VTE", "https://mantle-rpc.example.com"))
	require.NoError(t, os.Setenv("MANTLE_LOCKER", "0x1111111111111111111111111111111111111111"))
	defer func() { _ = os.Unsetenv("MANTLE_CHAIN_ID") }()
	defer func() { _ = os.Unsetenv("MANTLE_RPC_VTE") }()
	defer func() { _ = os.Unsetenv("MANTLE_LOCKER") }()

	_, err := Load()
	require.Error(t, err)
	require.Contains(t, err.Error(), "ETHEREUM_CHAIN_ID")
}

func TestLoad_MissingDVNPrivateKey(t *testing.T) {
	os.Clearenv()
	envVars := map[string]string{
		"MANTLE_CHAIN_ID":   "15000",
		"MANTLE_RPC_VTE":    "https://mantle-rpc.example.com",
		"MANTLE_LOCKER":     "0x1111111111111111111111111111111111111111",
		"ETHEREUM_CHAIN_ID": "10001",
		"ETHEREUM_RPC_VTE":  "https://ethereum-rpc.example.com",
		"ETH_RECEIVER":      "0x2222222222222222222222222222222222222222",
	}

	for key, value := range envVars {
		require.NoError(t, os.Setenv(key, value))
		defer func(k string) { _ = os.Unsetenv(k) }(key)
	}

	_, err := Load()
	require.Error(t, err)
	require.Contains(t, err.Error(), "DVN1_PRIVATE_KEY")
}

func TestLoad_WithDefaults(t *testing.T) {
	os.Clearenv()

	// Set all required environment variables
	envVars := map[string]string{
		"MANTLE_CHAIN_ID":    "15000",
		"MANTLE_RPC_VTE":     "https://mantle-rpc.example.com",
		"MANTLE_LOCKER":      "0x1111111111111111111111111111111111111111",
		"ETHEREUM_CHAIN_ID":  "10001",
		"ETHEREUM_RPC_VTE":   "https://ethereum-rpc.example.com",
		"ETH_RECEIVER":       "0x2222222222222222222222222222222222222222",
		"DVN1_PRIVATE_KEY":   "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
		"DVN1_ADDRESS":       "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
	}

	for key, value := range envVars {
		require.NoError(t, os.Setenv(key, value))
		defer func(k string) { _ = os.Unsetenv(k) }(key)
	}

	cfg, err := Load()
	require.NoError(t, err)

	// Verify default values
	require.Equal(t, 5, cfg.Retry.MaxRetries)
	require.True(t, cfg.Retry.EnableBackoff)
	require.Equal(t, 30, cfg.Retry.HealthCheckInterval)
	require.True(t, cfg.Persistence.Enabled)
	require.Equal(t, "./data/processed_locks.json", cfg.Persistence.FilePath)
	require.Equal(t, "info", cfg.Logging.Level)
	require.Equal(t, "console", cfg.Logging.Format)
	require.Equal(t, 100, cfg.Logging.MaxSize)
	require.Equal(t, 3, cfg.Logging.MaxBackups)
	require.Equal(t, 28, cfg.Logging.MaxAge)
	require.Equal(t, 8080, cfg.HTTP.Port)
	require.False(t, cfg.Tracing.Enabled)
	require.Equal(t, "localhost:4317", cfg.Tracing.Endpoint)
	require.Equal(t, "xrwa-dvn-relayer", cfg.Tracing.ServiceName)
	require.Equal(t, "development", cfg.Tracing.Environment)
}

func TestLoad_InvalidChainID(t *testing.T) {
	os.Clearenv()
	require.NoError(t, os.Setenv("MANTLE_CHAIN_ID", "invalid"))
	defer func() { _ = os.Unsetenv("MANTLE_CHAIN_ID") }()

	_, err := Load()
	require.Error(t, err)
	require.Contains(t, err.Error(), "MANTLE_CHAIN_ID")
}

func TestLoad_LoggingConfig(t *testing.T) {
	os.Clearenv()

	// Set all required environment variables plus logging config
	envVars := map[string]string{
		"MANTLE_CHAIN_ID":    "15000",
		"MANTLE_RPC_VTE":     "https://mantle-rpc.example.com",
		"MANTLE_LOCKER":      "0x1111111111111111111111111111111111111111",
		"ETHEREUM_CHAIN_ID":  "10001",
		"ETHEREUM_RPC_VTE":   "https://ethereum-rpc.example.com",
		"ETH_RECEIVER":       "0x2222222222222222222222222222222222222222",
		"DVN1_PRIVATE_KEY":   "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
		"DVN1_ADDRESS":       "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
		"LOG_LEVEL":          "debug",
		"LOG_FORMAT":         "json",
		"LOG_FILE":           "/tmp/relayer.log",
		"LOG_MAX_SIZE":       "200",
		"LOG_MAX_BACKUPS":    "5",
		"LOG_MAX_AGE":        "14",
	}

	for key, value := range envVars {
		require.NoError(t, os.Setenv(key, value))
		defer func(k string) { _ = os.Unsetenv(k) }(key)
	}

	cfg, err := Load()
	require.NoError(t, err)

	// Verify logging configuration
	require.Equal(t, "debug", cfg.Logging.Level)
	require.Equal(t, "json", cfg.Logging.Format)
	require.Equal(t, "/tmp/relayer.log", cfg.Logging.OutputPath)
	require.Equal(t, 200, cfg.Logging.MaxSize)
	require.Equal(t, 5, cfg.Logging.MaxBackups)
	require.Equal(t, 14, cfg.Logging.MaxAge)
}

func TestLoad_HTTPConfig(t *testing.T) {
	os.Clearenv()

	// Set all required environment variables plus HTTP config
	envVars := map[string]string{
		"MANTLE_CHAIN_ID":    "15000",
		"MANTLE_RPC_VTE":     "https://mantle-rpc.example.com",
		"MANTLE_LOCKER":      "0x1111111111111111111111111111111111111111",
		"ETHEREUM_CHAIN_ID":  "10001",
		"ETHEREUM_RPC_VTE":   "https://ethereum-rpc.example.com",
		"ETH_RECEIVER":       "0x2222222222222222222222222222222222222222",
		"DVN1_PRIVATE_KEY":   "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
		"DVN1_ADDRESS":       "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
		"HTTP_PORT":          "9090",
	}

	for key, value := range envVars {
		require.NoError(t, os.Setenv(key, value))
		defer func(k string) { _ = os.Unsetenv(k) }(key)
	}

	cfg, err := Load()
	require.NoError(t, err)

	// Verify HTTP configuration
	require.Equal(t, 9090, cfg.HTTP.Port)
}

func TestLoad_TracingConfig(t *testing.T) {
	os.Clearenv()

	// Set all required environment variables plus tracing config
	envVars := map[string]string{
		"MANTLE_CHAIN_ID":      "15000",
		"MANTLE_RPC_VTE":       "https://mantle-rpc.example.com",
		"MANTLE_LOCKER":        "0x1111111111111111111111111111111111111111",
		"ETHEREUM_CHAIN_ID":    "10001",
		"ETHEREUM_RPC_VTE":     "https://ethereum-rpc.example.com",
		"ETH_RECEIVER":         "0x2222222222222222222222222222222222222222",
		"DVN1_PRIVATE_KEY":     "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
		"DVN1_ADDRESS":         "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
		"TRACING_ENABLED":      "true",
		"TRACING_ENDPOINT":     "jaeger:4317",
		"TRACING_SERVICE_NAME": "test-relayer",
		"ENVIRONMENT":          "testing",
	}

	for key, value := range envVars {
		require.NoError(t, os.Setenv(key, value))
		defer func(k string) { _ = os.Unsetenv(k) }(key)
	}

	cfg, err := Load()
	require.NoError(t, err)

	// Verify tracing configuration
	require.True(t, cfg.Tracing.Enabled)
	require.Equal(t, "jaeger:4317", cfg.Tracing.Endpoint)
	require.Equal(t, "test-relayer", cfg.Tracing.ServiceName)
	require.Equal(t, "testing", cfg.Tracing.Environment)
}

func TestLoad_CustomRetryConfig(t *testing.T) {
	os.Clearenv()

	// Set all required environment variables plus custom retry config
	envVars := map[string]string{
		"MANTLE_CHAIN_ID":               "15000",
		"MANTLE_RPC_VTE":                "https://mantle-rpc.example.com",
		"MANTLE_LOCKER":                 "0x1111111111111111111111111111111111111111",
		"ETHEREUM_CHAIN_ID":             "10001",
		"ETHEREUM_RPC_VTE":              "https://ethereum-rpc.example.com",
		"ETH_RECEIVER":                  "0x2222222222222222222222222222222222222222",
		"DVN1_PRIVATE_KEY":              "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
		"DVN1_ADDRESS":                  "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
		"RELAYER_MAX_RETRIES":           "10",
		"RELAYER_ENABLE_BACKOFF":        "false",
		"RELAYER_HEALTH_CHECK_INTERVAL": "60",
	}

	for key, value := range envVars {
		require.NoError(t, os.Setenv(key, value))
		defer func(k string) { _ = os.Unsetenv(k) }(key)
	}

	cfg, err := Load()
	require.NoError(t, err)

	// Verify custom retry configuration
	require.Equal(t, 10, cfg.Retry.MaxRetries)
	require.False(t, cfg.Retry.EnableBackoff)
	require.Equal(t, 60, cfg.Retry.HealthCheckInterval)
}

func TestLoad_CustomPersistenceConfig(t *testing.T) {
	os.Clearenv()

	// Set all required environment variables plus custom persistence config
	envVars := map[string]string{
		"MANTLE_CHAIN_ID":              "15000",
		"MANTLE_RPC_VTE":               "https://mantle-rpc.example.com",
		"MANTLE_LOCKER":                "0x1111111111111111111111111111111111111111",
		"ETHEREUM_CHAIN_ID":            "10001",
		"ETHEREUM_RPC_VTE":             "https://ethereum-rpc.example.com",
		"ETH_RECEIVER":                 "0x2222222222222222222222222222222222222222",
		"DVN1_PRIVATE_KEY":             "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
		"DVN1_ADDRESS":                 "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
		"RELAYER_PERSISTENCE_ENABLED":  "false",
		"RELAYER_PERSISTENCE_FILE":     "/tmp/custom_locks.json",
	}

	for key, value := range envVars {
		require.NoError(t, os.Setenv(key, value))
		defer func(k string) { _ = os.Unsetenv(k) }(key)
	}

	cfg, err := Load()
	require.NoError(t, err)

	// Verify custom persistence configuration
	require.False(t, cfg.Persistence.Enabled)
	require.Equal(t, "/tmp/custom_locks.json", cfg.Persistence.FilePath)
}
