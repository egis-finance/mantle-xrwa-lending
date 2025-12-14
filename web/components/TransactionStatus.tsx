'use client';

import { useDynamicWallet } from '@/hooks/useDynamicWallet';
import { getChainById } from '@/lib/dynamic/chains';
import { CheckCircle, XCircle, Loader2 } from 'lucide-react';

interface TransactionStatusProps {
  status: 'pending' | 'success' | 'error';
  txHash?: string;
  chainId?: number;
  message?: string;
}

/**
 * Displays transaction status with explorer link.
 * Simplified for embedded wallet flows (no Safe multi-sig).
 */
export function TransactionStatus({
  status,
  txHash,
  chainId: propChainId,
  message,
}: TransactionStatusProps) {
  const { chainId: walletChainId } = useDynamicWallet();
  const chainId = propChainId ?? walletChainId;

  const getExplorerUrl = (): string | null => {
    if (!txHash || !chainId) return null;
    try {
      const chain = getChainById(chainId);
      const explorerUrl = chain.blockExplorerUrls?.[0];
      if (!explorerUrl) return null;
      // Handle both standard explorers (/tx/) and Tenderly VTE (append directly)
      if (explorerUrl.includes('tenderly.co')) {
        return `${explorerUrl}/tx/${txHash}`;
      }
      return `${explorerUrl}/tx/${txHash}`;
    } catch {
      return null;
    }
  };

  const explorerUrl = getExplorerUrl();

  if (status === 'pending') {
    return (
      <div className="flex items-center gap-2 text-yellow-600">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span>{message ?? 'Transaction pending...'}</span>
      </div>
    );
  }

  if (status === 'success') {
    return (
      <div className="flex items-center gap-2 text-green-600">
        <CheckCircle className="h-4 w-4" />
        <span>{message ?? 'Transaction successful'}</span>
        {explorerUrl && (
          <a
            href={explorerUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm underline hover:text-green-700"
          >
            View
          </a>
        )}
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="flex items-center gap-2 text-red-600">
        <XCircle className="h-4 w-4" />
        <span>{message ?? 'Transaction failed'}</span>
        {explorerUrl && (
          <a
            href={explorerUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm underline hover:text-red-700"
          >
            View
          </a>
        )}
      </div>
    );
  }

  return null;
}
