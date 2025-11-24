package chain

import (
	"context"
	"crypto/ecdsa"
	"fmt"
	"math/big"
	"time"

	"github.com/egis-finance/mantle-xrwa-lending/relayer/internal/contracts"
	"github.com/egis-finance/mantle-xrwa-lending/relayer/pkg/interfaces"
	"github.com/egis-finance/mantle-xrwa-lending/relayer/pkg/logger"
	"github.com/egis-finance/mantle-xrwa-lending/relayer/pkg/observability"
	"github.com/ethereum/go-ethereum"
	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/core/types"
	"github.com/ethereum/go-ethereum/crypto"
)

// CreateLockedEventQuery creates a filter query for Locked events
func CreateLockedEventQuery(lockerAddress common.Address) ethereum.FilterQuery {
	return ethereum.FilterQuery{
		Addresses: []common.Address{lockerAddress},
		Topics: [][]common.Hash{
			{contracts.LockedEventSignature},
		},
	}
}

// withRPCTimeout executes a function with a timeout context, reducing boilerplate
func withRPCTimeout[T any](ctx context.Context, timeout time.Duration, fn func(context.Context) (T, error)) (T, error) {
	timeoutCtx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()
	return fn(timeoutCtx)
}

// withRPCTimeoutNoReturn executes a function with timeout that returns only error
func withRPCTimeoutNoReturn(ctx context.Context, timeout time.Duration, fn func(context.Context) error) error {
	timeoutCtx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()
	return fn(timeoutCtx)
}

// SubmitTransactionOpts holds configurable options for transaction submission
type SubmitTransactionOpts struct {
	RPCTimeout       time.Duration
	GasBufferPercent int
}

// DefaultSubmitOpts returns default options (30s timeout, 20% gas buffer)
func DefaultSubmitOpts() SubmitTransactionOpts {
	return SubmitTransactionOpts{
		RPCTimeout:       30 * time.Second,
		GasBufferPercent: 20,
	}
}

