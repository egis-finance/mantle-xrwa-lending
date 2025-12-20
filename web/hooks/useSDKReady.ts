'use client';

import { useDynamicContext } from '@dynamic-labs/sdk-react-core';
import { useMounted } from './useMounted';

/**
 * Returns true when both conditions are met:
 * 1. Component is mounted (SSR hydration complete)
 * 2. Dynamic SDK has finished loading
 *
 * Use this to gate contract reads that would otherwise fail during initial page load.
 * SWR hooks should check this before making RPC calls.
 */
export function useSDKReady(): boolean {
  const mounted = useMounted();
  const { sdkHasLoaded } = useDynamicContext();
  return mounted && sdkHasLoaded;
}
