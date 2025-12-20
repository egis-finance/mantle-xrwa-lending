# Web Architecture

This document describes the web frontend architecture, focusing on wallet integration, data layer design, and cross-chain patterns.

## Stack Overview

| Layer | Technology | Purpose |
|-------|------------|---------|
| Framework | Next.js 16 (App Router) | Routing + static export (`output: 'export'`); no runtime server |
| Wallet | Dynamic SDK ^4.47.0 | Embedded wallet only |
| Data | SWR | Contract reads, caching, revalidation |
| Blockchain | viem | Contract encoding, public clients |
| Styling | Tailwind CSS 4 | Design system |

## Design Rationale

### Embedded Wallet Only

External wallets (MetaMask, WalletConnect) are disabled. All users interact via Dynamic's embedded wallet, which provides:

- Deterministic address derivation from email/social login
- No browser extension dependencies
- Simplified UX for non-crypto-native users
- Consistent signing experience across devices

The `walletsFilter` in providers.tsx enforces this by filtering out all wallet connectors except those with `isEmbeddedWallet === true`.

### SWR Over React Query

SWR was chosen over React Query (wagmi's default) for:

- Simpler mental model (stale-while-revalidate)
- Lighter bundle size
- Direct cache key control for cross-chain deduplication

All SWR-based contract read hooks return a consistent shape via the `toReadResult()` adapter:

```typescript
interface ReadResult<T> {
  data: T | undefined;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  refetch: () => void;
  isRefetching: boolean;
}
```

This normalization ensures callsites and tests don't special-case SWR internals.

Reads are also gated behind `useSDKReady()` (mounted + `sdkHasLoaded`). At the SWR layer this is implemented by setting the SWR key to `null` until ready, and passing the combined enabled state into `toReadResult(...)`.

### Cross-Chain Data Pattern

The protocol spans two chains:

| Chain | Role | Key Contracts |
|-------|------|---------------|
| Mantle | Collateral source | CollateralLocker (lock USDY) |
| Ethereum | Execution | Morpho Blue (borrow USDC), AcUSDY, NAVOracle |

Data hooks are chain-aware. The `lib/swr/chains.ts` module maintains cached public clients per chain, and hooks like `useMultiChainRead` accept a `chainId` parameter to route reads to the correct RPC.

For atomic cross-chain queries (e.g., TVL peg verification), `useCrossChainRead` fetches from both chains in parallel and returns combined results.

## Environment Modes

The `NEXT_PUBLIC_USE_MAINNET` flag controls which networks and RPCs are active:

| Mode | Mantle Chain ID | Ethereum Chain ID | RPC Source |
|------|-----------------|-------------------|------------|
| VTE (default) | 15000 | 10001 | Tenderly Virtual TestNet |
| Mainnet | 5000 | 1 | Tenderly Gateway |

The `lib/env.ts` module validates required environment variables at build time, with a Jest bypass for tests.

The root `.env` is the source of truth. Run `./scripts/generate-web-env.sh` to generate `web/.env.local` (the file Next.js loads).

## Module Structure

```
web/
├── app/
│   ├── providers.tsx     # Dynamic + SWR provider tree
│   └── layout.tsx        # Root layout, fonts
├── lib/
│   ├── env.ts            # Environment validation
│   ├── dynamic/
│   │   ├── chains.ts     # EvmNetwork definitions, chain IDs
│   │   ├── embedded.ts   # Embedded wallet setup helper
│   │   └── index.ts      # Re-exports with 'use client'
│   ├── swr/
│   │   ├── chains.ts     # Public client factory
│   │   ├── config.ts     # Refresh intervals
│   │   ├── utils.ts      # toReadResult adapter
│   │   ├── invalidation.ts           # Post-transaction cache clearing
│   │   ├── useMultiChainRead.ts      # Single contract read
│   │   ├── useMultiChainBatchRead.ts # Multicall batch
│   │   └── useCrossChainRead.ts      # Parallel cross-chain
│   └── contracts/
│       ├── index.ts      # Contract addresses + chain IDs
│       └── abis/         # Contract ABIs
└── hooks/
    ├── useDynamicWallet.ts    # Primary wallet hook
    ├── useChainAbstracted.ts  # Cross-chain write operations
    ├── useMounted.ts          # Hydration safety
    ├── useSDKReady.ts         # Mounted + Dynamic SDK loaded gate for reads
    ├── useLockedUSDY.ts       # Mantle collateral read
    ├── useMorphoCollateral.ts # Ethereum collateral read
    └── ...                    # Domain-specific hooks
```

## Provider Configuration

Dynamic SDK settings (providers.tsx) are split between client code and the Dynamic Dashboard:

**Client-side (code)**:
- `environmentId`: Links to Dynamic project
- `walletConnectors`: Ethereum connector only
- `walletsFilter`: Restricts to embedded wallets
- `overrides.evmNetworks`: Merges env-specific chains, filters allowed chain IDs

**Dashboard-side (app.dynamic.xyz)**:
- `embeddedWallets.createOnLogin`: Auto-create wallet on first login
- `initialAuthenticationMode`: Connect-only vs full auth flow
- Enabled social login providers
- Wallet UI customization

This split exists because Dynamic SDK removed some client settings in favor of dashboard configuration.

### CSS Injection

Dynamic SDK v4.50+ injects styles via shadow DOM. No CSS import is required in layout.tsx. This is intentional and differs from earlier SDK versions.

## Wallet Hooks

### useDynamicWallet

Primary hook replacing wagmi's `useAccount`. Returns:

- `address`, `isConnected`, `isReady`
- `chainId` (normalized to number)
- `publicClient`, `walletClient` (fetched asynchronously)
- `connect()`, `switchNetwork()`

Chain ID normalization handles Dynamic's `getNetwork()` returning `string | number`.

### useChainAbstracted

Encapsulates cross-chain write operations with automatic chain switching:

- `readFromMantle()` / `readFromEthereum()`: Read via public clients (no wallet)
- `signOnMantle()` / `executeOnEthereum()`: Write with silent chain switching

Before each write, the hook checks the wallet's current network and switches if necessary. Network comparison normalizes string chain IDs to avoid false mismatches.

## Collateral Hooks

The protocol uses a dual collateral pattern:

| Hook | Chain | Contract | Purpose |
|------|-------|----------|---------|
| `useLockedUSDY` | Mantle | CollateralLocker | USDY locked as collateral |
| `useMorphoCollateral` | Ethereum | Morpho | AcUSDY deposited in lending position |

These represent different states:
- Locked USDY exists on Mantle and backs AcUSDY issuance
- Morpho collateral is AcUSDY actually supplied to the lending market

Both hooks follow the same pattern: check config, call `useMultiChainRead`, transform result.

## Cache Key Strategy

SWR cache keys are structured as:

```
['contract', chainId, normalizedAddress, functionName, serializedArgs]
```

Key hygiene rules:
- Addresses lowercased via `normalizeAddress()`
- All hex strings (including bytes32 market IDs) lowercased in `serializeArgs()`
- BigInts serialized as `bigint:${value}`

This prevents duplicate fetches for case-variant addresses.

## Refresh Intervals

Defined in `lib/swr/config.ts`:

| Data Type | Interval | Rationale |
|-----------|----------|-----------|
| Oracle price | 10s | Price-sensitive operations |
| User position | 15s | Balance/debt changes |
| Protocol TVL | 30s | Aggregate metrics |
| System params | 60s | Rarely changing config |

Hooks override intervals as needed. System params also disable `revalidateOnFocus` since they change infrequently.
