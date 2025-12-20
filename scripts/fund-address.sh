#!/bin/bash
# Fund any address with tokens on Tenderly Virtual TestNets
# Uses Tenderly's custom RPC methods to set balances directly (no source wallet needed)
#
# Usage:
#   ./scripts/fund-address.sh <TARGET_ADDRESS>
#   ./scripts/fund-address.sh 0x1234...5678
#
# Funds the target with:
#   - 1,000,000 MNT (native) on Mantle VTE
#   - 1,000 ETH (native) on Ethereum VTE
#   - 1,000,000 USDC on both chains
#   - 1,000,000 USDY on Mantle

set -euo pipefail

# Load environment variables
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/../.env"

# Token addresses
MANTLE_USDY="${MANTLE_USDY:-0x5bE26527e817998A7206475496fDE1E68957c5A6}"
MANTLE_USDC="0x09Bc4E0D864854c6aFB6eB9A9cdF58aC190D0dF9"
ETH_USDC="${ETH_USDC:-0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48}"

# Funding amounts (hex-encoded wei/smallest unit)
# MNT: 1,000,000 tokens with 18 decimals = 10^24 = 0xd3c21bcecceda1000000
MNT_AMOUNT="0xd3c21bcecceda1000000"

# ETH: 1,000 tokens with 18 decimals = 10^21 = 0x3635c9adc5dea00000
ETH_AMOUNT="0x3635c9adc5dea00000"

# USDY: 1,000,000 tokens with 18 decimals = 10^24 = 0xd3c21bcecceda1000000
USDY_AMOUNT="0xd3c21bcecceda1000000"

# USDC: 1,000,000 tokens with 6 decimals = 10^12 = 0xe8d4a51000
USDC_AMOUNT="0xe8d4a51000"

usage() {
    echo "Usage: $0 <TARGET_ADDRESS>"
    echo ""
    echo "Funds the target address with tokens on Tenderly VTEs:"
    echo "  - 1,000,000 MNT (native) on Mantle"
    echo "  - 1,000 ETH (native) on Ethereum"
    echo "  - 1,000,000 USDC on both chains"
    echo "  - 1,000,000 USDY on Mantle"
    exit 1
}

# Validate target address
TARGET="${1:-}"
if [[ -z "$TARGET" ]] || [[ ! "$TARGET" =~ ^0x[a-fA-F0-9]{40}$ ]]; then
    echo "Error: Invalid or missing target address"
    usage
fi

echo "=========================================="
echo "Funding Address on Tenderly VTEs"
echo "=========================================="
echo "Target: $TARGET"
echo ""

# Set native balance using tenderly_setBalance
set_native_balance() {
    local rpc_url="$1"
    local chain_name="$2"
    local amount="$3"

    echo -n "  Setting native balance on $chain_name... "
    cast rpc --rpc-url "$rpc_url" tenderly_setBalance "$TARGET" "$amount" > /dev/null 2>&1
    echo "done"
}

# Set ERC20 balance using tenderly_setErc20Balance
set_erc20_balance() {
    local rpc_url="$1"
    local chain_name="$2"
    local token_address="$3"
    local token_name="$4"
    local amount="$5"

    echo -n "  Setting $token_name balance on $chain_name... "
    cast rpc --rpc-url "$rpc_url" tenderly_setErc20Balance "$token_address" "$TARGET" "$amount" > /dev/null 2>&1
    echo "done"
}

# Query and display balance using cast format-units
display_balance() {
    local rpc_url="$1"
    local chain_name="$2"
    local token_address="$3"
    local token_name="$4"
    local decimals="$5"

    local balance_wei
    # cast call returns "123456 [1.2e5]" - extract just the number
    balance_wei=$(cast call --rpc-url "$rpc_url" "$token_address" "balanceOf(address)(uint256)" "$TARGET" 2>/dev/null | awk '{print $1}' || echo "0")
    local formatted
    formatted=$(cast format-units "$balance_wei" "$decimals" 2>/dev/null || echo "0")
    echo "  $token_name: $formatted"
}

display_native_balance() {
    local rpc_url="$1"
    local chain_name="$2"
    local symbol="$3"

    local balance_wei
    balance_wei=$(cast balance --rpc-url "$rpc_url" "$TARGET" 2>/dev/null || echo "0")
    local formatted
    formatted=$(cast format-units "$balance_wei" 18 2>/dev/null || echo "0")
    echo "  $symbol: $formatted"
}

echo "[1/2] Funding on Mantle VTE..."
set_native_balance "$MANTLE_RPC_VTE" "Mantle" "$MNT_AMOUNT"
set_erc20_balance "$MANTLE_RPC_VTE" "Mantle" "$MANTLE_USDY" "USDY" "$USDY_AMOUNT"
set_erc20_balance "$MANTLE_RPC_VTE" "Mantle" "$MANTLE_USDC" "USDC" "$USDC_AMOUNT"

echo ""
echo "[2/2] Funding on Ethereum VTE..."
set_native_balance "$ETHEREUM_RPC_VTE" "Ethereum" "$ETH_AMOUNT"
set_erc20_balance "$ETHEREUM_RPC_VTE" "Ethereum" "$ETH_USDC" "USDC" "$USDC_AMOUNT"

echo ""
echo "=========================================="
echo "Final Balances"
echo "=========================================="
echo ""
echo "Mantle VTE:"
display_native_balance "$MANTLE_RPC_VTE" "Mantle" "MNT"
display_balance "$MANTLE_RPC_VTE" "Mantle" "$MANTLE_USDY" "USDY" 18
display_balance "$MANTLE_RPC_VTE" "Mantle" "$MANTLE_USDC" "USDC" 6

echo ""
echo "Ethereum VTE:"
display_native_balance "$ETHEREUM_RPC_VTE" "Ethereum" "ETH"
display_balance "$ETHEREUM_RPC_VTE" "Ethereum" "$ETH_USDC" "USDC" 6

echo ""
echo "Funding complete!"
