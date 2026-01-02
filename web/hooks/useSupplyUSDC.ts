/**
 * USDC Supply to Morpho via Bundler3 + EIP-2612 Permit
 *
 * Enables single-transaction supply by combining:
 * 1. Permit signature (off-chain, gasless approval)
 * 2. Bundler3 multicall with three operations:
 *    - USDC.permit() - grants adapter allowance
 *    - Adapter.erc20TransferFrom() - pulls USDC to adapter
 *    - Adapter.morphoSupply() - supplies to Morpho market
 *
 * This eliminates the separate approve() transaction required by traditional flows.
 */

'use client';

import { useState, useCallback } from 'react';
import type { Address, Hash, Hex } from 'viem';
import { encodeFunctionData, maxUint256 } from 'viem';
import { useDynamicContext } from '@dynamic-labs/sdk-react-core';
import { isEthereumWallet } from '@dynamic-labs/ethereum';
import { getPublicClient } from '@/lib/swr/chains';
import { contracts, ETHEREUM_CHAIN_ID, UNCONFIGURED_ADDRESS } from '@/lib/contracts';
import { Bundler3Abi, GeneralAdapter1Abi, UsdcPermitAbi } from '@/lib/contracts/abis/Bundler3';
import { signUsdcPermit } from '@/lib/permit';
import { invalidateUserReads, invalidateBatchReads } from '@/lib/swr/invalidation';
import { normalizeChainId } from '@/lib/dynamic/chains';
import type { MorphoMarketParams } from './useSystemParams';

export type SupplyStatus = 'idle' | 'signing' | 'submitting' | 'confirming' | 'success' | 'error';

export interface UseSupplyUSDCResult {
  supply: (amount: bigint) => Promise<Hash>;
  status: SupplyStatus;
  error: Error | null;
  txHash: Hash | null;
  reset: () => void;
}

/**
 * Hook for supplying USDC to Morpho market via Bundler3 + permit.
 * Accepts canonical marketParams from on-chain to ensure correct market targeting.
 */
export function useSupplyUSDC(
  marketParams: MorphoMarketParams | undefined
): UseSupplyUSDCResult {
  const { primaryWallet } = useDynamicContext();
  const [status, setStatus] = useState<SupplyStatus>('idle');
  const [error, setError] = useState<Error | null>(null);
  const [txHash, setTxHash] = useState<Hash | null>(null);

  const reset = useCallback(() => {
    setStatus('idle');
    setError(null);
    setTxHash(null);
  }, []);

  const supply = useCallback(
    async (amount: bigint): Promise<Hash> => {
      // Validate wallet connection
      if (!primaryWallet || !isEthereumWallet(primaryWallet)) {
        const err = new Error('No Ethereum wallet connected');
        setError(err);
        setStatus('error');
        throw err;
      }

      // Validate contracts configured
      if (contracts.bundler3.address === UNCONFIGURED_ADDRESS) {
        const err = new Error('Bundler3 contract not configured');
        setError(err);
        setStatus('error');
        throw err;
      }

      // Validate market params loaded from on-chain
      if (!marketParams) {
        const err = new Error('Market params not loaded');
        setError(err);
        setStatus('error');
        throw err;
      }

      try {
        reset();

        // Ensure wallet is on Ethereum
        const currentNetwork = await primaryWallet.getNetwork();
        if (normalizeChainId(currentNetwork) !== ETHEREUM_CHAIN_ID) {
          await primaryWallet.switchNetwork(ETHEREUM_CHAIN_ID);
        }

        const walletClient = await primaryWallet.getWalletClient();
        const [userAddress] = await walletClient.getAddresses();
        const publicClient = getPublicClient(ETHEREUM_CHAIN_ID);

        // Step 1: Sign EIP-2612 permit (off-chain)
        setStatus('signing');
        const permitSig = await signUsdcPermit(
          walletClient,
          publicClient,
          userAddress,
          contracts.generalAdapter1.address,
          amount
        );

        // Step 2: Encode multicall bundle (using canonical marketParams from on-chain)
        setStatus('submitting');
        const bundle = buildSupplyBundle(
          userAddress,
          amount,
          permitSig,
          marketParams
        );

        // Step 4: Execute multicall via Bundler3
        const hash = await walletClient.writeContract({
          account: userAddress,
          address: contracts.bundler3.address,
          abi: Bundler3Abi,
          functionName: 'multicall',
          args: [bundle],
        });

        setTxHash(hash);
        setStatus('confirming');

        // Step 5: Wait for confirmation
        await publicClient.waitForTransactionReceipt({ hash });

        // Step 6: Invalidate relevant caches
        await invalidateUserReads(userAddress);
        invalidateBatchReads(ETHEREUM_CHAIN_ID);

        setStatus('success');
        return hash;
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        setError(error);
        setStatus('error');
        throw error;
      }
    },
    [primaryWallet, marketParams, reset]
  );

  return { supply, status, error, txHash, reset };
}

/**
 * Builds the Bundler3 multicall bundle for USDC supply.
 * Three sequential calls: permit → transferFrom → morphoSupply
 */
function buildSupplyBundle(
  user: Address,
  amount: bigint,
  permit: { v: number; r: Hex; s: Hex; deadline: bigint },
  marketParams: MorphoMarketParams
): Array<{ target: Address; data: Hex; value: bigint; skipRevert: boolean }> {
  // Call 1: USDC.permit() - grants GeneralAdapter1 allowance
  const permitData = encodeFunctionData({
    abi: UsdcPermitAbi,
    functionName: 'permit',
    args: [
      user,
      contracts.generalAdapter1.address,
      amount,
      permit.deadline,
      permit.v,
      permit.r,
      permit.s,
    ],
  });

  // Call 2: Adapter.erc20TransferFrom() - pulls USDC from user to adapter
  const transferData = encodeFunctionData({
    abi: GeneralAdapter1Abi,
    functionName: 'erc20TransferFrom',
    args: [contracts.usdc.address, contracts.generalAdapter1.address, amount],
  });

  // Call 3: Adapter.morphoSupply() - supplies to Morpho on behalf of user
  // maxSharePriceE27 = maxUint256 means no slippage protection (accept any price)
  const supplyData = encodeFunctionData({
    abi: GeneralAdapter1Abi,
    functionName: 'morphoSupply',
    args: [
      marketParams,
      amount,     // assets (supply exact USDC amount)
      0n,         // shares (0 = use assets)
      maxUint256, // maxSharePriceE27 (no slippage limit)
      user,       // onBehalf (credit position to user)
      '0x',       // data (empty callback data)
    ],
  });

  return [
    {
      target: contracts.usdc.address,
      data: permitData,
      value: 0n,
      skipRevert: false,
    },
    {
      target: contracts.generalAdapter1.address,
      data: transferData,
      value: 0n,
      skipRevert: false,
    },
    {
      target: contracts.generalAdapter1.address,
      data: supplyData,
      value: 0n,
      skipRevert: false,
    },
  ];
}
