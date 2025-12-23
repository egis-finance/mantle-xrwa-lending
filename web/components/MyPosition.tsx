'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Wallet, Lock, Coins, TrendingUp, Activity, AlertCircle } from 'lucide-react';
import { useDynamicWallet } from '@/hooks/useDynamicWallet';
import { useLockedUSDY } from '@/hooks/useLockedUSDY';
import { useLoanHealth } from '@/hooks/useLoanHealth';
import { useBorrowerDebt } from '@/hooks/useBorrowerDebt';
import { useAcUSDYBalance } from '@/hooks/useAcUSDYBalance';
import { useMorphoCollateral } from '@/hooks/useMorphoCollateral';
import { useLenderPosition } from '@/hooks/useLenderPosition';
import { useSystemParams } from '@/hooks/useSystemParams';
import { formatTvl } from '@/lib/format';
import { cn } from '@/lib/utils';

interface MyPositionProps {
    className?: string;
    showTitle?: boolean;
    title?: string;
    showLending?: boolean;
}

export const MyPosition: React.FC<MyPositionProps> = ({ 
    className, 
    showTitle = true,
    title = "My Positions",
    showLending = true
}) => {
    const { address: userAddress, isConnected } = useDynamicWallet();
    const systemParams = useSystemParams();
    
    // User-specific data
    const lockedUSDY = useLockedUSDY(userAddress);
    const borrowerDebt = useBorrowerDebt(userAddress);
    const morphoCollateral = useMorphoCollateral(userAddress);
    const acUsdyBalance = useAcUSDYBalance(userAddress);
    const lenderPosition = useLenderPosition(userAddress, { enabled: showLending });
    const loanHealth = useLoanHealth(userAddress, { lltv: systemParams.lltv ?? 0.86 });

    const totalAcUsdy = (Number(acUsdyBalance.data?.value ?? 0) + Number(morphoCollateral.data?.value ?? 0)).toString();
    const isBorrowing = Number(borrowerDebt.data?.value ?? 0) > 0;
    const isLending = showLending && Number(lenderPosition.data?.suppliedValue ?? 0) > 0;
    const hasLockedAssets = Number(lockedUSDY.data?.value ?? 0) > 0;

    if (!isConnected) {
        return (
            <Card className={cn("border-l-4 border-l-gray-300 bg-gray-50 opacity-60 shadow-soft-xl", className)}>
                <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-bold text-brand-muted uppercase tracking-wider flex items-center gap-2">
                        <Wallet className="h-4 w-4" />
                        {title}
                    </CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col items-center justify-center py-8 text-center">
                    <p className="text-xs text-brand-muted italic">Connect wallet to view your active positions</p>
                </CardContent>
            </Card>
        );
    }

    return (
        <Card className={cn(
            "border-l-4 shadow-soft-xl transition-all duration-500 border-l-brand-DEFAULT bg-white",
            className
        )}>
            {showTitle && (
                <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-bold text-brand-muted uppercase tracking-wider flex items-center gap-2">
                        <Wallet className="h-4 w-4" />
                        {title}
                    </CardTitle>
                </CardHeader>
            )}
            <CardContent className="space-y-6 pt-4">
                {/* Borrower Section */}
                <div className="space-y-4">
                    <div className="flex items-center justify-between">
                        <h4 className="text-[10px] font-bold text-brand-muted uppercase tracking-widest flex items-center gap-1.5">
                            <Activity className="h-3 w-3 text-brand-DEFAULT" />
                            Borrowing Position
                        </h4>
                        {isBorrowing ? (
                            <span className="text-[8px] bg-brand-light/30 text-brand-DEFAULT px-1.5 py-0.5 rounded uppercase font-bold">Active</span>
                        ) : (
                            <span className="text-[8px] bg-gray-100 text-gray-400 px-1.5 py-0.5 rounded uppercase font-bold">Inactive</span>
                        )}
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                            <p className="text-[9px] text-brand-muted uppercase font-bold flex items-center gap-1 mb-1">
                                <Lock className="h-2 w-2" />
                                Mantle Locked
                            </p>
                            <p className="text-lg font-bold text-brand-dark leading-none">
                                {lockedUSDY.isLoading ? '...' : formatTvl(lockedUSDY.data?.value ?? '0')} 
                                <span className="text-[10px] font-normal text-brand-muted ml-1">USDY</span>
                            </p>
                        </div>
                        <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                            <p className="text-[9px] text-brand-muted uppercase font-bold flex items-center gap-1 mb-1">
                                <Coins className="h-2 w-2" />
                                Eth Collateral
                            </p>
                            <p className="text-lg font-bold text-brand-dark leading-none">
                                {acUsdyBalance.isLoading || morphoCollateral.isLoading ? '...' : formatTvl(totalAcUsdy)} 
                                <span className="text-[10px] font-normal text-brand-muted ml-1">AcUSDY</span>
                            </p>
                        </div>
                    </div>

                    <div className="flex justify-between items-center py-2 px-3 bg-brand-light/5 rounded-lg border border-brand-light/10">
                        <p className="text-[10px] text-brand-muted uppercase font-bold">Active Debt</p>
                        <p className="text-sm font-bold text-brand-dark">
                            {borrowerDebt.isLoading ? '...' : formatTvl(borrowerDebt.data?.value ?? '0')} 
                            <span className="text-[10px] font-normal text-brand-muted ml-1">USDC</span>
                        </p>
                    </div>

                    {isBorrowing && (
                        <div className="pt-1">
                            <div className="flex justify-between items-center mb-1">
                                <span className="text-[10px] font-bold text-brand-muted uppercase">Loan Health</span>
                                <span className={cn(
                                    "text-xs font-bold px-2 py-0.5 rounded-full",
                                    loanHealth.riskLevel === 'safe' ? "text-success-DEFAULT bg-success-light/10" :
                                    loanHealth.riskLevel === 'warning' ? "text-warning-DEFAULT bg-warning-light/10" :
                                    "text-danger-DEFAULT bg-danger-light/10"
                                )}>
                                    {loanHealth.healthFactor ? Number(loanHealth.healthFactor).toFixed(2) : '--'}
                                </span>
                            </div>
                            <div className="h-1.5 w-full bg-gray-100 rounded-full overflow-hidden">
                                <div 
                                    className={cn(
                                        "h-full transition-all duration-1000",
                                        loanHealth.riskLevel === 'safe' ? "bg-success-DEFAULT" :
                                        loanHealth.riskLevel === 'warning' ? "bg-warning-DEFAULT" :
                                        "bg-danger-DEFAULT"
                                    )}
                                    style={{ width: `${Math.min(100, (loanHealth.ltv ?? 0) / (systemParams.lltv ?? 0.86) * 100)}%` }}
                                ></div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Divider */}
                {showLending && <div className="h-px bg-slate-100" />}

                {/* Earner Section */}
                {showLending && (
                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <h4 className="text-[10px] font-bold text-brand-muted uppercase tracking-widest flex items-center gap-1.5">
                                <TrendingUp className="h-3 w-3 text-success-DEFAULT" />
                                Lending Position
                            </h4>
                            {isLending ? (
                                <span className="text-[8px] bg-success-light/30 text-success-DEFAULT px-1.5 py-0.5 rounded uppercase font-bold">Earning</span>
                            ) : (
                                <span className="text-[8px] bg-gray-100 text-gray-400 px-1.5 py-0.5 rounded uppercase font-bold">Inactive</span>
                            )}
                        </div>

                        <div className="p-3 bg-emerald-50/30 rounded-xl border border-emerald-100/50">
                            <p className="text-[9px] text-emerald-600 uppercase font-bold flex items-center gap-1 mb-1">
                                <Coins className="h-2 w-2" />
                                Supplied Assets
                            </p>
                            <div className="flex items-baseline gap-2">
                                <p className="text-2xl font-bold text-brand-dark leading-none">
                                    {lenderPosition.isLoading ? '...' : formatTvl(lenderPosition.data?.suppliedValue ?? '0')}
                                    <span className="text-xs font-normal text-brand-muted ml-1.5 text-slate-400">USDC</span>
                                </p>
                            </div>
                            {isLending && (
                                <div className="mt-2 flex items-center gap-1.5">
                                    <span className="text-[9px] text-success-DEFAULT font-bold flex items-center gap-1">
                                        <TrendingUp className="h-2.5 w-2.5" />
                                        +5.42% APY
                                    </span>
                                    <span className="text-[8px] text-slate-400 font-medium italic">(Projected)</span>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {!isBorrowing && !isLending && !hasLockedAssets && (
                    <div className="flex items-center gap-2 p-3 bg-blue-50/50 rounded-lg border border-blue-100/50">
                        <AlertCircle className="h-3.5 w-3.5 text-blue-500" />
                        <p className="text-[10px] text-blue-700 font-medium leading-tight">
                            Start earning by supplying assets or borrow against your USDY holdings.
                        </p>
                    </div>
                )}
            </CardContent>
        </Card>
    );
};

