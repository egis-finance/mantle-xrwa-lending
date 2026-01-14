package priceupdater

import (
	"context"
	"crypto/ecdsa"
	"fmt"
	"math/big"
	"strings"
	"time"

	"github.com/ethereum/go-ethereum"
	"github.com/ethereum/go-ethereum/accounts/abi"
	"github.com/ethereum/go-ethereum/accounts/abi/bind"
	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/core/types"
	"github.com/ethereum/go-ethereum/crypto"
	"github.com/ethereum/go-ethereum/ethclient"
)

// NAVOracleABI is the minimal ABI for our NAVOracle contract
// Includes read functions (currentPrice, lastUpdate, isStale) and write function (updatePrice)
//
// NAVOracle implements IOracle interface for Morpho Blue compatibility:
//   - price() returns current price with staleness check and 2% haircut
//   - updatePrice() allows admin to set new price (resets staleness timer)
//
// Staleness: price() reverts if block.timestamp > lastUpdate + 24 hours
const NAVOracleABI = `[
	{
		"inputs": [],
		"name": "currentPrice",
		"outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}],
		"stateMutability": "view",
		"type": "function"
	},
	{
		"inputs": [],
		"name": "lastUpdate",
		"outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}],
		"stateMutability": "view",
		"type": "function"
	},
	{
		"inputs": [],
		"name": "admin",
		"outputs": [{"internalType": "address", "name": "", "type": "address"}],
		"stateMutability": "view",
		"type": "function"
	},
	{
		"inputs": [],
		"name": "isStale",
		"outputs": [{"internalType": "bool", "name": "", "type": "bool"}],
		"stateMutability": "view",
		"type": "function"
	},
	{
		"inputs": [],
		"name": "price",
		"outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}],
		"stateMutability": "view",
		"type": "function"
	},
	{
		"inputs": [{"internalType": "uint256", "name": "newPrice", "type": "uint256"}],
		"name": "updatePrice",
		"outputs": [],
		"stateMutability": "nonpayable",
		"type": "function"
	}
]`

// NAVOracleState represents the current state of the NAVOracle contract
type NAVOracleState struct {
	CurrentPrice *big.Int      // Raw price in 24 decimals (before haircut)
	LastUpdate   time.Time     // Timestamp of last price update
	IsStale      bool          // True if price has exceeded 24h staleness window
	Admin        common.Address // Address authorized to call updatePrice()
}

// NAVClient reads and writes to our NAVOracle contract
type NAVClient struct {
	client        *ethclient.Client
	oracleAddress common.Address
	chainID       *big.Int
	privateKey    *ecdsa.PrivateKey
	abi           abi.ABI
}

// NewNAVClient creates a client for interacting with NAVOracle
//
// Parameters:
//   - client: Ethereum RPC client
//   - oracleAddress: Deployed NAVOracle contract address
//   - chainID: Ethereum chain ID (for transaction signing)
//   - privateKeyHex: Admin private key in hex format (with or without 0x prefix)
func NewNAVClient(client *ethclient.Client, oracleAddress common.Address, chainID *big.Int, privateKeyHex string) (*NAVClient, error) {
	parsedABI, err := abi.JSON(strings.NewReader(NAVOracleABI))
	if err != nil {
		return nil, fmt.Errorf("failed to parse NAVOracle ABI: %w", err)
	}

	// Parse private key (strip 0x prefix if present)
	keyHex := strings.TrimPrefix(privateKeyHex, "0x")
	privateKey, err := crypto.HexToECDSA(keyHex)
	if err != nil {
		return nil, fmt.Errorf("invalid private key: %w", err)
	}

	return &NAVClient{
		client:        client,
		oracleAddress: oracleAddress,
		chainID:       chainID,
		privateKey:    privateKey,
		abi:           parsedABI,
	}, nil
}

// GetState fetches the current state of the NAVOracle contract
func (c *NAVClient) GetState(ctx context.Context) (*NAVOracleState, error) {
	state := &NAVOracleState{}

	// Fetch currentPrice
	price, err := c.callUint256(ctx, "currentPrice")
	if err != nil {
		return nil, fmt.Errorf("failed to get currentPrice: %w", err)
	}
	state.CurrentPrice = price

	// Fetch lastUpdate
	lastUpdate, err := c.callUint256(ctx, "lastUpdate")
	if err != nil {
		return nil, fmt.Errorf("failed to get lastUpdate: %w", err)
	}
	state.LastUpdate = time.Unix(lastUpdate.Int64(), 0)

	// Fetch isStale
	isStale, err := c.callBool(ctx, "isStale")
	if err != nil {
		return nil, fmt.Errorf("failed to get isStale: %w", err)
	}
	state.IsStale = isStale

	// Fetch admin
	admin, err := c.callAddress(ctx, "admin")
	if err != nil {
		return nil, fmt.Errorf("failed to get admin: %w", err)
	}
	state.Admin = admin

	return state, nil
}

