'use client';

import { useEffect } from 'react';
import { ErrorFallback } from '@/components/ErrorFallback';

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

/**
 * Error boundary for the Earn page.
 * Provides context-specific error messaging for lending operations.
 */
export default function EarnError({ error, reset }: ErrorProps) {
  useEffect(() => {
    console.error('Earn page error:', error);
  }, [error]);

  return (
    <ErrorFallback
      error={error}
      reset={reset}
      title="Earning Unavailable"
    />
  );
}
