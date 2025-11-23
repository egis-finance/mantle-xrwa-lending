package logger

import (
	"fmt"
	"os"
	"strings"

	"go.uber.org/zap"
	"go.uber.org/zap/zapcore"
	"gopkg.in/natefinch/lumberjack.v2"
)

var global *zap.SugaredLogger

// Config holds logger configuration
type Config struct {
	Level      string // debug, info, warn, error
	Format     string // console, json
	OutputPath string // file path for logs, empty for stdout only
	MaxSize    int    // max size in megabytes before rotation
	MaxBackups int    // max number of old log files to retain
	MaxAge     int    // max number of days to retain old log files
}

// Init initializes the global logger with the given configuration
func Init(cfg Config) error {
	level, err := parseLevel(cfg.Level)
	if err != nil {
		return fmt.Errorf("invalid log level %s: %w", cfg.Level, err)
	}

	encoder := getEncoder(cfg.Format)

	var core zapcore.Core
	if cfg.OutputPath != "" {
		// Dual output: console + file with rotation
		consoleWriter := zapcore.AddSync(os.Stdout)
		fileWriter := zapcore.AddSync(&lumberjack.Logger{
			Filename:   cfg.OutputPath,
			MaxSize:    cfg.MaxSize,
			MaxBackups: cfg.MaxBackups,
			MaxAge:     cfg.MaxAge,
			Compress:   true,
		})

		consoleCore := zapcore.NewCore(
			getEncoder("console"),
			consoleWriter,
			level,
		)
		fileCore := zapcore.NewCore(
			encoder,
			fileWriter,
			level,
		)
		core = zapcore.NewTee(consoleCore, fileCore)
	} else {
		// Console only
		core = zapcore.NewCore(
			encoder,
			zapcore.AddSync(os.Stdout),
			level,
		)
	}

	logger := zap.New(core, zap.AddCaller(), zap.AddStacktrace(zapcore.ErrorLevel))
	global = logger.Sugar()

	return nil
}

// parseLevel converts string level to zapcore.Level
func parseLevel(level string) (zapcore.Level, error) {
	switch strings.ToLower(level) {
	case "debug":
		return zapcore.DebugLevel, nil
	case "info":
		return zapcore.InfoLevel, nil
	case "warn", "warning":
		return zapcore.WarnLevel, nil
	case "error":
		return zapcore.ErrorLevel, nil
	default:
		return zapcore.InfoLevel, fmt.Errorf("unknown level: %s", level)
	}
}

// getEncoder returns the appropriate encoder based on format
func getEncoder(format string) zapcore.Encoder {
	encoderConfig := zap.NewProductionEncoderConfig()
	encoderConfig.EncodeTime = zapcore.ISO8601TimeEncoder
	encoderConfig.EncodeLevel = zapcore.CapitalLevelEncoder

	if format == "json" {
		return zapcore.NewJSONEncoder(encoderConfig)
	}
	// Console format with colors
	encoderConfig.EncodeLevel = zapcore.CapitalColorLevelEncoder
	return zapcore.NewConsoleEncoder(encoderConfig)
}

// Get returns the global logger instance
func Get() *zap.SugaredLogger {
	if global == nil {
		// Fallback to development logger if not initialized
		logger, _ := zap.NewDevelopment()
		global = logger.Sugar()
	}
	return global
}

// Sync flushes any buffered log entries
func Sync() error {
	if global != nil {
		return global.Sync()
	}
	return nil
}

// Helper functions for common log operations
func Debug(args ...interface{}) {
	Get().Debug(args...)
}

func Debugf(template string, args ...interface{}) {
	Get().Debugf(template, args...)
}

func Debugw(msg string, keysAndValues ...interface{}) {
	Get().Debugw(msg, keysAndValues...)
}

func Info(args ...interface{}) {
	Get().Info(args...)
}

func Infof(template string, args ...interface{}) {
	Get().Infof(template, args...)
}

func Infow(msg string, keysAndValues ...interface{}) {
	Get().Infow(msg, keysAndValues...)
}

func Warn(args ...interface{}) {
	Get().Warn(args...)
}

func Warnf(template string, args ...interface{}) {
	Get().Warnf(template, args...)
}

func Warnw(msg string, keysAndValues ...interface{}) {
	Get().Warnw(msg, keysAndValues...)
}

func Error(args ...interface{}) {
	Get().Error(args...)
}

func Errorf(template string, args ...interface{}) {
	Get().Errorf(template, args...)
}

func Errorw(msg string, keysAndValues ...interface{}) {
	Get().Errorw(msg, keysAndValues...)
}

func Fatal(args ...interface{}) {
	Get().Fatal(args...)
}

func Fatalf(template string, args ...interface{}) {
	Get().Fatalf(template, args...)
}

func Fatalw(msg string, keysAndValues ...interface{}) {
	Get().Fatalw(msg, keysAndValues...)
}
