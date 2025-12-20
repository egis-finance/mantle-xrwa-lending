'use client';

import { SWRConfig } from 'swr';
import type { ReactNode } from 'react';

interface SWRProviderProps {
  children: ReactNode;
}

/**
 * Centralized SWR configuration with sensible defaults for contract reads.
 */
export function SWRProvider({ children }: SWRProviderProps) {
  return (
    <SWRConfig
      value={{
        revalidateOnFocus: true,
        revalidateOnReconnect: true,
        dedupingInterval: 2000,
        errorRetryCount: 3,
        shouldRetryOnError: (error) => {
          // Don't retry contract reverts (they'll always fail)
          const message = error?.message ?? '';
          if (message.includes('revert')) return false;
          if (message.includes('execution reverted')) return false;
          return true;
        },
      }}
    >
      {children}
    </SWRConfig>
  );
}
