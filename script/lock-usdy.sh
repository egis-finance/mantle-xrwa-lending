#!/usr/bin/env bash
#
# Lock USDY on Mantle to mint AcUSDY via cross-chain attestation
#
# Usage:
#   ./script/lock-usdy.sh <amount> [options]
#
# Arguments:
#   amount    Amount of USDY to lock (in whole units, e.g., 50 for 50 USDY)
#
# Options:
#   --rpc-url URL    Override RPC URL (default: $MANTLE_RPC_VTE from .env)
#   --dry-run        Simulate without broadcasting
#   --help           Show this help message
#
# Environment:
#   GAS_LIMIT        Optional explicit gas limit per transaction (default: 1_000_000)
#
# Prerequisites:
#   - .env file with MANTLE_LOCKER, MANTLE_USDY, BORROWER_ADDRESS, BORROWER_PRIVATE_KEY
#   - Borrower funded with USDY (use FundWallets.s.sol)
#   - Foundry installed
#
# Examples:
#   ./script/lock-usdy.sh 50           # Lock 50 USDY
#   ./script/lock-usdy.sh 100 --dry-run # Simulate locking 100 USDY
#   ./script/lock-usdy.sh 25 --rpc-url http://localhost:8545

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

show_help() {
    head -25 "$0" | grep "^#" | sed 's/^# //' | sed 's/^#//'
    exit 0
}

error() {
    echo -e "${RED}Error:${NC} $1" >&2
}

info() {
    echo -e "${GREEN}Info:${NC} $1"
}

warn() {
    echo -e "${YELLOW}Warning:${NC} $1"
}

error_with_help() {
    error "$1"
    echo "" >&2
    echo "Usage: $0 <amount> [--rpc-url URL] [--dry-run]" >&2
    echo "Run '$0 --help' for more information." >&2
    exit 1
}

# Parse arguments
AMOUNT=""
RPC_URL=""
DRY_RUN=""

while [[ $# -gt 0 ]]; do
    case $1 in
        --help|-h)
            show_help
            ;;
        --rpc-url)
            if [[ -z "${2:-}" ]]; then
                error_with_help "--rpc-url requires a URL argument"
            fi
            RPC_URL="$2"
            shift 2
            ;;
        --dry-run)
            DRY_RUN="true"
            shift
            ;;
        -*)
            error_with_help "Unknown option: $1"
            ;;
        *)
            if [[ -z "$AMOUNT" ]]; then
                AMOUNT="$1"
            else
                error_with_help "Unexpected argument: $1"
            fi
            shift
            ;;
    esac
done

# Validate amount is provided
if [[ -z "$AMOUNT" ]]; then
    error_with_help "Amount is required"
fi

# Validate amount is numeric
if ! [[ "$AMOUNT" =~ ^[0-9]+$ ]]; then
    error_with_help "Amount must be a positive integer (got: $AMOUNT)"
fi

# Validate amount is non-zero
if [[ "$AMOUNT" -eq 0 ]]; then
    error_with_help "Amount must be greater than zero"
fi

# Default gas limit (can be overridden via GAS_LIMIT env var)
GAS_LIMIT="${GAS_LIMIT:-1000000}"

# Load environment
if [[ -f "$PROJECT_ROOT/.env" ]]; then
    # shellcheck disable=SC1091
    source "$PROJECT_ROOT/.env"
else
    error_with_help ".env file not found at $PROJECT_ROOT/.env"
fi

# Validate required env vars
REQUIRED_VARS=(
    "MANTLE_LOCKER"
    "MANTLE_USDY"
    "BORROWER_ADDRESS"
    "BORROWER_PRIVATE_KEY"
)

MISSING_VARS=()
for var in "${REQUIRED_VARS[@]}"; do
    if [[ -z "${!var:-}" ]]; then
        MISSING_VARS+=("$var")
    fi
done

if [[ ${#MISSING_VARS[@]} -gt 0 ]]; then
    error "Missing required environment variables:"
    for var in "${MISSING_VARS[@]}"; do
        echo "  - $var" >&2
    done
    echo "" >&2
    echo "Ensure these are set in $PROJECT_ROOT/.env" >&2
    exit 1
fi

# Use RPC from .env if not overridden
RPC_URL="${RPC_URL:-${MANTLE_RPC_VTE:-}}"
if [[ -z "$RPC_URL" ]]; then
    error_with_help "No RPC URL: set --rpc-url or MANTLE_RPC_VTE in .env"
fi

# Build forge command
FORGE_ARGS=(
    "script" "$SCRIPT_DIR/LockMoreUSDY.s.sol"
    "--sig" "run(uint256)" "${AMOUNT}ether"
    "--rpc-url" "$RPC_URL"
    "--legacy"
    "--gas-limit" "$GAS_LIMIT"
    "--skip-simulation"
)

if [[ -n "$DRY_RUN" ]]; then
    warn "Dry run mode - transaction will not be broadcast"
else
    FORGE_ARGS+=("--broadcast")
fi

# Display action summary
echo "=========================================="
echo "  Lock USDY on Mantle"
echo "=========================================="
echo "  Amount:     $AMOUNT USDY"
echo "  Borrower:   $BORROWER_ADDRESS"
echo "  Locker:     $MANTLE_LOCKER"
echo "  RPC:        $RPC_URL"
echo "  Gas limit:  $GAS_LIMIT"
if [[ -n "$DRY_RUN" ]]; then
    echo "  Mode:       DRY RUN (no broadcast)"
fi
echo "=========================================="
echo ""

info "Locking $AMOUNT USDY on Mantle..."
cd "$PROJECT_ROOT"
forge "${FORGE_ARGS[@]}"

if [[ -z "$DRY_RUN" ]]; then
    echo ""
    info "Lock complete. Relayer will process attestation and mint AcUSDY on Ethereum."
fi
