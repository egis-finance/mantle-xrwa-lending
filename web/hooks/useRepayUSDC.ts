/**
 * Repay USDC debt to Morpho Blue
 *
 * Two-step flow:
 * 1. approve() - grant Morpho spending rights for USDC
 * 2. repay() - call Morpho.repay() to reduce debt
 *
 * Full repay mode approves a 0.1% buffer to cover accrued interest, but repays by shares
 * to avoid rounding overflow when repaying the exact debt.
 */

'use client';

import { useState, useCallback } from 'react';
import type { Address, Hash } from 'viem';
import { useDynamicContext } from '@dynamic-labs/sdk-react-core';
import { isEthereumWallet } from '@dynamic-labs/ethereum';
import { getPublicClient } from '@/lib/swr/chains';
import { contracts, ETHEREUM_CHAIN_ID, UNCONFIGURED_ADDRESS } from '@/lib/contracts';
import { MorphoAbi } from '@/lib/contracts/abis/Morpho';
import { invalidateUserReads, invalidateBatchReads } from '@/lib/swr/invalidation';
import { normalizeChainId } from '@/lib/dynamic/chains';
import type { MorphoMarketParams } from './useSystemParams';

export type RepayStatus = 'idle' | 'approving' | 'repaying' | 'confirming' | 'success' | 'error';

export interface UseRepayUSDCResult {
  repay: (
    amount: bigint,
    isFullRepay: boolean,
    debtAssetsRaw: bigint | null,
    borrowShares?: bigint | null
  ) => Promise<Hash>;
  status: RepayStatus;
  statusMessage: string;
  error: Error | null;
  txHash: Hash | null;
  reset: () => void;
}

// Minimal ABI for ERC20 approve
const ERC20ApproveAbi = [
  {
    name: 'approve',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ type: 'bool' }],
  },
] as const;

function getStatusMessage(status: RepayStatus): string {
  switch (status) {
    case 'approving':
      return 'Approving USDC...';
    case 'repaying':
      return 'Repaying debt...';
    case 'confirming':
      return 'Confirming transaction...';
    case 'success':
      return 'Debt repaid!';
    case 'error':
      return 'Transaction failed';
    default:
      return '';
  }
}

/**
 * Hook for repaying USDC debt to Morpho Blue.
 * Accepts canonical marketParams from on-chain to ensure correct market targeting.
 *
 * For full repay: Pass isFullRepay=true with debtAssetsRaw + borrowShares from useBorrowerDebt.
 * The hook approves a buffered amount and repays by shares to avoid overpaying.
 */
