'use client';

/**
 * Confirmation modal for admin unlock actions.
 * Displays borrower, amount, lockId and requires explicit confirmation.
 * Includes basic accessibility: focus trap, aria attributes, escape to close.
 */

import React, { useRef, useEffect } from 'react';
import type { Address, Hash } from 'viem';
import { Button } from '@/components/ui/button';
import { AlertCircle, X, Loader2 } from 'lucide-react';

export interface ConfirmUnlockModalProps {
  borrower: Address;
  lockedAmount: string;
  lockId: Hash;
  isLoading: boolean;
  error?: Error | null;
  onConfirm: () => void;
  onClose: () => void;
}

export function ConfirmUnlockModal({
  borrower,
  lockedAmount,
  lockId,
  isLoading,
  error,
  onConfirm,
  onClose,
}: ConfirmUnlockModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (isLoading) {
      // During processing: focus dialog container itself
      modalRef.current?.focus();
    } else {
      // Normal: focus cancel button
      cancelRef.current?.focus();
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isLoading) onClose();

      // During processing: prevent Tab entirely (focus stays on container)
      if (e.key === 'Tab' && isLoading) {
        e.preventDefault();
        return;
      }

      // Normal: trap Tab within focusable elements
      if (e.key === 'Tab' && modalRef.current) {
        const focusable = modalRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length === 0) {
          e.preventDefault();
          return;
        }
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isLoading, onClose]);

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget && !isLoading) {
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 animate-in fade-in duration-200"
      onClick={handleBackdropClick}
    >
      <div
        ref={modalRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        className="bg-white rounded-xl p-6 max-w-md shadow-xl m-4 animate-in zoom-in-95 duration-200 outline-none"
      >
        <div className="flex items-center justify-between mb-4">
          <h3
            id="modal-title"
            className="text-lg font-bold text-amber-700 flex items-center gap-2"
          >
            <AlertCircle className="h-5 w-5" />
            Confirm Unlock
          </h3>
          <button
            onClick={onClose}
            disabled={isLoading}
            className="text-gray-400 hover:text-gray-600 transition-colors disabled:opacity-50"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <p className="text-sm text-gray-600 mb-4">
          You are about to unlock collateral for{' '}
          <span className="font-mono font-semibold text-gray-900">
            {borrower.slice(0, 6)}...{borrower.slice(-4)}
          </span>
        </p>

        <div className="bg-gray-50 p-4 rounded-lg text-sm space-y-2 mb-4">
          <div className="flex justify-between">
            <span className="text-gray-500">Amount:</span>
            <span className="font-bold text-gray-900">{lockedAmount} USDY</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Lock ID:</span>
            <span className="font-mono text-xs text-gray-700">
              {lockId.slice(0, 10)}...{lockId.slice(-8)}
            </span>
          </div>
        </div>

        <div className="flex gap-3">
          <Button
            ref={cancelRef}
            variant="outline"
            onClick={onClose}
            disabled={isLoading}
            className="flex-1"
          >
            Cancel
          </Button>
          <Button
            variant="default"
            onClick={onConfirm}
            disabled={isLoading}
            className="flex-1 bg-amber-600 hover:bg-amber-700"
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Processing
              </>
            ) : (
              'Confirm Unlock'
            )}
          </Button>
        </div>

        {error && (
          <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
            <div className="flex items-center gap-2 text-sm text-red-700">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              <span>{error.message}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
