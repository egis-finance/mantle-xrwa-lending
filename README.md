# Egis Finance

[![Live Demo](https://img.shields.io/badge/Live_Demo-app.egis.finance-blue?style=for-the-badge)](https://app.egis.finance)
[![Docs](https://img.shields.io/badge/Docs-GitBook-green?style=for-the-badge)](https://egis-finance.gitbook.io/egis-finance-docs)

**Unlock RWA Liquidity Without Bridging**

Egis Finance enables USDY holders on Mantle to borrow USDC on Ethereum without moving tokens cross-chain. By bridging cryptographic proofs instead of assets, we eliminate custody risk and regulatory friction while preserving the security guarantees of the underlying RWA.

## Hackathon Submission

| Resource | Link |
|----------|------|
| One-Pager Pitch | [GitBook](https://egis-finance.gitbook.io/egis-finance-docs/mantle-hackathon) |
| Team | [GitBook](https://egis-finance.gitbook.io/egis-finance-docs/mantle-hackathon/team?fallback=true) |
| Compliance Declaration | [GitBook](https://egis-finance.gitbook.io/egis-finance-docs/mantle-hackathon/team) |
| Live Demo | [app.egis.finance](https://app.egis.finance) |

## How It Works

```
1. Lock USDY       2. DVN Attestation      3. Receive AcUSDY      4. Borrow USDC
   (Mantle)           (Cross-chain)           (Ethereum)            (Morpho Blue)
      |                    |                      |                      |
      v                    v                      v                      v
  +---------+         +---------+           +---------+           +---------+
  | Escrow  |  --->   |  Sign   |   --->    |  Mint   |   --->    |  Loan   |
  | (Yours) |         | (DVN)   |           |  1:1    |           | 86% LTV |
  +---------+         +---------+           +---------+           +---------+
```

1. **Lock USDY** in our Mantle escrow (your keys, your custody)
2. **DVN network** attests the lock cryptographically
3. **Receive AcUSDY** on Ethereum (non-transferable 1:1 receipt)
4. **Borrow USDC** against it via Morpho Blue (86% LLTV, competitive rates)

## The Innovation

Traditional bridges move assets (custody risk). Wrapped tokens re-issue assets (compliance overhead). **Egis bridges only the proof that assets are locked.**

This implements the academic xRWA concept: a three-layer model for cross-chain RWA interoperability where authentication flows while liquidity remains on the issuance chain.

### Frictionless Cross-Chain UX

- **Social login onboarding**: Dynamic SDK embedded wallets let users sign in with Google, Apple, or email
- **Invisible chain complexity**: Lock on Mantle and borrow on Ethereum through a unified interface
- **Testnet/Mainnet parity**: Configuration-driven deployment supports Tenderly VTEs and mainnet

## Quick Start for Developers

### Prerequisites

- [Foundry](https://book.getfoundry.sh/getting-started/installation) (Solidity)
- Go 1.21+ (relayer)
- Node.js 18+ and pnpm (web frontend)

### Clone and Setup

```bash
git clone https://github.com/egis-finance/mantle-xrwa-lending.git
cd mantle-xrwa-lending
cp .env.example .env
# Edit .env with your configuration
```

### Build and Test

```bash
# Build all contracts
make build

# Run all Solidity tests
make test

# Run Go relayer tests
cd relayer && go test ./... -v -race

# Run web tests
cd web && pnpm test
```

### Web Frontend

```bash
# Generate web environment from root .env
./scripts/generate-web-env.sh

cd web
pnpm install
pnpm run dev  # http://localhost:3000
```

### Deploy to Tenderly VTEs

```bash
source .env

# Fund test wallets on Mantle VTE
forge script script/FundWallets.s.sol:FundWallets \
  --rpc-url "$MANTLE_RPC_VTE" --broadcast --legacy

# Deploy Mantle contracts
forge script script/DeployMantle.s.sol:DeployMantle \
  --rpc-url "$MANTLE_RPC_VTE" --broadcast --legacy

# Deploy Ethereum contracts
forge script script/DeployEthereum.s.sol:DeployEthereum \
  --rpc-url "$ETHEREUM_RPC_VTE" --broadcast --legacy

# Configure cross-chain allowlists
forge script script/ConfigureXRWA.s.sol:ConfigureXRWA \
  --rpc-url "$ETHEREUM_RPC_VTE" --broadcast --legacy
```

## Architecture

```
Mantle                          Ethereum
+------------------+            +------------------+
| CollateralLocker | ---------> | XRWAReceiver     |
|   (Lock USDY)    |   DVN      |   (Verify sigs)  |
+------------------+   Relay    +------------------+
                                        |
                                        v
                                +------------------+
                                | AcUSDY (Receipt) |
                                +------------------+
                                        |
                                        v
                                +------------------+
                                | MorphoAdapter    |
                                |   (Borrow USDC)  |
                                +------------------+
```

**Smart Contracts:**
- `CollateralLocker` (Mantle): Secure USDY escrow with unique lock IDs and replay protection
- `AcUSDY` (Ethereum): Non-transferable receipt representing attested USDY collateral
- `XRWAReceiver`: EIP-712 DVN signature verifier with anti-replay validation
- `NAVOracle`: Morpho-compatible price feed with 2% safety haircut
- `MorphoAdapter`: Unified interface for supply/borrow/repay against Morpho Blue

**Services:**
- Go Relayer: Event-driven DVN attestation bridge with fault tolerance
- Price Updater: Automated USDY price feed for Morpho Blue
- Reconciliation Tool: Orphan lock detection and auto-unlock

## Test Coverage

| Component | Tests | Details |
|-----------|-------|---------|
| Solidity | 61 | Unit, fuzz, and integration tests |
| Go | 30+ | With race detection |
| Web | 196 | Across 17 test suites |

E2E verified on Tenderly Virtual TestNets with real USDY and Morpho Blue contracts.

## Tech Stack

- **Contracts**: Solidity 0.8.30 (Foundry, Paris EVM for Mantle compatibility)
- **Relayer**: Go 1.21+ with zap logging and atomic persistence
- **Frontend**: Next.js 16, Dynamic SDK 4.51, Tailwind CSS 4, SWR, viem
- **Testing**: Tenderly Virtual TestNets (mainnet-synced forks)

## Why Mantle

- **Native USDY integration** via Ondo Finance partnership
- **EVM compatibility** enables standard Solidity patterns
- **Tenderly synced mainnets** for zero-cost, mainnet-realistic testing
- **Fast finality** reduces attestation latency

## Market Opportunity

- RWA market: $25B today, projected $2T by 2030
- Morpho Blue: $13B TVL, 260% YoY growth
- No existing solution for cross-chain RWA collateralization without bridging

## License

MIT
