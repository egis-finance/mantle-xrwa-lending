'use client';

import { useState, useCallback } from 'react';
import { useDynamicWallet } from './useDynamicWallet';
import { getEnv } from '@/lib/env';
import { contracts } from '@/lib/contracts';

export function useFundWallet() {
  const { address } = useDynamicWallet();
  const [isFunding, setIsFunding] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);

  const fund = useCallback(async () => {
    if (!address) {
      setLastError('No wallet connected');
      return;
    }

    const env = getEnv();
    if (env.useMainnet) {
      setLastError('Funding is only available in VTE mode');
      return;
    }

    setIsFunding(true);
    setLastError(null);

    const rpcCall = async (url: string, method: string, params: unknown[]) => {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: Date.now(),
          method,
          params,
        }),
      });
      return response.json();
    };

    try {
      // 1. Fund Native MNT on Mantle (for gas)
      await rpcCall(env.rpc.mantleVte, 'tenderly_setBalance', [address, '0x3635c9adc5dea00000']); // 1000 MNT

      // 2. Fund USDY on Mantle
      await rpcCall(env.rpc.mantleVte, 'tenderly_setErc20Balance', [
        contracts.usdy.address,
        address,
        '0xd3c21bcecceda1000000', // 1M tokens (18 dec)
      ]);

      // 3. Fund Native ETH on Ethereum (for gas)
      await rpcCall(env.rpc.ethereumVte, 'tenderly_setBalance', [address, '0x8ac7230489e80000']); // 10 ETH

      // 4. Fund USDC on Ethereum
      await rpcCall(env.rpc.ethereumVte, 'tenderly_setErc20Balance', [
        contracts.usdc.address,
        address,
        '0xe8d4a51000', // 1M tokens (6 dec)
      ]);

      console.log('✅ VTE Funding Successful');
    } catch (err) {
      const error = err as { message?: string };
      console.error('Funding failed:', error);
      setLastError(error.message || 'Funding failed');
    } finally {
      setIsFunding(false);
    }
  }, [address]);

  return { fund, isFunding, lastError };
}

