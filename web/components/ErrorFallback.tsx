'use client';

import { categorizeError, getActionMessage } from '@/lib/errors';
import type { CategorizedError } from '@/lib/errors';

interface ErrorFallbackProps {
  error: Error;
  reset?: () => void;
  /** Optional title override */
  title?: string;
}

/**
 * Icon components for error categories.
 */
function NetworkIcon() {
  return (
    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.14 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0" />
    </svg>
  );
}

function ContractIcon() {
  return (
    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  );
}

function WalletIcon() {
  return (
    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
    </svg>
  );
}

function ConfigIcon() {
  return (
    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}

function UnknownIcon() {
  return (
    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
    </svg>
  );
}

function getCategoryIcon(category: CategorizedError['category']) {
  switch (category) {
    case 'network': return <NetworkIcon />;
    case 'contract': return <ContractIcon />;
    case 'wallet': return <WalletIcon />;
    case 'config': return <ConfigIcon />;
    default: return <UnknownIcon />;
  }
}

function getCategoryColor(category: CategorizedError['category']) {
  switch (category) {
    case 'network': return 'text-yellow-500';
    case 'contract': return 'text-red-500';
    case 'wallet': return 'text-blue-500';
    case 'config': return 'text-purple-500';
    default: return 'text-gray-500';
  }
}

/**
 * Reusable error fallback UI for error boundaries.
 * Categorizes errors and displays appropriate messaging and actions.
 */
export function ErrorFallback({ error, reset, title }: ErrorFallbackProps) {
  const categorized = categorizeError(error);

  const showReset = reset && categorized.retriable;
  const showAction = categorized.category === 'wallet' && categorized.action;

  return (
    <div className="flex min-h-[300px] items-center justify-center p-8">
      <div className="w-full max-w-md rounded-xl border border-neutral-200 bg-white p-6 shadow-lg">
        {/* Icon and title */}
        <div className="mb-4 flex items-center gap-3">
          <div className={`rounded-full bg-neutral-100 p-2 ${getCategoryColor(categorized.category)}`}>
            {getCategoryIcon(categorized.category)}
          </div>
          <h2 className="text-lg font-semibold text-neutral-900">
            {title ?? 'Something went wrong'}
          </h2>
        </div>

        {/* Error message */}
        <p className="mb-6 text-sm text-neutral-600">
          {categorized.userMessage}
        </p>

        {/* Revert reason for contract errors */}
        {categorized.category === 'contract' && categorized.revertReason && (
          <div className="mb-6 rounded-md bg-red-50 p-3">
            <p className="text-xs font-medium text-red-800">
              Reason: {categorized.revertReason}
            </p>
          </div>
        )}

        {/* Action buttons */}
        <div className="flex gap-3">
          {showReset && (
            <button
              type="button"
              onClick={reset}
              className="flex-1 rounded-lg bg-brand-DEFAULT px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-brand-dark"
            >
              Try Again
            </button>
          )}

          {showAction && (
            <button
              type="button"
              onClick={() => {
                // Wallet actions are handled by Dynamic SDK
                // This button provides visual guidance
                if (reset) reset();
              }}
              className="flex-1 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-700"
            >
              {getActionMessage(categorized.action!)}
            </button>
          )}

          {!showReset && !showAction && (
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="flex-1 rounded-lg border border-neutral-300 px-4 py-2.5 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-50"
            >
              Reload Page
            </button>
          )}
        </div>

        {/* Debug info for development */}
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
  );
}
