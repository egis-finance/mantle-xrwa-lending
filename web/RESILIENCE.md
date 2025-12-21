# Web Frontend Resilience - Implementation Documentation

This documentation covers all resilience improvements implemented and next steps.

---

## Summary

Four resilience layers implemented for the DeFi frontend:

| Layer | Status | Purpose |
|-------|--------|---------|
| Error Categorization | Complete | Intelligent error handling with user-friendly messages |
| Connection State | Complete | RPC health visibility in Navbar |
| Error Boundaries | Complete | Graceful crash recovery per route |
| Toast System | Complete | Transaction feedback notifications |
| Toast Integration | Next | Wire toasts to actual transactions |

---

## Completed Changes

### New Files Created

```
lib/errors/
  types.ts              # CategorizedError tagged union, RetryConfig
  messages.ts           # User-friendly error messages, revert mappings
  viem-mapper.ts        # Viem error detection via BaseError.walk()
  categorize.ts         # categorizeError(), isRetriableError(), getRetryDelay()
  index.ts              # Re-exports
  __tests__/
    categorize.test.ts  # Unit tests for error categorization

lib/connection/
  types.ts              # ConnectionStatus, ChainHealth interfaces
  ConnectionContext.tsx # ConnectionProvider, useConnectionState hook
  index.ts              # Re-exports

lib/toast/
  config.ts             # TOAST_CONFIG, TOAST_DURATIONS, CHAIN_NAMES
  transaction.tsx       # withTransactionToast, showCrossChainToast
  index.ts              # Re-exports

hooks/
  useRPCHealth.ts       # SWR-based eth_blockNumber polling

components/
  ConnectionIndicator.tsx  # Status dot + expandable panel
  ErrorFallback.tsx        # Shared error UI component

app/
  error.tsx             # Root error boundary
  global-error.tsx      # Layout-level error boundary
  borrow/error.tsx      # Borrow route error boundary
  earn/error.tsx        # Earn route error boundary
  dashboard/error.tsx   # Dashboard route error boundary

__mocks__/
  connection.tsx        # Test mock for lib/connection
```

### Modified Files

```
app/providers.tsx           # Added ConnectionProvider, Toaster
components/Navbar.tsx       # Added ConnectionIndicator
components/Navbar.test.tsx  # Added connection mock
lib/swr/SWRProvider.tsx     # Categorized retry logic
lib/swr/utils.ts            # Added categorizedError to ReadResult
lib/swr/index.ts            # Updated exports
hooks/useOraclePrice.ts     # Added categorizedError field
package.json                # Added sonner dependency
```

---

## Architecture Details

### 1. Error Categorization (`lib/errors/`)

**Tagged Union Design**:
```typescript
type CategorizedError =
  | { category: 'network'; subcategory: NetworkSubcategory; retriable: true; ... }
  | { category: 'contract'; subcategory: ContractSubcategory; retriable: false; ... }
  | { category: 'wallet'; subcategory: WalletSubcategory; retriable: false; ... }
  | { category: 'config'; subcategory: ConfigSubcategory; retriable: false; ... }
  | { category: 'unknown'; retriable: true; ... };
```

**SWR Integration** (`SWRProvider.tsx`):
- `shouldRetryOnError`: Checks `isRetriableError(categorized)`
- `onErrorRetry`: Exponential backoff with jitter, per-category config
- All `ReadResult<T>` hooks expose `categorizedError` field

**Viem Detection**: Uses `BaseError.walk()` to traverse error chain and detect specific viem error types.

### 2. Connection State (`lib/connection/`)

**Health Polling**:
- `useRPCHealth` polls `eth_blockNumber` every 5 seconds
- Tracks consecutive failures for status transitions
- Timeout: 10 seconds per request

**Visual States**:
| State | Indicator | Condition |
|-------|-----------|-----------|
| Connected | Green solid | Both chains responding |
| Reconnecting | Yellow pulse | 1-2 consecutive failures |
| Disconnected | Red solid | 3+ consecutive failures |

**Navbar Integration**: `ConnectionIndicator` placed right-side, expands on hover to show per-chain status.

### 3. Error Boundaries (`app/*.error.tsx`)

**Next.js App Router Pattern**:
- `error.tsx`: Route-level catch, receives `error` + `reset` props
- `global-error.tsx`: Layout-level fallback (rare, includes own `<html>`)
- All use shared `ErrorFallback` component with category-aware styling

**ErrorFallback Features**:
- Category icon (network/contract/wallet/config/unknown)
- User-friendly message from `categorizeError()`
- Retry button calls `reset()` or `onRetry` callback
- Maintains Navbar visibility

### 4. Toast System (`lib/toast/`)

