'use client';

import { useEffect } from 'react';
import { ErrorFallback } from '@/components/ErrorFallback';

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

/**
 * Root error boundary for the application.
 * Catches unhandled errors from all routes and displays a recovery UI.
 *
 * Note: This doesn't catch errors in the root layout.
 * For layout errors, use global-error.tsx.
 */
export default function Error({ error, reset }: ErrorProps) {
  useEffect(() => {
    // Log error to console for debugging
    console.error('Unhandled error:', error);

    // TODO: Send to error monitoring service (e.g., Sentry)
    // if (typeof window !== 'undefined' && window.Sentry) {
    //   window.Sentry.captureException(error);
    // }
  }, [error]);

  return <ErrorFallback error={error} reset={reset} />;
}
