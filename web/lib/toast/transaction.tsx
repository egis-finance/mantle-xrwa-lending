/**
 * Transaction toast utilities for DeFi operations.
 * Provides promise-based toasts and cross-chain progress tracking.
 */

import { toast } from 'sonner';
import { CHAIN_NAMES, TOAST_DURATIONS } from './config';
import { categorizeError } from '../errors';

interface TransactionToastOptions {
  /** Chain ID for explorer link */
  chainId: number;
  /** Action description (e.g., "Lock USDY") */
  action: string;
  /** Explorer URL template (uses {hash} placeholder) */
  explorerUrl?: string;
}

/**
 * Wrap a transaction promise with loading/success/error toasts.
 * Uses Sonner's promise() API for automatic state management.
 *
 * @example
 * await withTransactionToast(
 *   signOnMantle({ address, abi, functionName, args }),
 *   { chainId: MANTLE_CHAIN_ID, action: 'Lock USDY' }
 * );
 */
export async function withTransactionToast<T>(
  promise: Promise<T>,
  options: TransactionToastOptions
): Promise<T> {
  const chainName = CHAIN_NAMES[options.chainId] ?? `Chain ${options.chainId}`;

  // Show the toast and wait for the promise
  toast.promise(promise, {
    loading: `${options.action} on ${chainName}...`,
    success: (data) => {
      // If data has a hash property, show explorer link
      const hash = (data as { hash?: string })?.hash;
      if (hash && options.explorerUrl) {
        const url = options.explorerUrl.replace('{hash}', hash);
        return (
          <span>
            {options.action} successful!{' '}
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="underline"
            >
              View transaction
            </a>
          </span>
        );
      }
      return `${options.action} successful!`;
    },
    error: (error) => {
      const categorized = categorizeError(error instanceof Error ? error : new Error(String(error)));
      return categorized.userMessage;
    },
  });

  // Return the original promise result
  return promise;
}

/**
 * Show a simple success toast.
 */
export function showSuccess(message: string): void {
  toast.success(message, { duration: TOAST_DURATIONS.SHORT });
}

/**
 * Show a simple error toast.
 */
export function showError(message: string, persistent = false): void {
  toast.error(message, {
    duration: persistent ? TOAST_DURATIONS.PERSISTENT : TOAST_DURATIONS.LONG,
  });
}

/**
 * Show a categorized error toast with appropriate styling.
 */
export function showCategorizedError(error: Error): void {
  const categorized = categorizeError(error);
  toast.error(categorized.userMessage, {
    duration: categorized.retriable ? TOAST_DURATIONS.LONG : TOAST_DURATIONS.PERSISTENT,
  });
}

/**
 * Show a warning toast.
 */
export function showWarning(message: string): void {
  toast.warning(message, { duration: TOAST_DURATIONS.LONG });
}

/**
 * Show an info toast.
 */
export function showInfo(message: string): void {
  toast.info(message, { duration: TOAST_DURATIONS.MEDIUM });
}

// Cross-chain flow types

export type CrossChainStepStatus = 'waiting' | 'pending' | 'success' | 'error';

export interface CrossChainStep {
  chain: string;
  action: string;
  status: CrossChainStepStatus;
}

interface CrossChainToastHandle {
  /** Update a specific step's status */
  updateStep: (index: number, status: CrossChainStepStatus) => void;
  /** Mark all remaining steps as error */
  fail: (message: string) => void;
  /** Dismiss the toast */
  dismiss: () => void;
  /** Toast ID for external management */
  id: string | number;
}

/**
 * Show a multi-step cross-chain progress toast.
 * Returns a handle to update step statuses as operations complete.
 *
 * @example
 * const { updateStep, dismiss } = showCrossChainToast([
 *   { chain: 'Mantle', action: 'Lock USDY', status: 'pending' },
 *   { chain: 'Ethereum', action: 'Mint AcUSDY', status: 'waiting' },
 * ]);
 *
 * // After lock completes
 * updateStep(0, 'success');
 * updateStep(1, 'pending');
 *
 * // After mint completes
 * updateStep(1, 'success');
 * dismiss();
 */
export function showCrossChainToast(steps: CrossChainStep[]): CrossChainToastHandle {
  let currentSteps = [...steps];

  const renderSteps = () => (
    <div className="space-y-2">
      {currentSteps.map((step, i) => (
        <div key={i} className="flex items-center gap-2 text-sm">
          <StepIcon status={step.status} />
          <span className="font-medium">{step.chain}</span>
          <span className="text-neutral-500">{step.action}</span>
        </div>
      ))}
    </div>
  );

  const id = toast(renderSteps(), {
    duration: TOAST_DURATIONS.PERSISTENT,
  });

  const updateStep = (index: number, status: CrossChainStepStatus) => {
    currentSteps = currentSteps.map((step, i) =>
      i === index ? { ...step, status } : step
    );
    toast(renderSteps(), { id });
  };

  const fail = (message: string) => {
    toast.error(message, { id });
  };

  const dismiss = () => {
    toast.dismiss(id);
  };

  return { updateStep, fail, dismiss, id };
}

/**
 * Step status icon component.
 */
function StepIcon({ status }: { status: CrossChainStepStatus }) {
  switch (status) {
    case 'waiting':
      return <span className="h-4 w-4 rounded-full border-2 border-neutral-300" />;
    case 'pending':
      return (
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
      );
    case 'success':
      return (
        <span className="flex h-4 w-4 items-center justify-center rounded-full bg-green-500 text-white">
          <svg className="h-2.5 w-2.5" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
          </svg>
        </span>
      );
    case 'error':
      return (
        <span className="flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-white">
          <svg className="h-2.5 w-2.5" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
          </svg>
        </span>
      );
  }
}
