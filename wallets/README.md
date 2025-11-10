# Test Wallets for Tenderly VTE

This directory contains test wallet files for Tenderly Virtual TestNet (VTE) development.

## Security Notice

**CRITICAL: These wallets are for Tenderly VTE testing ONLY. NEVER use these wallets on mainnet or public testnets.**

The wallet JSON files in this directory contain private keys in plaintext and are gitignored to prevent accidental exposure.

## Generating Wallets

Create a new test wallet using Foundry's `cast` tool:

```bash
cast wallet new --json > wallets/<name>.json
```

Example for creating the required wallets:

```bash
cast wallet new --json > wallets/admin.json
cast wallet new --json > wallets/borrower.json
cast wallet new --json > wallets/dvn1.json
cast wallet new --json > wallets/dvn2.json
cast wallet new --json > wallets/dvn3.json
cast wallet new --json > wallets/lender.json
```

## Extracting Keys to .env

After generating wallets, extract the addresses and private keys to your `.env` file:

```bash
# Example for borrower wallet
cat wallets/borrower.json
# Copy the address and private_key values to .env as:
# BORROWER_ADDRESS=0x...
# BORROWER_PRIVATE_KEY=0x...
```

## Wallet Roles

This project uses 5 wallets with distinct roles:

1. **Admin** - Deployer, contract admin, treasury operations
2. **Borrower** - Tests locking USDY collateral on Mantle
3. **DVN1-3** - Decentralized Verifier Network signers for cross-chain attestation
4. **Lender** - Supplies USDC to Morpho Blue markets

## Funding Wallets on Tenderly VTE

Use the funding script to add test MNT and USDY tokens:

```bash
source .env
forge script script/FundWallets.s.sol:FundWallets \
  --rpc-url "$MANTLE_RPC_VTE" --broadcast --legacy
```

## Why Wallets are Gitignored

Private keys should never be committed to git, even for test wallets. While Tenderly VTE wallets have no real-world value, gitignoring them:

- Prevents accidental mainnet use of exposed keys
- Follows security best practices
- Avoids automated key scraping if repository becomes public
- Protects against future mistakes where test keys get funded on real networks
