'use client';

import { formatUnits } from 'viem';
import { useDynamicWallet } from '@/hooks/useDynamicWallet';
import { useBorrowerBalance } from '@/hooks/useBorrowerBalance';
import { useMounted } from '@/hooks/useMounted';

export function UsdyBalance() {
  const mounted = useMounted();
  const { address, isConnected } = useDynamicWallet();
  const balance = useBorrowerBalance(address);

  // SSR or wallet not connected - render nothing
  if (!mounted || !isConnected) return null;

  // RPC error - show subtle error indicator
  if (balance.isError) {
    return (
      <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-full bg-secondary/50 border border-destructive/50">
        <div className="w-2 h-2 rounded-full bg-destructive" />
        <span className="text-sm font-medium text-muted-foreground">— USDY</span>
      </div>
    );
  }

  // Loading - hidden (balance appears when ready, no layout shift)
  if (balance.data?.raw === undefined) return null;

  const formattedBalance = Number(formatUnits(balance.data.raw, 18)).toFixed(2);

  return (
    <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-full bg-secondary/50 border border-border/50">
      <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
      <span className="text-sm font-medium text-foreground">{formattedBalance} USDY</span>
    </div>
  );
}
