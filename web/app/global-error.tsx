'use client';

/**
 * Global error boundary - catches errors in the root layout itself.
 * Must render its own <html> and <body> tags since the root layout won't render.
 *
 * Provides recovery option:
 * - "Try again" - Attempts React error recovery via reset()
 */

import './globals.css';

interface GlobalErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function GlobalError({ error, reset }: GlobalErrorProps) {
  return (
    <html lang="en">
      <body>
        {/* Inline styles since Tailwind may not be fully loaded in global error state */}
        <div
          style={{
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: '#f9fafb',
            fontFamily: 'system-ui, -apple-system, sans-serif',
          }}
        >
          <div
            style={{
              textAlign: 'center',
              padding: '2rem',
              maxWidth: '28rem',
            }}
          >
            <h2
              style={{
                fontSize: '1.25rem',
                fontWeight: 600,
                color: '#111827',
                marginBottom: '1rem',
              }}
            >
              Something went wrong
            </h2>
            <p
              style={{
                fontSize: '0.875rem',
                color: '#6b7280',
                marginBottom: '1.5rem',
              }}
            >
              {process.env.NODE_ENV === 'development'
                ? error.message
                : 'An unexpected error occurred'}
            </p>
            <button
              onClick={reset}
              type="button"
              style={{
                padding: '0.5rem 1rem',
                backgroundColor: '#10b981',
                color: 'white',
                borderRadius: '0.5rem',
                border: 'none',
                cursor: 'pointer',
                fontSize: '0.875rem',
                fontWeight: 500,
              }}
            >
              Try again
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
