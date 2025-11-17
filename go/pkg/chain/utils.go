package chain

import (
	"context"
	"crypto/ecdsa"
	"fmt"
	"math/big"
	"time"

	"github.com/egis-finance/mantle-xrwa-lending/relayer/internal/contracts"
	"github.com/ethereum/go-ethereum"
	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/core/types"
	"github.com/ethereum/go-ethereum/crypto"
	"github.com/ethereum/go-ethereum/ethclient"
	"github.com/ethereum/go-ethereum/log"
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

// SubmitTransaction submits a transaction to the Ethereum network
func SubmitTransaction(
	ctx context.Context,
	client *ethclient.Client,
	privateKeyHex string,
	to common.Address,
	data []byte,
) (common.Hash, error) {
	// Parse private key
	if len(privateKeyHex) > 2 && privateKeyHex[:2] == "0x" {
		privateKeyHex = privateKeyHex[2:]
	}
	privateKey, err := crypto.HexToECDSA(privateKeyHex)
	if err != nil {
		return common.Hash{}, fmt.Errorf("invalid private key: %w", err)
	}

	// Get sender address
	publicKey := privateKey.Public()
	publicKeyECDSA, ok := publicKey.(*ecdsa.PublicKey)
	if !ok {
		return common.Hash{}, fmt.Errorf("cannot assert type: publicKey is not of type *ecdsa.PublicKey")
	}
	fromAddress := crypto.PubkeyToAddress(*publicKeyECDSA)

	// Get nonce
	nonce, err := client.PendingNonceAt(ctx, fromAddress)
	if err != nil {
		return common.Hash{}, fmt.Errorf("failed to get nonce: %w", err)
	}

	// Get gas price
	gasPrice, err := client.SuggestGasPrice(ctx)
	if err != nil {
		return common.Hash{}, fmt.Errorf("failed to get gas price: %w", err)
	}

	// Estimate gas limit
	msg := ethereum.CallMsg{
		From: fromAddress,
		To:   &to,
		Data: data,
	}
	gasLimit, err := client.EstimateGas(ctx, msg)
	if err != nil {
		return common.Hash{}, fmt.Errorf("failed to estimate gas: %w", err)
	}

	// Add 20% buffer to gas limit
	gasLimit = gasLimit * 120 / 100

	// Get chain ID
	chainID, err := client.NetworkID(ctx)
	if err != nil {
		return common.Hash{}, fmt.Errorf("failed to get chain ID: %w", err)
	}

	// Create transaction
	tx := types.NewTransaction(nonce, to, big.NewInt(0), gasLimit, gasPrice, data)

	// Sign transaction
	signedTx, err := types.SignTx(tx, types.NewEIP155Signer(chainID), privateKey)
	if err != nil {
		return common.Hash{}, fmt.Errorf("failed to sign transaction: %w", err)
	}

	// Send transaction
	err = client.SendTransaction(ctx, signedTx)
	if err != nil {
		return common.Hash{}, fmt.Errorf("failed to send transaction: %w", err)
	}

	return signedTx.Hash(), nil
}

// RetryWithBackoff executes a function with exponential backoff retry logic
func RetryWithBackoff(ctx context.Context, maxRetries int, operation string, fn func() error) error {
	var lastErr error
	baseDelay := 1 * time.Second

	for attempt := 0; attempt <= maxRetries; attempt++ {
		err := fn()
		if err == nil {
			if attempt > 0 {
				log.Info("Operation succeeded after retry",
					"operation", operation,
					"attempts", attempt+1,
				)
			}
			return nil
		}

		lastErr = err

		if attempt < maxRetries {
			// Calculate exponential backoff delay
			delay := baseDelay * time.Duration(1<<uint(attempt))
			log.Warn("Operation failed, retrying with backoff",
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