**Sonner Configuration**:
```typescript
TOAST_CONFIG = {
  position: 'bottom-right',
  duration: 5000,
  closeButton: true,
  richColors: true,
}
```

**Transaction Helpers**:
```typescript
// Promise-based toast with automatic state management
await withTransactionToast(promise, { chainId, action, explorerUrl? })

// Multi-step progress for cross-chain flows
const { updateStep, fail, dismiss } = showCrossChainToast(steps)
```

**Duration Presets**:
- SHORT: 3000ms (success, info)
- MEDIUM: 5000ms (standard)
- LONG: 8000ms (warnings)
- PERSISTENT: Infinity (errors requiring action)

---

## Next Steps: Toast Integration with Transactions

### Goal
Wire `withTransactionToast()` to actual transaction flows in `app/borrow/page.tsx`.

### Files to Create/Modify

**1. `lib/contracts/abis/CollateralLocker.ts`** - Add lock function:
```typescript
{
  name: 'lock',
  type: 'function',
  stateMutability: 'nonpayable',
  inputs: [
    { name: 'amount', type: 'uint256' },
    { name: 'validUntil', type: 'uint64' },
    { name: 'vcHash', type: 'bytes32' },
  ],
  outputs: [{ type: 'bytes32' }],
}
```

**2. `lib/contracts/abis/ERC20.ts`** - NEW minimal ERC20 ABI:
```typescript
export const ERC20Abi = [
  { name: 'approve', type: 'function', stateMutability: 'nonpayable',
    inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }],
    outputs: [{ type: 'bool' }] },
  { name: 'allowance', type: 'function', stateMutability: 'view',
    inputs: [{ name: 'owner', type: 'address' }, { name: 'spender', type: 'address' }],
    outputs: [{ type: 'uint256' }] },
] as const;
```

**3. `lib/toast/config.ts`** - Add explorer URL helper:
```typescript
export function getExplorerTxUrl(chainId: number, hash: string): string {
  const env = getEnv();
  const base = chainId === MANTLE_CHAIN_ID
    ? (env.useMainnet ? env.explorer.mantleMainnet : env.explorer.mantleVte)
    : (env.useMainnet ? env.explorer.ethereumMainnet : env.explorer.ethereumVte);
  return `${base}/tx/${hash}`;
}
```

**4. `app/borrow/page.tsx`** - Add transaction handler:
```typescript
const { signOnMantle, canSign } = useChainAbstracted();
const [isLocking, setIsLocking] = React.useState(false);

const handleLockAndDeposit = async () => {
  setIsLocking(true);
  const amount = parseUnits(lockAmount, 18);
  const validUntil = BigInt(Math.floor(Date.now() / 1000) + 86400 * 30);

  try {
    // Step 1: Approve
    await withTransactionToast(
      signOnMantle({ address: contracts.usdy.address, abi: ERC20Abi,
        functionName: 'approve', args: [contracts.collateralLocker.address, amount] }),
      { chainId: MANTLE_CHAIN_ID, action: 'Approve USDY' }
    );

    // Step 2: Lock
    await withTransactionToast(
      signOnMantle({ address: contracts.collateralLocker.address, abi: CollateralLockerAbi,
        functionName: 'lock', args: [amount, validUntil, zeroHash] }),
      { chainId: MANTLE_CHAIN_ID, action: 'Lock USDY' }
    );

    await invalidateUserReads(borrowerAddress);
    setLockAmount('');
  } catch (error) {
    console.error('Lock failed:', error);
  } finally {
    setIsLocking(false);
  }
};
```

### Implementation Checklist

- [ ] Add `lock` to CollateralLockerAbi
- [ ] Create `lib/contracts/abis/ERC20.ts`
- [ ] Export ERC20Abi from `lib/contracts/index.ts`
- [ ] Add `getExplorerTxUrl()` to `lib/toast/config.ts`
- [ ] Add `handleLockAndDeposit` to borrow page
- [ ] Add `isLocking` state and button loading UI
- [ ] Add `canSign` guard to button disabled state
- [ ] Write tests for explorer URL helper
- [ ] Integration test for transaction flow

---

## Test Coverage

| Module | Tests | Status |
|--------|-------|--------|
| `lib/errors/` | categorize.test.ts | Passing |
| `lib/connection/` | Mock only | Done |
| `lib/toast/` | Not yet | Pending |
| `hooks/useRPCHealth.ts` | Not yet | Pending |
| `components/ErrorFallback.tsx` | Not yet | Pending |

**Overall**: 205 tests passing, build succeeds.

---

## Dependencies Added

```json
{
  "sonner": "^2.x"
}
```

No other new dependencies.
