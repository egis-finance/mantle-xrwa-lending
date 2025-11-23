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

// SubmitTransaction submits a transaction to the Ethereum network and returns tx hash and gas used
func SubmitTransaction(
	ctx context.Context,
	client interfaces.EthClient,
	privateKeyHex string,
	to common.Address,
	data []byte,
	metrics *observability.Metrics,
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

	// Get nonce with timeout
	nonceCtx, nonceCancel := context.WithTimeout(ctx, 30*time.Second)
	defer nonceCancel()

	nonce, err := client.PendingNonceAt(nonceCtx, fromAddress)
	if err != nil {
		if metrics != nil {
			metrics.RPCErrorsTotal.WithLabelValues("ethereum", "pending_nonce_at").Inc()
		}
		return common.Hash{}, 0, fmt.Errorf("failed to get nonce: %w", err)
	}
	if metrics != nil {
		metrics.RPCCallsTotal.WithLabelValues("ethereum", "pending_nonce_at").Inc()
	}

	// Get gas price with timeout
	gasPriceCtx, gasPriceCancel := context.WithTimeout(ctx, 30*time.Second)
	defer gasPriceCancel()

	gasPrice, err := client.SuggestGasPrice(gasPriceCtx)
	if err != nil {
		if metrics != nil {
			metrics.RPCErrorsTotal.WithLabelValues("ethereum", "suggest_gas_price").Inc()
		}
		return common.Hash{}, 0, fmt.Errorf("failed to get gas price: %w", err)
	}
	if metrics != nil {
		metrics.RPCCallsTotal.WithLabelValues("ethereum", "suggest_gas_price").Inc()
	}

	// Estimate gas limit with timeout
	estimateCtx, estimateCancel := context.WithTimeout(ctx, 30*time.Second)
	defer estimateCancel()

	msg := ethereum.CallMsg{
		From: fromAddress,
		To:   &to,
		Data: data,
	}
	gasLimit, err := client.EstimateGas(estimateCtx, msg)
	if err != nil {
		if metrics != nil {
			metrics.RPCErrorsTotal.WithLabelValues("ethereum", "estimate_gas").Inc()
		}
		return common.Hash{}, 0, fmt.Errorf("failed to estimate gas: %w", err)
	}
	if metrics != nil {
		metrics.RPCCallsTotal.WithLabelValues("ethereum", "estimate_gas").Inc()
	}

	// Add 20% buffer to gas limit
	gasLimit = gasLimit * 120 / 100

	// Get chain ID with timeout
	chainIDCtx, chainIDCancel := context.WithTimeout(ctx, 30*time.Second)
	defer chainIDCancel()

	chainID, err := client.NetworkID(chainIDCtx)
	if err != nil {
		if metrics != nil {
			metrics.RPCErrorsTotal.WithLabelValues("ethereum", "network_id").Inc()
		}
		return common.Hash{}, 0, fmt.Errorf("failed to get chain ID: %w", err)
	}
	if metrics != nil {
		metrics.RPCCallsTotal.WithLabelValues("ethereum", "network_id").Inc()
	}

	// Create transaction
	tx := types.NewTransaction(nonce, to, big.NewInt(0), gasLimit, gasPrice, data)

	// Sign transaction
	signedTx, err := types.SignTx(tx, types.NewEIP155Signer(chainID), privateKey)
	if err != nil {
		return common.Hash{}, 0, fmt.Errorf("failed to sign transaction: %w", err)
	}

	// Send transaction with timeout
	sendCtx, sendCancel := context.WithTimeout(ctx, 30*time.Second)
	defer sendCancel()

	err = client.SendTransaction(sendCtx, signedTx)
	if err != nil {
		if metrics != nil {
			metrics.RPCErrorsTotal.WithLabelValues("ethereum", "send_transaction").Inc()
		}
		return common.Hash{}, 0, fmt.Errorf("failed to send transaction: %w", err)
	}
	if metrics != nil {
		metrics.RPCCallsTotal.WithLabelValues("ethereum", "send_transaction").Inc()
	}

	return signedTx.Hash(), gasLimit, nil
}

// RetryWithBackoff executes a function with exponential backoff retry logic
func RetryWithBackoff(ctx context.Context, maxRetries int, metrics *observability.Metrics, operation string, fn func() error) error {
	var lastErr error
	baseDelay := 1 * time.Second

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
