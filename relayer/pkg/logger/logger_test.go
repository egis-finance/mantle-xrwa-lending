package logger

import (
	"bytes"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/require"
	"go.uber.org/zap"
	"go.uber.org/zap/zapcore"
)

func TestInit_ConsoleFormat(t *testing.T) {
	cfg := Config{
		Level:  "info",
		Format: "console",
	}

	err := Init(cfg)
	require.NoError(t, err)
	require.NotNil(t, global)
}

func TestInit_JSONFormat(t *testing.T) {
	cfg := Config{
		Level:  "debug",
		Format: "json",
	}

	err := Init(cfg)
	require.NoError(t, err)
	require.NotNil(t, global)

	// Reset global for other tests
	global = nil
}

func TestInit_InvalidLevel(t *testing.T) {
	t.Parallel()

	cfg := Config{
		Level:  "invalid",
		Format: "console",
	}

	err := Init(cfg)
	require.Error(t, err)
	require.Contains(t, err.Error(), "invalid log level")
}

func TestInit_WithRotation(t *testing.T) {
	// Create temporary directory for log file
	tmpDir := t.TempDir()
	logFile := filepath.Join(tmpDir, "test.log")

	cfg := Config{
		Level:      "info",
		Format:     "json",
		OutputPath: logFile,
		MaxSize:    10,
		MaxBackups: 3,
		MaxAge:     7,
	}

	err := Init(cfg)
	require.NoError(t, err)

	// Write a log message
	Get().Info("test message")
	_ = Sync() // Sync may fail on stdout (expected in test environment)

	// Verify log file was created
	_, err = os.Stat(logFile)
	require.NoError(t, err)

	// Read log file and verify content
	content, err := os.ReadFile(logFile)
	require.NoError(t, err)
	require.Contains(t, string(content), "test message")

	// Reset global for other tests
	global = nil
}

func TestGet_Uninitialized(t *testing.T) {
	// Reset global
	global = nil

	// Get should return a fallback logger
	logger := Get()
	require.NotNil(t, logger)

	// Should not panic when logging
	logger.Info("test message")
}

func TestStructuredLogging(t *testing.T) {
	// Create a buffer to capture logs
	var buf bytes.Buffer

	// Create custom logger that writes to buffer
	encoderConfig := zap.NewProductionEncoderConfig()
	encoderConfig.EncodeTime = zapcore.ISO8601TimeEncoder
	core := zapcore.NewCore(
		zapcore.NewJSONEncoder(encoderConfig),
		zapcore.AddSync(&buf),
		zapcore.InfoLevel,
	)
	logger := zap.New(core)
	global = logger.Sugar()

	// Test structured logging
	Infow("test message",
		"key1", "value1",
		"key2", 42,
		"key3", true,
	)

	require.NoError(t, Sync())

	// Parse JSON log
	var logEntry map[string]interface{}
	err := json.Unmarshal(buf.Bytes(), &logEntry)
	require.NoError(t, err)

	// Verify structured fields
	require.Equal(t, "test message", logEntry["msg"])
	require.Equal(t, "value1", logEntry["key1"])
	require.Equal(t, float64(42), logEntry["key2"])
	require.Equal(t, true, logEntry["key3"])

	// Reset global for other tests
	global = nil
}

func TestParseLevel(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name        string
		input       string
		expected    zapcore.Level
		shouldError bool
	}{
		{
			name:        "debug level",
			input:       "debug",
			expected:    zapcore.DebugLevel,
			shouldError: false,
		},
		{
			name:        "info level",
			input:       "info",
			expected:    zapcore.InfoLevel,
			shouldError: false,
		},
		{
			name:        "warn level",
			input:       "warn",
			expected:    zapcore.WarnLevel,
			shouldError: false,
		},
		{
			name:        "warning level",
			input:       "warning",
			expected:    zapcore.WarnLevel,
			shouldError: false,
		},
		{
			name:        "error level",
			input:       "error",
			expected:    zapcore.ErrorLevel,
			shouldError: false,
		},
		{
			name:        "case insensitive",
			input:       "INFO",
			expected:    zapcore.InfoLevel,
			shouldError: false,
		},
		{
			name:        "invalid level",
			input:       "invalid",
			expected:    zapcore.InfoLevel,
			shouldError: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			level, err := parseLevel(tt.input)
			if tt.shouldError {
				require.Error(t, err)
			} else {
				require.NoError(t, err)
				require.Equal(t, tt.expected, level)
			}
		})
	}
}

func TestGetEncoder(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name   string
		format string
	}{
		{
			name:   "json encoder",
			format: "json",
		},
		{
			name:   "console encoder",
			format: "console",
		},
		{
			name:   "unknown defaults to console",
			format: "unknown",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			encoder := getEncoder(tt.format)
			require.NotNil(t, encoder)
		})
	}
}

func TestHelperFunctions(t *testing.T) {
	// Initialize logger for testing
	cfg := Config{
		Level:  "debug",
		Format: "json",
	}
	err := Init(cfg)
	require.NoError(t, err)

	// Test all helper functions (should not panic)
	Debug("debug message")
	Debugf("debug formatted: %s", "test")
	Debugw("debug structured", "key", "value")

	Info("info message")
	Infof("info formatted: %s", "test")
	Infow("info structured", "key", "value")

	Warn("warn message")
	Warnf("warn formatted: %s", "test")
	Warnw("warn structured", "key", "value")

	Error("error message")
	Errorf("error formatted: %s", "test")
	Errorw("error structured", "key", "value")

	// Reset global for other tests
	global = nil
}

func TestSync(t *testing.T) {
	// Test sync with nil global - should not error
	global = nil
	err := Sync()
	require.NoError(t, err)

	// Test sync with initialized global
	// Note: Sync() on stdout returns "bad file descriptor" in test environments,
	// which is expected behavior - stdout cannot be synced
	cfg := Config{
		Level:  "info",
		Format: "console",
	}
	err = Init(cfg)
	require.NoError(t, err)

	// Sync() error is expected when writing to console only
	_ = Sync()

	// Reset global for other tests
	global = nil
}

func TestDualOutput(t *testing.T) {
	// Create temporary directory for log file
	tmpDir := t.TempDir()
	logFile := filepath.Join(tmpDir, "dual.log")

	cfg := Config{
		Level:      "info",
		Format:     "json",
		OutputPath: logFile,
		MaxSize:    10,
		MaxBackups: 3,
		MaxAge:     7,
	}

	err := Init(cfg)
	require.NoError(t, err)

	// Write log messages
	Get().Info("message 1")
	Get().Infow("message 2", "key", "value")
	_ = Sync() // Sync may fail on stdout portion (expected in test environment)

	// Verify log file contains messages
	content, err := os.ReadFile(logFile)
	require.NoError(t, err)
	require.Contains(t, string(content), "message 1")
	require.Contains(t, string(content), "message 2")
	require.Contains(t, string(content), "\"key\":\"value\"")

	// Reset global for other tests
	global = nil
}
