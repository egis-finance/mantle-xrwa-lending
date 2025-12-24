# xRWA Lending Protocol

Cross-chain lending protocol enabling USDY locked on Mantle to serve as collateral for USDC borrowing on Ethereum via Morpho Blue.

## Overview

xRWA (cross-chain Real World Assets) keeps RWAs on their origin chain while issuing attested collateral receipts on the execution chain. Users lock USDY on Mantle, receive non-transferable AcUSDY on Ethereum, and borrow USDC against it.

```
┌─────────────────┐                      ┌─────────────────┐
│     MANTLE      │                      │    ETHEREUM     │
│                 │                      │                 │
│  ┌───────────┐  │    DVN Attestation   │  ┌───────────┐  │
│  │ Collateral│  │ ──────────────────▶  │  │  XRWA     │  │
│  │  Locker   │  │                      │  │ Receiver  │  │
│  └─────┬─────┘  │                      │  └─────┬─────┘  │
│        │        │                      │        │        │
│   Lock USDY     │                      │   Mint AcUSDY   │
│        │        │                      │        │        │
│  ┌─────▼─────┐  │                      │  ┌─────▼─────┐  │
│  │   USDY    │  │                      │  │  Morpho   │  │
│  │  Escrow   │  │                      │  │   Blue    │  │
│  └───────────┘  │                      │  └─────┬─────┘  │
│                 │                      │        │        │
│                 │                      │   Borrow USDC   │
└─────────────────┘                      └─────────────────┘
```

## Components

| Component | Description |
|-----------|-------------|
| **Solidity Contracts** | CollateralLocker (Mantle), AcUSDY, XRWAReceiver, NAVOracle, MorphoAdapter (Ethereum) |
| **Go Relayer** | Monitors lock events, generates EIP-712 signatures, submits cross-chain attestations |
| **Web Frontend** | Next.js app with Dynamic SDK embedded wallets |

## Quick Start

### Prerequisites

- [Foundry](https://book.getfoundry.sh/getting-started/installation)
- Go 1.21+
- Node.js 20+ with pnpm
- Tenderly account (for Virtual TestNets)

### Setup

```bash
# Clone and install dependencies
git clone https://github.com/egis-finance/mantle-xrwa-lending.git
cd mantle-xrwa-lending

# Configure environment
cp .env.example .env
# Edit .env with your Tenderly VTE endpoints and wallet keys

# Install Foundry dependencies
forge install
```

### Build & Test

```bash
# Solidity
forge build
forge test -vv

# Go Relayer
cd relayer
make dev    # fmt → lint → test → build

# Web Frontend
cd web
pnpm install
pnpm run dev
```

### Deploy (Tenderly VTE)

```bash
source .env

# Fund test wallets
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

### Cross-Chain Flow

1. **Lock on Mantle** - User locks USDY in CollateralLocker, emitting a cryptographic commitment
2. **DVN Attestation** - Relayer monitors events, signs EIP-712 message, submits to Ethereum
3. **Mint AcUSDY** - XRWAReceiver verifies signature, mints non-transferable AcUSDY
4. **Borrow USDC** - User supplies AcUSDY to Morpho Blue and borrows USDC

### Key Invariants

- Each `lockId` is unique and consumed exactly once on both chains
- AcUSDY is non-transferable except to/from whitelisted addresses (Morpho)
- DVN signatures are bound to specific chains via EIP-712 domain separators

## Project Structure

```
├── contracts/
│   ├── mantle/          # CollateralLocker
│   └── ethereum/        # AcUSDY, XRWAReceiver, NAVOracle, MorphoAdapter
├── relayer/             # Go DVN relayer service
├── web/                 # Next.js frontend
├── script/              # Foundry deployment scripts
└── test/                # Unit, fuzz, and integration tests
```

## Documentation

- [Relayer Architecture](relayer/CLAUDE.md) - Event flow, EIP-712 signing, debugging
- [Web Frontend](web/CLAUDE.md) - Dynamic SDK integration, SWR data layer
- [Development Guide](CLAUDE.md) - Commands, patterns, environment setup

## Environment

The root `.env` file is the single source of truth. Web frontend variables are auto-generated:

```bash
./scripts/generate-web-env.sh
```

See `.env.example` for all required variables.

## Testing

Tests run against real mainnet contracts via Tenderly VTE (Virtual TestNet):

- Mantle USDY: `0x5bE26527e817998A7206475496fDE1E68957c5A6`
- Ethereum Morpho Blue: `0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb`
- Ethereum USDC: `0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48`

```bash
# Solidity tests
forge test -vv

# Fuzz tests (256 runs)
forge test --match-path test/fuzz/*.sol -vv

# Relayer tests
cd relayer && go test ./... -v -race

# Frontend tests
cd web && pnpm test
```

## License

Business Source License 1.1 - See [LICENSE](LICENSE) for details.

Copyright (c) 2025 Egis Finance
