package reconcile

import (
	"os"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestLoad_Success(t *testing.T) {
	os.Clearenv()

	envVars := map[string]string{
		"MANTLE_CHAIN_ID":   "15000",
		"MANTLE_RPC_VTE":    "https://mantle-rpc.example.com",
		"MANTLE_LOCKER":     "0x1111111111111111111111111111111111111111",
		"ETHEREUM_CHAIN_ID": "10001",
		"ETHEREUM_RPC_VTE":  "https://ethereum-rpc.example.com",
		"ETH_RECEIVER":      "0x2222222222222222222222222222222222222222",
		"ADMIN_PRIVATE_KEY": "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
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

	// Verify Admin configuration
	require.Equal(t, "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80", cfg.Admin.PrivateKey)

	// Verify default values
	require.Equal(t, uint64(0), cfg.Options.StartBlock)
	require.True(t, cfg.Options.DryRun) // Default is true (safe mode)
	require.Equal(t, uint64(50000), cfg.Options.ChunkSize)
}

func TestLoad_MissingMantleChainID(t *testing.T) {
	os.Clearenv()

	_, err := Load()
	require.Error(t, err)
	require.Contains(t, err.Error(), "MANTLE_CHAIN_ID")
}

func TestLoad_MissingMantleRPC(t *testing.T) {
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

func TestLoad_MissingAdminPrivateKey(t *testing.T) {
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
	require.Contains(t, err.Error(), "ADMIN_PRIVATE_KEY")
}

func TestLoad_InvalidChainID(t *testing.T) {
	os.Clearenv()
	require.NoError(t, os.Setenv("MANTLE_CHAIN_ID", "invalid"))
	defer func() { _ = os.Unsetenv("MANTLE_CHAIN_ID") }()

	_, err := Load()
	require.Error(t, err)
	require.Contains(t, err.Error(), "MANTLE_CHAIN_ID")
}

func TestLoad_CustomOptions(t *testing.T) {
	os.Clearenv()

	envVars := map[string]string{
		"MANTLE_CHAIN_ID":        "15000",
		"MANTLE_RPC_VTE":         "https://mantle-rpc.example.com",
		"MANTLE_LOCKER":          "0x1111111111111111111111111111111111111111",
		"ETHEREUM_CHAIN_ID":      "10001",
		"ETHEREUM_RPC_VTE":       "https://ethereum-rpc.example.com",
		"ETH_RECEIVER":           "0x2222222222222222222222222222222222222222",
		"ADMIN_PRIVATE_KEY":      "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
		"RECONCILE_START_BLOCK":  "1000000",
		"RECONCILE_DRY_RUN":      "false",
		"RECONCILE_CHUNK_SIZE":   "25000",
	}

	for key, value := range envVars {
		require.NoError(t, os.Setenv(key, value))
		defer func(k string) { _ = os.Unsetenv(k) }(key)
	}

	cfg, err := Load()
	require.NoError(t, err)

	require.Equal(t, uint64(1000000), cfg.Options.StartBlock)
	require.False(t, cfg.Options.DryRun)
	require.Equal(t, uint64(25000), cfg.Options.ChunkSize)
}

func TestLoad_DryRunDefaults(t *testing.T) {
	os.Clearenv()

	envVars := map[string]string{
		"MANTLE_CHAIN_ID":   "15000",
		"MANTLE_RPC_VTE":    "https://mantle-rpc.example.com",
		"MANTLE_LOCKER":     "0x1111111111111111111111111111111111111111",
		"ETHEREUM_CHAIN_ID": "10001",
		"ETHEREUM_RPC_VTE":  "https://ethereum-rpc.example.com",
		"ETH_RECEIVER":      "0x2222222222222222222222222222222222222222",
		"ADMIN_PRIVATE_KEY": "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
	}

	for key, value := range envVars {
		require.NoError(t, os.Setenv(key, value))
		defer func(k string) { _ = os.Unsetenv(k) }(key)
	}

	cfg, err := Load()
	require.NoError(t, err)

	// DryRun should default to true for safety
	require.True(t, cfg.Options.DryRun)
}

func TestGetEnvIntWithDefault(t *testing.T) {
	os.Clearenv()

	// Test default value when env not set
	result := getEnvIntWithDefault("NONEXISTENT_VAR", 42)
	require.Equal(t, 42, result)

	// Test value when env is set
	require.NoError(t, os.Setenv("TEST_INT_VAR", "100"))
	defer func() { _ = os.Unsetenv("TEST_INT_VAR") }()

	result = getEnvIntWithDefault("TEST_INT_VAR", 42)
	require.Equal(t, 100, result)

	// Test default when env is invalid
	require.NoError(t, os.Setenv("TEST_INVALID_INT", "not_a_number"))
	defer func() { _ = os.Unsetenv("TEST_INVALID_INT") }()

	result = getEnvIntWithDefault("TEST_INVALID_INT", 42)
	require.Equal(t, 42, result)
}

func TestGetEnvBoolWithDefault(t *testing.T) {
	os.Clearenv()

	// Test default value when env not set
	result := getEnvBoolWithDefault("NONEXISTENT_VAR", true)
	require.True(t, result)

	result = getEnvBoolWithDefault("NONEXISTENT_VAR", false)
	require.False(t, result)

	// Test value when env is set to true
	require.NoError(t, os.Setenv("TEST_BOOL_TRUE", "true"))
	defer func() { _ = os.Unsetenv("TEST_BOOL_TRUE") }()

	result = getEnvBoolWithDefault("TEST_BOOL_TRUE", false)
	require.True(t, result)

	// Test value when env is set to false
	require.NoError(t, os.Setenv("TEST_BOOL_FALSE", "false"))
	defer func() { _ = os.Unsetenv("TEST_BOOL_FALSE") }()

	result = getEnvBoolWithDefault("TEST_BOOL_FALSE", true)
	require.False(t, result)

	// Test default when env is invalid
	require.NoError(t, os.Setenv("TEST_INVALID_BOOL", "not_a_bool"))
	defer func() { _ = os.Unsetenv("TEST_INVALID_BOOL") }()

	result = getEnvBoolWithDefault("TEST_INVALID_BOOL", true)
	require.True(t, result)
}