// UpdatePrice submits a transaction to update the NAVOracle price
//
// Parameters:
//   - ctx: Context for cancellation and timeouts
//   - newPrice: New price in Morpho's 24-decimal format
//
// Returns:
//   - tx: The submitted transaction
//   - error: If transaction submission fails
//
// The caller should wait for transaction confirmation using WaitForReceipt
func (c *NAVClient) UpdatePrice(ctx context.Context, newPrice *big.Int) (*types.Transaction, error) {
	// Validate price is non-zero (contract will reject zero)
	if newPrice.Sign() <= 0 {
		return nil, fmt.Errorf("price must be positive, got %s", newPrice)
	}

	// Encode updatePrice(uint256) call
	callData, err := c.abi.Pack("updatePrice", newPrice)
	if err != nil {
		return nil, fmt.Errorf("failed to pack updatePrice call: %w", err)
	}

	// Get signer address
	signerAddress := crypto.PubkeyToAddress(c.privateKey.PublicKey)

	// Fetch nonce
	nonce, err := c.client.PendingNonceAt(ctx, signerAddress)
	if err != nil {
		return nil, fmt.Errorf("failed to get nonce: %w", err)
	}

	// Estimate gas
	gasLimit, err := c.client.EstimateGas(ctx, ethereum.CallMsg{
		From: signerAddress,
		To:   &c.oracleAddress,
		Data: callData,
	})
	if err != nil {
		return nil, fmt.Errorf("failed to estimate gas: %w", err)
	}
	// Add 50% buffer to guard against gas estimate under-shoots
	gasLimit = gasLimit * 150 / 100

	// Get gas price
	gasPrice, err := c.client.SuggestGasPrice(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to get gas price: %w", err)
	}

	// Create transaction
	tx := types.NewTransaction(
		nonce,
		c.oracleAddress,
		big.NewInt(0), // No ETH value
		gasLimit,
		gasPrice,
		callData,
	)

	// Sign transaction
	signedTx, err := types.SignTx(tx, types.NewEIP155Signer(c.chainID), c.privateKey)
	if err != nil {
		return nil, fmt.Errorf("failed to sign transaction: %w", err)
	}

	// Submit transaction
	err = c.client.SendTransaction(ctx, signedTx)
	if err != nil {
		return nil, fmt.Errorf("failed to send transaction: %w", err)
	}

	return signedTx, nil
}

// WaitForReceipt waits for a transaction to be mined and returns the receipt
//
// Parameters:
//   - ctx: Context for cancellation and timeouts
//   - tx: The transaction to wait for
//
// Returns:
//   - receipt: Transaction receipt with status and logs
//   - error: If waiting fails or transaction reverts
func (c *NAVClient) WaitForReceipt(ctx context.Context, tx *types.Transaction) (*types.Receipt, error) {
	receipt, err := bind.WaitMined(ctx, c.client, tx)
	if err != nil {
		return nil, fmt.Errorf("failed waiting for transaction: %w", err)
	}

	if receipt.Status != types.ReceiptStatusSuccessful {
		return receipt, fmt.Errorf("transaction reverted: %s", tx.Hash().Hex())
	}

	return receipt, nil
}

// SignerAddress returns the address derived from the configured private key
func (c *NAVClient) SignerAddress() common.Address {
	return crypto.PubkeyToAddress(c.privateKey.PublicKey)
}

// OracleAddress returns the NAVOracle contract address
func (c *NAVClient) OracleAddress() common.Address {
	return c.oracleAddress
}

// Helper: call a view function that returns uint256
func (c *NAVClient) callUint256(ctx context.Context, method string) (*big.Int, error) {
	callData, err := c.abi.Pack(method)
	if err != nil {
		return nil, err
	}

	result, err := c.client.CallContract(ctx, ethereum.CallMsg{
		To:   &c.oracleAddress,
		Data: callData,
	}, nil)
	if err != nil {
		return nil, err
	}

	var value *big.Int
	err = c.abi.UnpackIntoInterface(&value, method, result)
	if err != nil {
		return nil, err
	}

	return value, nil
}

// Helper: call a view function that returns bool
func (c *NAVClient) callBool(ctx context.Context, method string) (bool, error) {
	callData, err := c.abi.Pack(method)
	if err != nil {
		return false, err
	}

	result, err := c.client.CallContract(ctx, ethereum.CallMsg{
		To:   &c.oracleAddress,
		Data: callData,
	}, nil)
	if err != nil {
		return false, err
	}

	var value bool
	err = c.abi.UnpackIntoInterface(&value, method, result)
	if err != nil {
		return false, err
	}

	return value, nil
}

// Helper: call a view function that returns address
func (c *NAVClient) callAddress(ctx context.Context, method string) (common.Address, error) {
	callData, err := c.abi.Pack(method)
	if err != nil {
		return common.Address{}, err
	}

	result, err := c.client.CallContract(ctx, ethereum.CallMsg{
		To:   &c.oracleAddress,
		Data: callData,
	}, nil)
	if err != nil {
		return common.Address{}, err
	}

	var value common.Address
	err = c.abi.UnpackIntoInterface(&value, method, result)
	if err != nil {
		return common.Address{}, err
	}

	return value, nil
}

// FormatMorphoPrice converts a 24-decimal price to a human-readable USD string
func FormatMorphoPrice(price24Decimals *big.Int) string {
	// Convert to float for display (not for calculations!)
	priceFloat := new(big.Float).SetInt(price24Decimals)
	divisor := new(big.Float).SetInt(new(big.Int).Exp(big.NewInt(10), big.NewInt(24), nil))
	priceFloat.Quo(priceFloat, divisor)

	usd, _ := priceFloat.Float64()
	return fmt.Sprintf("$%.6f", usd)
}
