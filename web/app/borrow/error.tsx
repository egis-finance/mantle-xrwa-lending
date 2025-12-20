'use client';

import { useEffect } from 'react';
import { ErrorFallback } from '@/components/ErrorFallback';

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

/**
 * Error boundary for the Borrow page.
 * Provides context-specific error messaging for borrowing operations.
 */
export default function BorrowError({ error, reset }: ErrorProps) {
  useEffect(() => {
    console.error('Borrow page error:', error);
  }, [error]);

  return (
    <ErrorFallback
      error={error}
      reset={reset}
      title="Borrowing Unavailable"
    />
  );
}
