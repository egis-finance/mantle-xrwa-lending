package priceupdater

import (
	"context"
	"fmt"
	"math/big"
	"strings"

	"github.com/ethereum/go-ethereum"
	"github.com/ethereum/go-ethereum/accounts/abi"
	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/ethclient"
)

// OndoOracleABI is the minimal ABI for Ondo's RWADynamicRateOracle
// Only includes the getPrice() function we need to read USDY prices
//
// The full contract implements IRWADynamicOracle interface:
//   - getPrice() returns the current USDY price with 18 decimals
//   - Price is computed as: (dailyInterestRate ^ daysElapsed) * lastSetPrice
//
// For USDY, the price represents the redemption value in USD
// Example: 1_119_222_110_000_000_000 = $1.119222 per USDY
const OndoOracleABI = `[
	{
		"inputs": [],
		"name": "getPrice",
		"outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}],
		"stateMutability": "view",
		"type": "function"
	}
]`

// OndoClient reads USDY prices from Ondo's RWADynamicRateOracle contract
type OndoClient struct {
	client        *ethclient.Client
	oracleAddress common.Address
	abi           abi.ABI
}

// NewOndoClient creates a client for reading from Ondo's oracle
func NewOndoClient(client *ethclient.Client, oracleAddress common.Address) (*OndoClient, error) {
	parsedABI, err := abi.JSON(strings.NewReader(OndoOracleABI))
	if err != nil {
		return nil, fmt.Errorf("failed to parse Ondo oracle ABI: %w", err)
	}

	return &OndoClient{
		client:        client,
		oracleAddress: oracleAddress,
		abi:           parsedABI,
	}, nil
}

// GetPrice fetches the current USDY price from Ondo's oracle
//
// Returns:
//   - price: USDY price in 18 decimals (e.g., 1.12 USDY = 1_120_000_000_000_000_000)
//   - error: if the RPC call fails or returns invalid data
//
// The returned price represents the USD value of 1 USDY token.
// USDY is a yield-bearing stablecoin that accrues ~5% APY, so the price
// slowly increases over time (approximately $0.00014 per day on a $1.04 base).
func (c *OndoClient) GetPrice(ctx context.Context) (*big.Int, error) {
	// Encode the getPrice() call
	callData, err := c.abi.Pack("getPrice")
	if err != nil {
		return nil, fmt.Errorf("failed to pack getPrice call: %w", err)
	}

	// Execute the call
	result, err := c.client.CallContract(ctx, ethereum.CallMsg{
		To:   &c.oracleAddress,
		Data: callData,
	}, nil) // nil = latest block
	if err != nil {
		return nil, fmt.Errorf("getPrice call failed: %w", err)
	}

	// Decode the result
	if len(result) == 0 {
		return nil, fmt.Errorf("getPrice returned empty result")
	}

	// Unpack the uint256 return value
	var price *big.Int
	err = c.abi.UnpackIntoInterface(&price, "getPrice", result)
	if err != nil {
		return nil, fmt.Errorf("failed to unpack getPrice result: %w", err)
	}

	// Sanity check: USDY price should be reasonable ($0.50 - $2.00 range)
	// In 18 decimals: 500_000_000_000_000_000 to 2_000_000_000_000_000_000
	minPrice := big.NewInt(500_000_000_000_000_000)  // $0.50
	maxPrice := big.NewInt(2_000_000_000_000_000_000) // $2.00

	if price.Cmp(minPrice) < 0 || price.Cmp(maxPrice) > 0 {
		return nil, fmt.Errorf("price %s outside reasonable range [%s, %s]", price, minPrice, maxPrice)
	}

	return price, nil
}

// OracleAddress returns the Ondo oracle contract address
func (c *OndoClient) OracleAddress() common.Address {
	return c.oracleAddress
}

// ConvertToMorphoFormat converts Ondo's 18-decimal price to Morpho's 24-decimal format
//
// Morpho Blue pricing formula:
// collateralPrice = rawPrice * 10^(36 + loanDecimals - collateralDecimals)
//
// For USDC (6 decimals) / AcUSDY (18 decimals):
// collateralPrice = rawPrice * 10^(36 + 6 - 18) = rawPrice * 10^24
//
// Since Ondo returns 18 decimals and Morpho needs 24, we multiply by 10^6
//
// Example:
//
//	Ondo price:   1_119_222_110_000_000_000 (18 dec) = $1.119222
//	Morpho price: 1_119_222_110_000_000_000_000_000 (24 dec)
func ConvertToMorphoFormat(ondoPrice *big.Int) *big.Int {
	// Multiply by 10^6 to convert from 18 to 24 decimals
	multiplier := big.NewInt(1_000_000)
	return new(big.Int).Mul(ondoPrice, multiplier)
}

// FormatPriceUSD converts an 18-decimal price to a human-readable USD string
func FormatPriceUSD(price18Decimals *big.Int) string {
	// Convert to float for display (not for calculations!)
	priceFloat := new(big.Float).SetInt(price18Decimals)
	divisor := new(big.Float).SetInt(big.NewInt(1_000_000_000_000_000_000))
	priceFloat.Quo(priceFloat, divisor)

	usd, _ := priceFloat.Float64()
	return fmt.Sprintf("$%.6f", usd)
}
