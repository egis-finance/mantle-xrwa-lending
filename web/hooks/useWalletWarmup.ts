'use client';

/**
 * Keeps Dynamic SDK WAAS session warm to prevent first-transaction timeouts.
 *
 * Cold sessions occur when the embedded wallet is idle for several minutes,
 * causing the first signing attempt to trigger a slow rehydration.
 *
 * Strategy:
 * 1. Warm on focus/visibility events (with debounce)
 * 2. Periodic keep-alive every 3 minutes
 * 3. Pre-warm before transactions via returned warmSession()
 */

import { useCallback, useEffect, useRef } from 'react';
import { useDynamicContext } from '@dynamic-labs/sdk-react-core';
import { isEthereumWallet } from '@dynamic-labs/ethereum';

// 3 minutes between periodic warm-ups (conservative buffer before cold window)
const WARMUP_INTERVAL_MS = 3 * 60 * 1000;
// Minimum 30s between warm-ups to avoid spamming on rapid focus/blur
const WARMUP_DEBOUNCE_MS = 30 * 1000;
// Cooldown after failure to avoid hammering a broken WAAS
const FAILURE_COOLDOWN_MS = 60 * 1000;

export function useWalletWarmup() {
  const { primaryWallet, sdkHasLoaded } = useDynamicContext();
  // All refs to avoid re-renders - isWarming not consumed by UI
  const warmingRef = useRef(false);
  const lastWarmupRef = useRef(0);
  const lastFailureRef = useRef(0);

  const warmSession = useCallback(async () => {
    // Gate: SDK must be loaded and wallet must exist
    if (!sdkHasLoaded || !primaryWallet || !isEthereumWallet(primaryWallet)) return;
    // Ref lock prevents overlapping warm-ups
    if (warmingRef.current) return;
    // Debounce: skip if warmed recently (within 30s)
    const now = Date.now();
    if (now - lastWarmupRef.current < WARMUP_DEBOUNCE_MS) return;
    // Failure cooldown: skip if failed recently (within 60s)
    if (now - lastFailureRef.current < FAILURE_COOLDOWN_MS) return;

    try {
      warmingRef.current = true;
      // getWalletClient() rehydrates the MPC session
      await primaryWallet.getWalletClient();
      lastWarmupRef.current = Date.now();
      if (process.env.NODE_ENV === 'development') {
        console.debug('[WalletWarmup] Session warmed');
      }
    } catch (err) {
      lastFailureRef.current = Date.now();
      if (process.env.NODE_ENV === 'development') {
        console.warn('[WalletWarmup] Failed to warm session:', err);
      }
    } finally {
      warmingRef.current = false;
    }
  }, [primaryWallet, sdkHasLoaded]);

  useEffect(() => {
    // Don't set up listeners until SDK is ready and wallet exists
    if (!sdkHasLoaded || !primaryWallet) return;

    const handleFocus = () => warmSession();

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        warmSession();
      }
    };

    // Periodic keep-alive while visible (3 min intervals)
    const intervalId = setInterval(() => {
      if (document.visibilityState === 'visible') {
        warmSession();
      }
    }, WARMUP_INTERVAL_MS);

    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      clearInterval(intervalId);
    };
  }, [primaryWallet, sdkHasLoaded, warmSession]);

  return { warmSession };
}
