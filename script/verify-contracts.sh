#!/usr/bin/env bash
# Verify deployed contracts on Tenderly Virtual TestNets
#
# Prerequisites:
#   - .env file with deployed contract addresses and RPC URLs
#   - TENDERLY_ACCESS_TOKEN environment variable set
#
# Usage:
#   export TENDERLY_ACCESS_TOKEN=<your_token>
#   ./script/verify-contracts.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Load environment variables
if [[ -f "$PROJECT_ROOT/.env" ]]; then
    source "$PROJECT_ROOT/.env"
else
    echo "Error: .env file not found at $PROJECT_ROOT/.env"
    exit 1
fi

# Check for Tenderly access token
if [[ -z "${TENDERLY_ACCESS_TOKEN:-}" ]]; then
    echo "Error: TENDERLY_ACCESS_TOKEN environment variable not set"
    echo "Generate one at: Tenderly Dashboard > Settings > Authorization"
    exit 1
fi

# Construct verifier URLs from RPC endpoints
MANTLE_VERIFIER_URL="${MANTLE_RPC_VTE}/verify/etherscan"
ETH_VERIFIER_URL="${ETHEREUM_RPC_VTE}/verify/etherscan"

echo "=== Tenderly Contract Verification ==="
echo ""

# Track verification results
FAILED=0

verify_contract() {
    local address=$1
    local contract_path=$2
    local verifier_url=$3
    local chain_name=$4

    echo "Verifying $contract_path on $chain_name..."

    if forge verify-contract "$address" "$contract_path" \
        --etherscan-api-key "$TENDERLY_ACCESS_TOKEN" \
        --verifier-url "$verifier_url" \
        --watch 2>&1; then
        echo "  -> Verified"
    else
        echo "  -> FAILED"
        FAILED=$((FAILED + 1))
    fi
    echo ""
}

echo "--- Mantle VTE (Chain ID: $MANTLE_CHAIN_ID) ---"
verify_contract "$MANTLE_LOCKER" \
    "contracts/mantle/CollateralLocker.sol:CollateralLocker" \
    "$MANTLE_VERIFIER_URL" \
    "Mantle VTE"

echo "--- Ethereum VTE (Chain ID: $ETHEREUM_CHAIN_ID) ---"
verify_contract "$ETH_ACUSDY" \
    "contracts/ethereum/AcUSDY.sol:AcUSDY" \
    "$ETH_VERIFIER_URL" \
    "Ethereum VTE"

verify_contract "$ETH_RECEIVER" \
    "contracts/ethereum/XRWAReceiver.sol:XRWAReceiver" \
    "$ETH_VERIFIER_URL" \
    "Ethereum VTE"

verify_contract "$ETH_ORACLE" \
    "contracts/ethereum/NAVOracle.sol:NAVOracle" \
    "$ETH_VERIFIER_URL" \
    "Ethereum VTE"

verify_contract "$ETH_ADAPTER" \
    "contracts/ethereum/MorphoAdapter.sol:MorphoAdapter" \
    "$ETH_VERIFIER_URL" \
    "Ethereum VTE"

echo "=== Verification Summary ==="
if [[ $FAILED -eq 0 ]]; then
    echo "All contracts verified successfully"
    exit 0
else
    echo "$FAILED contract(s) failed verification"
    exit 1
fi