export function useRepayUSDC(
  marketParams: MorphoMarketParams | undefined
): UseRepayUSDCResult {
  const { primaryWallet } = useDynamicContext();
  const [status, setStatus] = useState<RepayStatus>('idle');
  const [error, setError] = useState<Error | null>(null);
  const [txHash, setTxHash] = useState<Hash | null>(null);

  const reset = useCallback(() => {
    setStatus('idle');
    setError(null);
    setTxHash(null);
  }, []);

  const repay = useCallback(
    async (
      amount: bigint,
      isFullRepay: boolean,
      debtAssetsRaw: bigint | null,
      borrowShares: bigint | null = null
    ): Promise<Hash> => {
      // Guardrail 1: Wallet connected
      if (!primaryWallet || !isEthereumWallet(primaryWallet)) {
        const err = new Error('No Ethereum wallet connected');
        setError(err);
        setStatus('error');
        throw err;
      }

      // Guardrail 2: Morpho contract configured
      if (contracts.morpho.address === UNCONFIGURED_ADDRESS) {
        const err = new Error('Morpho contract not configured');
        setError(err);
        setStatus('error');
        throw err;
      }

      // Guardrail 2b: USDC contract configured
      if (contracts.usdc.address === UNCONFIGURED_ADDRESS) {
        const err = new Error('USDC contract not configured');
        setError(err);
        setStatus('error');
        throw err;
      }

      // Guardrail 3: Market params loaded
      if (!marketParams) {
        const err = new Error('Market params not loaded');
        setError(err);
        setStatus('error');
        throw err;
      }

      // Full repay validation
      if (isFullRepay) {
        if (debtAssetsRaw == null) {
          const err = new Error('Cannot full repay when debt is unknown');
          setError(err);
          setStatus('error');
          throw err;
        }
        if (debtAssetsRaw === 0n) {
          const err = new Error('Cannot full repay when debt is zero');
          setError(err);
          setStatus('error');
          throw err;
        }
        if (borrowShares == null || borrowShares === 0n) {
          const err = new Error('Cannot full repay when borrow shares are unknown');
          setError(err);
          setStatus('error');
          throw err;
        }
      }

      // Guardrail 4: Amount positive (skip for full repay - amount may be 0n when using isFullRepay)
      if (!isFullRepay && amount <= 0n) {
        const err = new Error('Amount must be greater than zero');
        setError(err);
        setStatus('error');
        throw err;
      }

      try {
        reset();

        // Guard: prevent repaying more than outstanding debt with asset-based repay
        if (!isFullRepay && debtAssetsRaw != null && amount > debtAssetsRaw) {
          const err = new Error('Amount exceeds outstanding debt');
          setError(err);
          setStatus('error');
          throw err;
        }

        // Calculate approval amount (buffer covers interest that may accrue between read and submit)
        const approveAmount = isFullRepay
          ? (debtAssetsRaw! * 1001n) / 1000n // debt + 0.1% buffer for accrued interest
          : amount;

        const repayAssets = isFullRepay ? 0n : amount;
        const repayShares = isFullRepay ? borrowShares! : 0n;

        // Guard: approval amount must be positive
        if (approveAmount <= 0n) {
          const err = new Error('Repay amount must be greater than zero');
          setError(err);
          setStatus('error');
          throw err;
        }

        // Guardrail 5: Derive userAddress once - reuse for calls AND invalidation
        const walletClient = await primaryWallet.getWalletClient();
        const [userAddress] = await walletClient.getAddresses();

        // Guardrail 6: Fail if address missing
        if (!userAddress) {
          const err = new Error('Could not resolve wallet address');
          setError(err);
          setStatus('error');
          throw err;
        }

        // Guardrail 7: Switch chain before first write
        const currentNetwork = await primaryWallet.getNetwork();
        if (normalizeChainId(currentNetwork) !== ETHEREUM_CHAIN_ID) {
          await primaryWallet.switchNetwork(ETHEREUM_CHAIN_ID);
        }

        const publicClient = getPublicClient(ETHEREUM_CHAIN_ID);

        // Step 1: Approve USDC to Morpho (use repayAmount, not amount)
        setStatus('approving');
        const approveHash = await walletClient.writeContract({
          account: userAddress,
          address: contracts.usdc.address,
          abi: ERC20ApproveAbi,
          functionName: 'approve',
          args: [contracts.morpho.address as Address, approveAmount],
        });

        await publicClient.waitForTransactionReceipt({ hash: approveHash });

        // Step 2: Repay debt to Morpho
        setStatus('repaying');
        const repayHash = await walletClient.writeContract({
          account: userAddress,
          address: contracts.morpho.address,
          abi: MorphoAbi,
          functionName: 'repay',
          args: [
            marketParams,  // canonical market params from on-chain
            repayAssets,   // assets (USDC amount, 6 decimals)
            repayShares,   // shares (0 = calculate from assets)
            userAddress,   // onBehalf (reduce this user's debt)
            '0x',          // data (empty callback - viem requires hex for bytes)
          ],
        });

        setTxHash(repayHash);
        setStatus('confirming');

        await publicClient.waitForTransactionReceipt({ hash: repayHash });

        // Cache invalidation - batch first (always), then user
        invalidateBatchReads(contracts.morpho.chainId);
        await invalidateUserReads(userAddress);

        setStatus('success');
        return repayHash;
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Unknown error', { cause: err });
        setError(error);
        setStatus('error');
        throw error;
      }
    },
    [primaryWallet, marketParams, reset]
  );

  return {
    repay,
    status,
    statusMessage: getStatusMessage(status),
    error,
    txHash,
    reset,
  };
}
