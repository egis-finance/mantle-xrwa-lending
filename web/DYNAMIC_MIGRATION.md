# Dynamic SDK Migration Record

Migration from Wagmi/AppKit/Safe to Dynamic SDK with embedded wallets and an SWR read layer.

**Status**: Complete

## Stack Changes

| Before | After |
|--------|-------|
| Next.js 15 | Next.js 16.0.10 |
| wagmi 3.x | (removed) |
| @reown/appkit | (removed) |
| @safe-global/* | (removed) |
| @tanstack/react-query | SWR 2.2.5 |
| - | @dynamic-labs/sdk-react-core ^4.47.0 |
| - | @dynamic-labs/ethereum ^4.47.0 |

## Architecture Summary

See `ARCHITECTURE.md` for full documentation. Key design decisions:

**Embedded Wallets Only**
- No MetaMask, WalletConnect, or external wallet support
- Users authenticate via Dynamic's embedded wallet (email/social login)
- `walletsFilter` in providers.tsx enforces this restriction

**SWR Read Layer**
- Replaced React Query with SWR for contract reads (polling + explicit cache keys)
- All SWR contract read hooks return a consistent `ReadResult<T>` shape: `{ data, isLoading, isError, error, refetch, isRefetching }`
- `toReadResult()` normalizes raw SWR responses
- Reads are gated behind `useSDKReady()` (mounted + `sdkHasLoaded`) to avoid failed RPC calls during initial page load

**Dual Collateral Pattern**
- `useLockedUSDY`: Mantle-side collateral (CollateralLocker)
- `useMorphoCollateral`: Ethereum-side collateral (Morpho position)

**Environment Modes**
- VTE (default): Mantle 15000, Ethereum 10001 (Tenderly Virtual TestNet)
- Mainnet: Mantle 5000, Ethereum 1 (Tenderly Gateway RPCs)

## Files Created

```
lib/
  env.ts                    # Environment validation with build-time checks
  dynamic/
    chains.ts               # EvmNetwork definitions, chain IDs
    embedded.ts             # Embedded wallet setup helpers
    index.ts                # Client-side re-exports
  swr/
    config.ts               # Refresh intervals (10s-60s by data type)
    chains.ts               # Cached PublicClient factory
    utils.ts                # toReadResult adapter, cache key helpers
    invalidation.ts         # Post-transaction cache clearing
    useMultiChainRead.ts    # Single contract read
    useMultiChainBatchRead.ts # Multicall batch reads
    useCrossChainRead.ts    # Parallel cross-chain queries
    SWRProvider.tsx         # SWRConfig wrapper
    index.ts                # Re-exports

hooks/
  useDynamicWallet.ts       # Primary wallet hook (replaces wagmi useAccount)
  useChainAbstracted.ts     # Silent chain switching for writes
  useMounted.ts             # SSR hydration safety
  useSDKReady.ts            # Mounted + Dynamic SDK loaded gate
  useLockedUSDY.ts          # Mantle collateral read
  useMorphoCollateral.ts    # Ethereum collateral read (renamed from useBorrowerCollateral)
```

## Files Deleted

```
lib/config.ts               # Old wagmi config
lib/config.test.ts
hooks/useSafeAutoConnect.ts
hooks/useSafeAutoConnect.test.ts
components/SafeAutoConnect.tsx
components/SafeAutoConnect.test.tsx
__mocks__/wagmi.ts
__mocks__/@reown/appkit/react.ts
```

## Modified Files

- `app/providers.tsx` - DynamicContextProvider + SWRProvider
- `app/layout.tsx` - Removed cookies handling, added shadow DOM CSS note
- `components/Navbar.tsx` - DynamicWidget replaces w3m-button
- `components/TransactionStatus.tsx` - Removed Safe integration
- `components/UsdyBalance.tsx` - Dynamic wallet hooks
- `lib/contracts/index.ts` - Chain IDs from dynamic/chains
- All domain hooks migrated to SWR (useBorrowerDebt, useOraclePrice, useSystemParams, useTvlPeg, useLoanHealth)

## Environment Variables

Web reads `NEXT_PUBLIC_*` vars from `web/.env.local`, which is generated from the repo root `.env` via `./scripts/generate-web-env.sh`.

**Required (all modes)**:
```
NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID=<from app.dynamic.xyz>
```

**VTE mode** (NEXT_PUBLIC_USE_MAINNET=false, default):
```
NEXT_PUBLIC_MANTLE_RPC_VTE=<tenderly vte rpc>
NEXT_PUBLIC_ETHEREUM_RPC_VTE=<tenderly vte rpc>
NEXT_PUBLIC_MANTLE_VTE_EXPLORER=<tenderly explorer>
NEXT_PUBLIC_ETHEREUM_VTE_EXPLORER=<tenderly explorer>
```

**Mainnet mode** (NEXT_PUBLIC_USE_MAINNET=true):
```
NEXT_PUBLIC_MANTLE_RPC=<tenderly gateway>
NEXT_PUBLIC_ETHEREUM_RPC=<tenderly gateway>
# Explorers hardcoded: mantlescan.xyz, etherscan.io
```

## Testing

- 15 test suites, 150 tests passing
- Build: static export, 5 routes
- Mocks: `__mocks__/dynamic.ts`, `__mocks__/dynamicEthereum.ts`, `__mocks__/swr.ts`

## Dashboard Configuration

Settings managed in Dynamic Dashboard (app.dynamic.xyz) rather than client code:
- `embeddedWallets.createOnLogin`: Auto-create on first auth
- `initialAuthenticationMode`: Connect-only vs full auth
- Social login providers
- External wallet toggles (should be disabled)

## Known Behaviors

**Chain ID Normalization**: Dynamic's `getNetwork()` returns `string | number`. All comparisons normalize to number first.

**CSS Injection**: Dynamic SDK v4.50+ injects styles via shadow DOM. No separate CSS import is required.

**Zero Balance Display**: `UsdyBalance` uses explicit undefined check (`=== undefined`) rather than falsy check to correctly display 0 balances.