// SubmitTransaction submits a transaction to the Ethereum network and returns tx hash and gas used
func SubmitTransaction(
	ctx context.Context,
	client interfaces.EthClient,
	privateKeyHex string,
	to common.Address,
	data []byte,
	metrics *observability.Metrics,
	opts SubmitTransactionOpts,
) (common.Hash, uint64, error) {
	// Parse private key
	if len(privateKeyHex) > 2 && privateKeyHex[:2] == "0x" {
		privateKeyHex = privateKeyHex[2:]
	}
	privateKey, err := crypto.HexToECDSA(privateKeyHex)
	if err != nil {
		return common.Hash{}, 0, fmt.Errorf("invalid private key: %w", err)
	}

	// Get sender address
	publicKey := privateKey.Public()
	publicKeyECDSA, ok := publicKey.(*ecdsa.PublicKey)
	if !ok {
		return common.Hash{}, 0, fmt.Errorf("cannot assert type: publicKey is not of type *ecdsa.PublicKey")
	}
	fromAddress := crypto.PubkeyToAddress(*publicKeyECDSA)

	timeout := opts.RPCTimeout

	// Get nonce with timeout
	nonce, err := withRPCTimeout(ctx, timeout, func(tctx context.Context) (uint64, error) {
		n, e := client.PendingNonceAt(tctx, fromAddress)
		if e != nil && metrics != nil {
			metrics.RPCErrorsTotal.WithLabelValues("ethereum", "pending_nonce_at").Inc()
		} else if metrics != nil {
			metrics.RPCCallsTotal.WithLabelValues("ethereum", "pending_nonce_at").Inc()
		}
		return n, e
	})
	if err != nil {
		return common.Hash{}, 0, fmt.Errorf("failed to get nonce: %w", err)
	}

	// Get gas price with timeout
	gasPrice, err := withRPCTimeout(ctx, timeout, func(tctx context.Context) (*big.Int, error) {
		p, e := client.SuggestGasPrice(tctx)
		if e != nil && metrics != nil {
			metrics.RPCErrorsTotal.WithLabelValues("ethereum", "suggest_gas_price").Inc()
		} else if metrics != nil {
			metrics.RPCCallsTotal.WithLabelValues("ethereum", "suggest_gas_price").Inc()
		}
		return p, e
	})
	if err != nil {
		return common.Hash{}, 0, fmt.Errorf("failed to get gas price: %w", err)
	}

	// Estimate gas limit with timeout
	msg := ethereum.CallMsg{
		From: fromAddress,
		To:   &to,
		Data: data,
	}
	gasLimit, err := withRPCTimeout(ctx, timeout, func(tctx context.Context) (uint64, error) {
		g, e := client.EstimateGas(tctx, msg)
		if e != nil && metrics != nil {
			metrics.RPCErrorsTotal.WithLabelValues("ethereum", "estimate_gas").Inc()
		} else if metrics != nil {
			metrics.RPCCallsTotal.WithLabelValues("ethereum", "estimate_gas").Inc()
		}
		return g, e
	})
	if err != nil {
		return common.Hash{}, 0, fmt.Errorf("failed to estimate gas: %w", err)
	}

	// Apply gas buffer
	gasLimit = gasLimit * uint64(100+opts.GasBufferPercent) / 100

	// Get chain ID with timeout
	chainID, err := withRPCTimeout(ctx, timeout, func(tctx context.Context) (*big.Int, error) {
		id, e := client.NetworkID(tctx)
		if e != nil && metrics != nil {
			metrics.RPCErrorsTotal.WithLabelValues("ethereum", "network_id").Inc()
		} else if metrics != nil {
			metrics.RPCCallsTotal.WithLabelValues("ethereum", "network_id").Inc()
		}
		return id, e
	})
	if err != nil {
		return common.Hash{}, 0, fmt.Errorf("failed to get chain ID: %w", err)
	}

	// Create and sign transaction
	tx := types.NewTransaction(nonce, to, big.NewInt(0), gasLimit, gasPrice, data)
	signedTx, err := types.SignTx(tx, types.NewEIP155Signer(chainID), privateKey)
	if err != nil {
		return common.Hash{}, 0, fmt.Errorf("failed to sign transaction: %w", err)
	}

	// Send transaction with timeout
	err = withRPCTimeoutNoReturn(ctx, timeout, func(tctx context.Context) error {
		e := client.SendTransaction(tctx, signedTx)
		if e != nil && metrics != nil {
			metrics.RPCErrorsTotal.WithLabelValues("ethereum", "send_transaction").Inc()
		} else if metrics != nil {
			metrics.RPCCallsTotal.WithLabelValues("ethereum", "send_transaction").Inc()
		}
		return e
	})
	if err != nil {
		return common.Hash{}, 0, fmt.Errorf("failed to send transaction: %w", err)
	}

	return signedTx.Hash(), gasLimit, nil
}

// RetryWithBackoff executes a function with exponential backoff retry logic
func RetryWithBackoff(ctx context.Context, maxRetries int, baseDelay time.Duration, metrics *observability.Metrics, operation string, fn func() error) error {
	var lastErr error
	if baseDelay == 0 {
		baseDelay = time.Second // default to 1 second
	}

	for attempt := 0; attempt <= maxRetries; attempt++ {
		err := fn()
		if err == nil {
			if attempt > 0 {
				logger.Infow("Operation succeeded after retry",
					"operation", operation,
					"attempts", attempt+1,
				)
			}
			return nil
		}

		lastErr = err

		// Record retry metric
		if metrics != nil && attempt > 0 {
			metrics.RetriesTotal.WithLabelValues(operation).Inc()
		}

		if attempt < maxRetries {
			// Calculate exponential backoff delay
			delay := baseDelay * time.Duration(1<<uint(attempt))
			logger.Warnw("Operation failed, retrying with backoff",
				"operation", operation,
				"attempt", attempt+1,
				"max_retries", maxRetries,
				"delay", delay,
				"error", err,
			)

			select {
			case <-ctx.Done():
				return fmt.Errorf("context cancelled during retry: %w", ctx.Err())
			case <-time.After(delay):
				// Continue to next attempt
			}
		}
	}

	return fmt.Errorf("operation failed after %d retries: %w", maxRetries, lastErr)
}
