'use client';

import { useSyncExternalStore } from 'react';

/**
 * SSR hydration safety hook.
 * Returns false during SSR and initial hydration, true after client mount.
 * Use to gate rendering of wallet-dependent UI that would cause hydration mismatches.
 *
 * @example
 * const mounted = useMounted();
 * if (!mounted) return <Skeleton />;
 * return <WalletAddress address={address} />;
 */
export function useMounted(): boolean {
  return useSyncExternalStore(
    // No external store; React will re-check snapshot after hydration.
    () => () => {},
    () => true,
    () => false
  );
}
