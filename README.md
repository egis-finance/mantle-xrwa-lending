# Egis Finance

[![Live Demo](https://img.shields.io/badge/Live_Demo-app.egis.finance-blue?style=for-the-badge)](https://app.egis.finance)
[![Docs](https://img.shields.io/badge/Docs-GitBook-green?style=for-the-badge)](https://egis-finance.gitbook.io/egis-finance-docs/mantle-hackathon)

**Unlock RWA Liquidity Without Bridging**

Egis Finance enables USDY holders on Mantle to borrow USDC on Ethereum without moving tokens cross-chain. By bridging cryptographic proofs instead of assets, we eliminate custody risk and regulatory friction while preserving the security guarantees of the underlying RWA.

## Hackathon Submission

| Resource | Link |
|----------|------|
| One-Pager Pitch | [GitBook](https://egis-finance.gitbook.io/egis-finance-docs/mantle-hackathon) |
| Team | [GitBook](https://egis-finance.gitbook.io/egis-finance-docs/mantle-hackathon/team?fallback=true) |
| Compliance Declaration | [GitBook](https://egis-finance.gitbook.io/egis-finance-docs/mantle-hackathon/team) |
| Live Demo | [app.egis.finance](https://app.egis.finance) |

## Try It Now

Test the protocol without any setup using our Tenderly Virtual TestNet deployment.

### Login & Fund Your Test Wallet

**Option 1: Pre-funded Demo Accounts** (recommended for quick evaluation)

| Role | Email | PIN |
|------|-------|-----|
| Lender | `lender+dynamic_test@egis.finance` | `107135` |
| Borrower | `borrower+dynamic_test@egis.finance` | `107135` |

> The `+dynamic_test` suffix triggers Dynamic SDK's test mode with a fixed PIN.

**Option 2: Create Your Own Wallet**

1. Go to [app.egis.finance](https://app.egis.finance)
2. Sign in with Google, Apple, or email (creates an embedded wallet)
3. Click **"Fund Wallet"** to receive test tokens

| Chain | Token | Amount |
|-------|-------|--------|
| Mantle | MNT (gas) | 1,000 |
| Mantle | USDY | 1,000,000 |
| Ethereum | ETH (gas) | 10 |
| Ethereum | USDC | 1,000,000 |

<details>
<summary><strong>How does "Fund Wallet" work?</strong></summary>

The Fund Wallet button uses Tenderly VTE's special RPC methods (`tenderly_setBalance`, `tenderly_setErc20Balance`) to directly modify contract storage slots. This is only possible on Virtual TestNets—ephemeral mainnet forks that mirror real contract state but allow arbitrary balance manipulation for testing.
</details>

### Test the Borrower Flow (`/borrow`)

1. **Navigate** to [app.egis.finance/borrow](https://app.egis.finance/borrow)
2. **Lock USDY** on Mantle: Enter amount → Approve → Lock
3. **Wait for attestation** (~30 seconds): DVN relayer signs and submits proof to Ethereum
4. **Receive AcUSDY**: Non-transferable collateral receipt appears on Ethereum
5. **Supply collateral**: Supply AcUSDY to Morpho Blue
6. **Borrow USDC**: Borrow up to 86% of collateral value
7. **Monitor**: View loan health in the dashboard

### Test the Lender Flow (`/earn`)

1. **Navigate** to [app.egis.finance/earn](https://app.egis.finance/earn)
2. **Supply USDC**: Enter amount → Approve → Supply to Morpho Blue
3. **Earn yield**: Interest accrues from borrower repayments
4. **Withdraw**: Withdraw USDC + accrued interest anytime

### Protocol Parameters

| Parameter | Value | Description |
|-----------|-------|-------------|
| LLTV | 86% | Liquidation loan-to-value threshold |
| Oracle Haircut | 2% | Safety discount on collateral valuation |
| Collateral | AcUSDY | Non-transferable attested USDY receipt |
| Loan Token | USDC | Ethereum mainnet USDC |

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

## Developer Setup

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

[Business Source License 1.1](LICENSE) - Converts to Apache 2.0 on 2027-01-15
