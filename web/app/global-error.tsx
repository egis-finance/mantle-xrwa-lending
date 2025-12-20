'use client';

import { useEffect } from 'react';

interface GlobalErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

/**
 * Global error boundary that catches errors in the root layout.
 * Must render its own <html> and <body> tags since layout failed.
 *
 * This is a last-resort fallback - if this renders, something is very wrong.
 */
export default function GlobalError({ error, reset }: GlobalErrorProps) {
  useEffect(() => {
    console.error('Global layout error:', error);
  }, [error]);

  return (
    <html lang="en">
      <body className="min-h-screen bg-neutral-50">
        <div className="flex min-h-screen items-center justify-center p-8">
          <div className="w-full max-w-md rounded-xl border border-neutral-200 bg-white p-6 shadow-lg">
            <div className="mb-4 flex items-center gap-3">
              <div className="rounded-full bg-red-100 p-2 text-red-500">
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <h2 className="text-lg font-semibold text-neutral-900">
                Application Error
              </h2>
            </div>

            <p className="mb-6 text-sm text-neutral-600">
              A critical error occurred. Please try reloading the page.
            </p>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={reset}
                className="flex-1 rounded-lg bg-brand-DEFAULT px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-brand-dark"
              >
                Try Again
              </button>
              <button
                type="button"
                onClick={() => window.location.href = '/'}
                className="flex-1 rounded-lg border border-neutral-300 px-4 py-2.5 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-50"
              >
                Go Home
              </button>
            </div>

            {process.env.NODE_ENV === 'development' && (
              <details className="mt-4">
                <summary className="cursor-pointer text-xs text-neutral-400 hover:text-neutral-600">
                  Technical Details
                </summary>
                <pre className="mt-2 max-h-32 overflow-auto rounded bg-neutral-100 p-2 text-xs text-neutral-600">
                  {error.stack ?? error.message}
                </pre>
              </details>
            )}
          </div>
        </div>
      </body>
    </html>
  );
}
