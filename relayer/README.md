# xRWA DVN Relayer

Automated relayer service that monitors lock events on Mantle and submits cross-chain attestations to Ethereum.

## Architecture

The relayer implements the Data Verification Network (DVN) pattern for cross-chain authentication:

1. **Event Monitoring** - Subscribes to `Locked` events from CollateralLocker on Mantle VTE
2. **Backfill & Catch-up** - On startup, processes missed events from persisted cursor to current block
3. **EIP-712 Signing** - Generates typed data signatures using DVN private key
4. **Attestation Submission** - Calls `XRWAReceiver.mintWithAttestation()` on Ethereum VTE
5. **Persistence** - Tracks processed locks in `data/processed_locks.json` with cursor for restarts

## Prerequisites

- Go 1.21 or later
- Access to Tenderly Virtual TestNets (Mantle & Ethereum)
- DVN private key configured in `.env`
- Deployed contracts (see parent README)

## Quick Start

```bash
# Using Makefile (preferred)
make build    # Build to bin/relayer
make run      # Build and run
make test     # Run tests with race detector
make lint     # Run golangci-lint
make dev      # Full dev workflow: fmt → lint → test → build

# Direct commands
go build -o bin/relayer ./cmd/relayer
./bin/relayer
```

## Configuration

The relayer reads from `.env` in the parent directory (auto-searches `../../.env`, `../.env`, `./.env`).

### Required Variables
```bash
MANTLE_CHAIN_ID=15000          # Tenderly VTE chain ID
ETHEREUM_CHAIN_ID=10001        # Tenderly VTE chain ID
MANTLE_RPC_VTE=https://...     # Mantle RPC endpoint
ETHEREUM_RPC_VTE=https://...   # Ethereum RPC endpoint
MANTLE_LOCKER=0x...            # CollateralLocker address
ETH_RECEIVER=0x...             # XRWAReceiver address
DVN1_ADDRESS=0x...             # DVN signer address
DVN1_PRIVATE_KEY=0x...         # DVN private key (with or without 0x)
```

### Optional Variables
```bash
RELAYER_MAX_RETRIES=5
RELAYER_ENABLE_BACKOFF=true
RELAYER_HEALTH_CHECK_INTERVAL=30
RELAYER_PERSISTENCE_ENABLED=true
RELAYER_PERSISTENCE_FILE=./data/processed_locks.json
LOG_LEVEL=info                 # debug, info, warn, error
LOG_FORMAT=console             # console or json
```

## Testing

### Unit Tests
```bash
make test                                           # All tests
go test ./pkg/dvn/... -v -race -run TestSignLock   # Single test
```

### Manual E2E Test
```bash
# Terminal 1: Start relayer
make run

# Terminal 2: Lock USDY on Mantle
source ../.env
VC_HASH="0x$(echo -n "test-vc" | sha256sum | cut -d' ' -f1)"
cast send $MANTLE_LOCKER "lock(uint256,uint64,bytes32)" \
  1000000 $(date -v+1H +%s) $VC_HASH \
  --rpc-url $MANTLE_RPC_VTE --private-key $BORROWER_PRIVATE_KEY

# Verify AcUSDY minted
cast call $ETH_ACUSDY "balanceOf(address)(uint256)" $BORROWER_ADDRESS --rpc-url $ETHEREUM_RPC_VTE
```

## Project Structure

```
relayer/
├── cmd/relayer/main.go           # Entry point, graceful shutdown
├── pkg/
│   ├── config/config.go          # Environment configuration
│   ├── dvn/
│   │   ├── relayer.go            # Event loop, backfill, dedup
│   │   └── eip712.go             # EIP-712 signing
│   ├── persistence/store.go      # JSON storage, cursor tracking
│   ├── observability/            # Metrics, tracing, health HTTP
│   ├── logger/                   # Zap structured logging
│   └── chain/utils.go            # RPC helpers, retry logic
├── internal/contracts/           # Generated Go bindings
├── data/processed_locks.json     # Persistence (git-tracked)
└── Makefile
```

## Key Features

### Three-Layer Deduplication
1. **Memory map** - Fast runtime lookups
2. **JSON persistence** - Survives restarts
3. **On-chain `consumed`** - Authoritative source of truth

### Fault Tolerance
- WebSocket subscription with 2s polling fallback
- Exponential backoff on RPC failures
- Cursor-based backfill for missed events during downtime

### Observability
- **Health endpoints**: `/health/live`, `/health/ready`, `/health`
- **Prometheus metrics**: `/metrics` (port 8080)
- **OpenTelemetry tracing**: Jaeger integration

## Development

### Logging (use zap, not go-ethereum log)
```go
import "github.com/egis-finance/mantle-xrwa-lending/relayer/pkg/logger"

logger.Infow("Message", "key", value)
logger.Warnw("Warning", "error", err)
```

### Docker
```bash
make docker-up       # Start full stack (relayer + Jaeger + Prometheus + Grafana)
make docker-logs     # Tail logs
make docker-locks    # View processed locks in volume
make docker-set-cursor BLOCK=87000000  # Reset backfill cursor
```

## Troubleshooting

| Error | Solution |
|-------|----------|
| Connection refused | Check RPC URLs, test with `curl -X POST -d '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' $URL` |
| Invalid private key | `DVN1_PRIVATE_KEY` must be 64 hex chars (with or without 0x) |
| Insufficient funds | Fund DVN: `cast send $DVN1_ADDRESS --value 0.1ether --rpc-url $ETHEREUM_RPC_VTE` |
| Lock already processed | Normal dedup behavior; delete `data/processed_locks.json` to reprocess |
| Signature verification fails | Check chain IDs match between config and deployed contracts |

## License

MIT
