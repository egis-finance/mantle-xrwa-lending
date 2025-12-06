'use client';

import { useAccount, useReadContract } from 'wagmi';
import { formatUnits } from 'viem';
import { useSyncExternalStore } from 'react';

const USDY_ADDRESS = (process.env.NEXT_PUBLIC_MANTLE_USDY || '0x5bE26527e817999A72036110DFD3416f10965753') as `0x${string}`;

const ERC20_ABI = [
  {
    inputs: [{ name: 'account', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

// Hydration-safe mounted check using useSyncExternalStore
const subscribe = () => () => {};
const getSnapshot = () => true;
const getServerSnapshot = () => false;

export function UsdyBalance() {
  const { address, isConnected } = useAccount();
  const mounted = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const { data: balance } = useReadContract({
    address: USDY_ADDRESS,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: {
      enabled: !!address,
    },
  });

  if (!mounted || !isConnected || balance === undefined) {
    return null;
  }

  const formattedBalance = Number(formatUnits(balance, 18)).toFixed(2);

  return (
    <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-full bg-secondary/50 border border-border/50">
      <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
      <span className="text-sm font-medium text-foreground">
        {formattedBalance} USDY
      </span>
    </div>
  );
}
