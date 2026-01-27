'use client';

/**
 * Route segment error boundary - catches errors within route segments.
 * Preserves the root layout, so Tailwind and fonts remain available.
 *
 * Differs from global-error.tsx:
 * - Uses existing layout (no <html>/<body> needed)
 * - More common - catches most component errors
 * - Can access Tailwind classes directly
 */

import { useEffect } from 'react';

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function Error({ error, reset }: ErrorProps) {
  useEffect(() => {
    // Log error to console in development for debugging
    if (process.env.NODE_ENV === 'development') {
      console.error('[RouteError]', error);
    }
  }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center p-8 max-w-md">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Something went wrong</h2>
        <p className="text-sm text-gray-600 mb-6">
          {process.env.NODE_ENV === 'development'
            ? error.message
            : 'An unexpected error occurred. Please try again.'}
        </p>
        <button
          onClick={reset}
          type="button"
          className="px-4 py-2 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 transition-colors font-medium"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
