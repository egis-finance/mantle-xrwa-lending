'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Activity, AlertTriangle, XCircle, Wallet } from 'lucide-react';
import { useDynamicWallet } from '@/hooks/useDynamicWallet';
import { useSDKReady } from '@/hooks/useSDKReady';
import { useLoanHealth } from '@/hooks/useLoanHealth';
import { useSystemParams } from '@/hooks/useSystemParams';
import { formatDollarValue, formatLtv, formatHealthFactor, formatLiquidationPrice } from '@/lib/format';
import { cn } from '@/lib/utils';
import { DEFAULT_LLTV_DECIMAL } from '@/lib/marketId';

interface LoanHealthCardProps {
  className?: string;
}

export const LoanHealthCard = React.memo<LoanHealthCardProps>(({ className }) => {
  const sdkReady = useSDKReady();
  const { address: borrowerAddress, isConnected } = useDynamicWallet();
  const systemParams = useSystemParams();
  const loanHealth = useLoanHealth(borrowerAddress, {
    lltv: systemParams.lltv ?? DEFAULT_LLTV_DECIMAL
  });

  // SDK initializing or data loading - show loading skeleton
  const isLoading = !sdkReady || loanHealth.isLoading;

  // Wallet disconnected after SDK ready
  const isDisconnected = sdkReady && (!isConnected || !borrowerAddress);

  // Determine if we should show health factor (only when debt exists)
  const hasDebt = loanHealth.debtValue !== null && loanHealth.debtValue > 0;

  // Loading state
  if (isLoading) {
    return (
      <Card className={cn("border-none shadow-soft-xl", className)}>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Activity className="h-5 w-5 text-brand-DEFAULT" />
            Loan Health
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="animate-pulse space-y-3">
            <div className="h-4 bg-gray-200 rounded w-3/4"></div>
            <div className="h-8 bg-gray-200 rounded w-1/2"></div>
            <div className="h-4 bg-gray-200 rounded w-2/3"></div>
          </div>
          <p className="text-sm text-brand-muted text-center">
            Fetching blockchain data...
          </p>
        </CardContent>
      </Card>
    );
  }

  // Disconnected state
  if (isDisconnected) {
    return (
      <Card className={cn("border-none shadow-soft-xl", className)}>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Activity className="h-5 w-5 text-brand-DEFAULT" />
            Loan Health
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-2 p-4 bg-blue-50 rounded-lg border border-blue-100">
            <Wallet className="h-4 w-4 text-blue-500" />
            <p className="text-sm text-blue-700">
              Connect wallet to view position
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Risk colors based on level
  const riskColors = {
    safe: 'text-success-DEFAULT',
    warning: 'text-warning-DEFAULT',
    danger: 'text-danger-DEFAULT',
  };

  const riskBgColors = {
    safe: 'bg-success-light/20',
    warning: 'bg-warning-light/20',
    danger: 'bg-danger-light/20',
  };

  return (
    <Card className={cn("border-none shadow-soft-xl", className)}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Activity className="h-5 w-5 text-brand-DEFAULT" />
          Loan Health
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Warning Banner */}
        {loanHealth.riskLevel === 'warning' && (
          <div className="flex items-start gap-2 p-3 bg-warning-light/20 rounded-lg border border-warning-DEFAULT/30">
            <AlertTriangle className="h-4 w-4 text-warning-DEFAULT flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-warning-DEFAULT">
                Warning: Approaching liquidation threshold
              </p>
              <p className="text-xs text-warning-DEFAULT/80 mt-0.5">
                Liquidation price: {formatLiquidationPrice(loanHealth.liquidationPrice)}
              </p>
            </div>
          </div>
        )}

        {/* Critical Banner */}
        {loanHealth.riskLevel === 'danger' && (
          <div className="flex items-start gap-2 p-3 bg-danger-light/20 rounded-lg border border-danger-DEFAULT/30">
            <XCircle className="h-4 w-4 text-danger-DEFAULT flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-danger-DEFAULT">
                Critical: Position at risk of liquidation!
              </p>
              <p className="text-xs text-danger-DEFAULT/80 mt-0.5">
                Liquidation price: {formatLiquidationPrice(loanHealth.liquidationPrice)}
              </p>
            </div>
          </div>
        )}

        {/* Metrics Grid */}
        <div className="grid grid-cols-2 gap-4">
          {/* Current LTV */}
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
            <p className="text-xs text-brand-muted font-medium uppercase tracking-wider mb-1">
              Current LTV
            </p>
            <p className={cn(
              "text-xl font-bold",
              riskColors[loanHealth.riskLevel]
            )}>
              {formatLtv(loanHealth.ltv)}
            </p>
          </div>

          {/* Health Factor - only show when debt exists */}
          {hasDebt && (
            <div className={cn(
              "p-3 rounded-xl border",
              riskBgColors[loanHealth.riskLevel],
              "border-slate-100"
            )}>
              <p className="text-xs text-brand-muted font-medium uppercase tracking-wider mb-1">
                Health Factor:
              </p>
              <p className={cn(
                "text-xl font-bold",
                riskColors[loanHealth.riskLevel]
              )}>
                {formatHealthFactor(loanHealth.healthFactor)}
              </p>
            </div>
          )}
        </div>

        {/* Value Display */}
        <div className="space-y-3">
          <div className="flex justify-between items-center py-2 px-3 bg-slate-50 rounded-lg border border-slate-100">
            <p className="text-sm text-brand-muted font-medium">Collateral Value</p>
            <p className="text-sm font-bold text-brand-dark">
              {formatDollarValue(loanHealth.collateralValue)}
            </p>
          </div>

          <div className="flex justify-between items-center py-2 px-3 bg-slate-50 rounded-lg border border-slate-100">
            <p className="text-sm text-brand-muted font-medium">Total Debt</p>
            <p className="text-sm font-bold text-brand-dark">
              {formatDollarValue(loanHealth.debtValue)}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
});
LoanHealthCard.displayName = 'LoanHealthCard';
