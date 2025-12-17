# xRWA DVN Relayer

Automated relayer service that monitors lock events on Mantle and submits cross-chain attestations to Ethereum.

## Architecture

The relayer implements the Data Verification Network (DVN) pattern for cross-chain authentication:

1. **Event Monitoring** - Subscribes to `Locked` events from CollateralLocker on Mantle VTE
2. **EIP-712 Signing** - Generates typed data signatures using DVN private key (includes vcHash for VC/DID compatibility)
3. **Attestation Submission** - Calls `XRWAReceiver.mintWithAttestation()` on Ethereum VTE with signed message

## Hybrid Design

This relayer implements the **hybrid Phase 1 + Phase 2 design** that combines:
- **VC/DID Integration**: Preserves `vcHash` field for Verifiable Credential support
- **Auto-Managed Nonces**: Simplifies user experience (nonces auto-increment per user)
- **Cross-Chain Semantics**: Explicit `sourceChainId`, `validUntil`, and `sourceLocker` fields for security

See `../HYBRID_DESIGN_CHANGES.md` for complete design documentation.

## Prerequisites

- Go 1.21 or later
- Access to Tenderly Virtual TestNets (Mantle & Ethereum)
- DVN private key configured in `.env`
- Deployed contracts (see parent README)

## Configuration

The relayer reads configuration from environment variables (compatible with existing `.env` file):

### Required Variables
```bash
# Chain IDs
MANTLE_CHAIN_ID=15000          # Tenderly VTE chain ID
ETHEREUM_CHAIN_ID=10001        # Tenderly VTE chain ID

# RPC Endpoints
MANTLE_RPC_VTE=https://virtual.mantle.eu.rpc.tenderly.co/...
ETHEREUM_RPC_VTE=https://virtual.mainnet.rpc.tenderly.co/...

# Deployed Contracts
MANTLE_LOCKER=0x...            # CollateralLocker address on Mantle
ETH_RECEIVER=0x...             # XRWAReceiver address on Ethereum

# DVN Credentials
DVN1_ADDRESS=0x...             # DVN signer address
DVN1_PRIVATE_KEY=0x...         # DVN private key (without 0x prefix also works)
```

All these variables are already configured in the project's `.env` file at the root directory.

## Building

From the `relayer/` directory:

```bash
# Install dependencies
go mod tidy

# Build the relayer
go build -o bin/relayer ./cmd/relayer

# Or build from project root
cd /path/to/mantle-xrwa-lending
go build -o relayer/bin/relayer ./relayer/cmd/relayer
```

## Running

### From the `relayer/` directory:
```bash
./bin/relayer
```

### From the project root:
```bash
./relayer/bin/relayer
```

The relayer will:
1. Load configuration from `../.env`
2. Connect to Mantle and Ethereum VTEs
3. Subscribe to `Locked` events
4. Automatically sign and submit attestations

### Expected Output
```
INFO [timestamp] Starting xRWA DVN Relayer
INFO [timestamp] Configuration loaded mantle_chain_id=15000 ethereum_chain_id=10001
INFO [timestamp] DVN relayer initialized dvn_address=0x... mantle_locker=0x... ethereum_receiver=0x...
INFO [timestamp] Relayer started successfully
INFO [timestamp] Subscribed to Locked events contract=0x...
INFO [timestamp] New lock detected borrower=0x... lock_id=0x... amount=1000000
INFO [timestamp] Lock message signed lock_id=0x... v=27
INFO [timestamp] Attestation transaction submitted tx_hash=0x... receiver=0x...
INFO [timestamp] Attestation submitted successfully lock_id=0x... borrower=0x...
```

## Testing

### Manual E2E Test

1. **Start the relayer**
   ```bash
   ./bin/relayer
   ```

2. **Lock USDY on Mantle** (from project root)
   ```bash
   source .env
   VC_HASH="0x$(echo -n "test-vc-credential" | sha256sum | cut -d' ' -f1)"
   cast send $MANTLE_LOCKER \
     "lock(uint256,uint64,bytes32)" \
     1000000 \
     $(date -d "+1 hour" +%s) \
     $VC_HASH \
     --rpc-url $MANTLE_RPC_VTE \
     --private-key $BORROWER_PRIVATE_KEY
   ```

