# Dynamic Wallet SDK Integration Reference

This document describes how the `web/` frontend integrates Dynamic Wallet SDK with viem and the SWR read layer.

Scope:
- Embedded wallets only (no external wallets)
- Next.js static export (`output: 'export'`) (no runtime API routes)
- Contract reads use viem `PublicClient` + SWR
- Contract writes use viem `WalletClient` obtained from Dynamic

## Environment and configuration

The repository root `.env` is the source of truth. Generate `web/.env.local` with:

```bash
cp .env.example .env
# edit .env with your values
./scripts/generate-web-env.sh
```

Next.js loads `web/.env.local` and `web/lib/env.ts` validates required `NEXT_PUBLIC_*` vars at build time (Jest bypasses validation via `NODE_ENV=test`).

### Required variables

Always:
- `DYNAMIC_ENVIRONMENT_ID` (becomes `NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID`)

Mode selector:
- `USE_MAINNET` (becomes `NEXT_PUBLIC_USE_MAINNET`)
  - `true`: mainnet mode (Mantle 5000, Ethereum 1)
  - unset/false: VTE mode (Mantle 15000, Ethereum 10001)

VTE mode requires:
- `MANTLE_RPC_VTE`, `ETHEREUM_RPC_VTE`
- `MANTLE_VTE_EXPLORER`, `ETHEREUM_VTE_EXPLORER`

Mainnet mode requires:
- `MANTLE_RPC`, `ETHEREUM_RPC`
- explorers are hardcoded (`https://mantlescan.xyz`, `https://etherscan.io`)

Contract bindings (used by `web/lib/contracts/index.ts`) are sourced from env and default to `0x0` in dev/test:
- `MANTLE_LOCKER`
- `ETH_ACUSDY`, `ETH_ORACLE`, `ETH_ADAPTER`
- `ETH_MORPHO`, `ETH_USDC`, `ETH_IRM`
- `MANTLE_USDY` (defaults to the mainnet USDY address if unset)

Optional market overrides:
- `MORPHO_MARKET_ID`
- `MARKET_LLTV`

## Provider setup

`web/app/providers.tsx` wraps the app with:
- `DynamicContextProvider` (Dynamic SDK)
- `SWRProvider` (global SWR defaults)

Key behaviors:
- `walletsFilter` restricts wallet options to embedded wallets only.
- `overrides.evmNetworks` merges `supportedNetworks` (from `web/lib/dynamic/chains.ts`) with dashboard networks and filters to the two allowed chain IDs (Mantle + Ethereum for the active mode).

CSS: Dynamic SDK v4.50+ injects widget styles via shadow DOM, so there is no standalone CSS import for the widget.

## Wallet API

Use `web/hooks/useDynamicWallet.ts` as the primary adapter around Dynamic:
- Normalizes `getNetwork()` return type (`string | number`) to a `number` chain ID.
- Exposes `publicClient` and `walletClient` (viem) once they have been fetched.

Connection UX:
- `connect()` triggers Dynamic's auth flow via `setShowAuthFlow(true)`.

## Read layer (SWR)

The canonical read hooks live in `web/lib/swr/`:
- `useMultiChainRead` (single read on one chain)
- `useMultiChainBatchRead` (multicall batch on one chain)
- `useCrossChainRead` (parallel reads across Mantle + Ethereum)

All return `ReadResult<T>`:

`{ data, isLoading, isError, error, refetch, isRefetching }`

### SDK readiness gating

Reads are gated behind `useSDKReady()`:
- `useMounted()` ensures hydration is complete.
- `sdkHasLoaded` ensures Dynamic SDK has finished loading.

At the SWR layer this is implemented by using a `null` key until ready, so no RPC is issued during initial page load.

### Cache invalidation after writes

Use helpers from `web/lib/swr/invalidation.ts`:
- `invalidateUserReads(address)`
- `invalidateContractRead(chainId, address, functionName)`
- `invalidateBatchReads(chainId)`
- `invalidateCrossChainReads()`

## Write layer (cross-chain)

Use `web/hooks/useChainAbstracted.ts` for writes that must happen on a specific chain:
- `signOnMantle(...)`: switches wallet to Mantle if needed, then writes via `walletClient.writeContract(...)`
- `executeOnEthereum(...)`: switches wallet to Ethereum if needed, then writes
- `waitForTransaction(chainId, hash)`: confirms via the chain's `PublicClient`

Reads that do not require a wallet can use:
- `readFromMantle(...)`
- `readFromEthereum(...)`

## Adding new contract reads

1. Add env var binding in `web/lib/contracts/index.ts` (address + chainId).
2. Implement a hook using the SWR read layer (`useMultiChainRead` / `useMultiChainBatchRead` / `useCrossChainRead`).
3. Disable the read when required config is missing (e.g. address is `0x0`, args not available).

## Testing

- `npm --prefix web test` runs Jest with `NODE_ENV=test`, which bypasses env validation.
- Some integration tests are gated behind `RUN_INTEGRATION_TESTS=true`.
