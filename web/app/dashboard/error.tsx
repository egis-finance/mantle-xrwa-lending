'use client';

import { useEffect } from 'react';
import { ErrorFallback } from '@/components/ErrorFallback';

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

/**
 * Error boundary for the Dashboard page.
 * Provides context-specific error messaging for position monitoring.
 */
export default function DashboardError({ error, reset }: ErrorProps) {
  useEffect(() => {
    console.error('Dashboard error:', error);
  }, [error]);

  return (
    <ErrorFallback
      error={error}
      reset={reset}
      title="Dashboard Unavailable"
    />
  );
}
