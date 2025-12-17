#!/bin/bash
# Check cross-chain TVL peg between Mantle and Ethereum
# Requires: foundry (cast), .env file in parent directory

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../.env"

# Contract addresses
MANTLE_LOCKER="${MANTLE_LOCKER:-0x0C81512f121c45d08F0553890D7bE6D10C6De8a7}"
ETH_ACUSDY="${ETH_ACUSDY:-0x0C81512f121c45d08F0553890D7bE6D10C6De8a7}"

echo "Cross-Chain TVL Peg Check"
echo "========================="
echo ""

# Query Mantle CollateralLocker (extract first word to remove [1e18] suffix)
mantle_raw=$(cast call "$MANTLE_LOCKER" "getTotalLocked()(uint256)" --rpc-url "$MANTLE_RPC_VTE" 2>/dev/null | awk '{print $1}')
mantle_formatted=$(cast to-unit "$mantle_raw" ether)

# Query Ethereum AcUSDY
eth_raw=$(cast call "$ETH_ACUSDY" "totalSupply()(uint256)" --rpc-url "$ETHEREUM_RPC_VTE" 2>/dev/null | awk '{print $1}')
eth_formatted=$(cast to-unit "$eth_raw" ether)

echo "Mantle (USDY Locked):     $mantle_formatted USDY"
echo "Ethereum (AcUSDY Minted): $eth_formatted AcUSDY"
echo ""

# Compare values
if [ "$mantle_raw" = "$eth_raw" ]; then
    echo "Status: ✓ System Balanced"
else
    echo "Status: ⚠ Peg Deviation Detected"
    echo "  Mantle raw:   $mantle_raw"
    echo "  Ethereum raw: $eth_raw"
fi