3. **Observe relayer logs** - Should show:
   - Lock detected
   - Message signed
   - Attestation submitted

4. **Verify minting on Ethereum**
   ```bash
   cast call $ETH_ACUSDY \
     "balanceOf(address)(uint256)" \
     $BORROWER_ADDRESS \
     --rpc-url $ETHEREUM_RPC_VTE
   ```

## Project Structure

```
relayer/
├── cmd/
│   └── relayer/
│       └── main.go              # Entry point
├── pkg/
│   ├── config/
│   │   └── config.go            # Configuration loader
│   ├── dvn/
│   │   ├── eip712.go            # EIP-712 signature generation
│   │   └── relayer.go           # Main relayer logic
│   └── chain/
│       └── utils.go             # Blockchain utilities
├── internal/
│   └── contracts/
│       ├── locker.go            # CollateralLocker bindings
│       └── receiver.go          # XRWAReceiver bindings
├── go.mod
├── go.sum
└── README.md
```

## Key Components

### EIP-712 Signer (`pkg/dvn/eip712.go`)
- Computes domain separator for XRWAReceiver
- Generates typed data signatures for LockMessage
- Returns v, r, s signature components

### Relayer (`pkg/dvn/relayer.go`)
- Event subscription with automatic reconnection
- Falls back to polling if subscription fails
- Duplicate detection (tracks processed lockIds)
- Gas estimation and transaction submission

### Configuration (`pkg/config/config.go`)
- Loads from `.env` file (auto-detects parent directories)
- Compatible with existing project configuration
- Validates all required variables

## Troubleshooting

### "Failed to connect to Mantle: dial tcp: connection refused"
- Check that `MANTLE_RPC_VTE` is correct in `.env`
- Verify Tenderly VTE is running
- Test connectivity: `curl $MANTLE_RPC_VTE`

### "Failed to create signer: invalid private key"
- Ensure `DVN1_PRIVATE_KEY` is set correctly
- Private key can be with or without `0x` prefix

### "Failed to submit attestation: insufficient funds"
- DVN address needs ETH on Ethereum VTE for gas
- Fund address: `cast send $DVN1_ADDRESS --value 0.1ether --rpc-url $ETHEREUM_RPC_VTE --private-key ...`

### "Lock already processed"
- Relayer tracks processed lockIds in memory
- Restart relayer to reprocess (for testing)
- Or use different lockIds for each test

## Development

### Adding Logging
```go
import "github.com/ethereum/go-ethereum/log"

log.Info("Message", "key", value)
log.Warn("Warning", "error", err)
log.Error("Error occurred", "error", err)
```

### Testing Signature Generation
```go
signer, _ := dvn.NewEIP712Signer(privateKey, receiverAddr, chainID)
v, r, s, _ := signer.SignLockMessage(lockMsg)
fmt.Printf("Signature: v=%d r=%x s=%x\n", v, r, s)
```

## Security Considerations

1. **Private Key Protection**
   - DVN private key stored in `.env` (gitignored)
   - Never commit private keys to version control
   - Use hardware wallets or key management systems in production

2. **Replay Protection**
   - In-memory duplicate detection (lockId tracking)
   - On-chain replay protection via XRWAReceiver

3. **Signature Validation**
   - EIP-712 domain separator includes chain ID
   - Signatures are chain-specific and cannot be replayed

## Production Deployment

For production use:

1. **Use Secure Key Management**
   - AWS KMS, HashiCorp Vault, or hardware wallets
   - Remove private key from `.env`

2. **Implement Persistent Storage**
   - Track processed lockIds in database
   - Survive relayer restarts

3. **Add Monitoring & Alerts**
   - Prometheus metrics
   - Alerting for failed attestations
   - Health check endpoints

4. **Deploy with Redundancy**
   - Multiple relayer instances
   - M-of-N DVN threshold (requires contract changes)

5. **Use Production RPC Endpoints**
   - Replace Tenderly VTE with mainnet RPCs
   - Configure appropriate gas strategies

## License

MIT
