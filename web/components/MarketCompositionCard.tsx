'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PieChart, Wallet, Info } from 'lucide-react';
import { useSystemParams } from '@/hooks/useSystemParams';
import { useDynamicWallet } from '@/hooks/useDynamicWallet';
import { formatTvl } from '@/lib/format';
import { cn } from '@/lib/utils';

interface MarketCompositionCardProps {
    className?: string;
}

/**
 * SVG-based donut chart visualizing market supply allocation.
 * Shows two segments: available liquidity (green) vs borrowed (blue).
 */
const MarketDonutChart = React.memo<{
    utilizationRate: number;
    isLoading: boolean;
}>(({ utilizationRate, isLoading }) => {
    // SVG circle math: circumference = 2 * PI * radius
    const radius = 40;
    const circumference = 2 * Math.PI * radius;

    // Calculate stroke offsets for two-segment donut
    const borrowedPercent = Math.min(utilizationRate, 100);
    const availablePercent = 100 - borrowedPercent;

    const borrowedStroke = (borrowedPercent / 100) * circumference;
    const availableStroke = (availablePercent / 100) * circumference;

    const ariaLabel = isLoading
        ? 'Market composition chart loading'
        : `Market utilization: ${borrowedPercent.toFixed(2)}% borrowed, ${availablePercent.toFixed(2)}% available`;

    return (
        <div className="relative w-28 h-28 flex-shrink-0">
            <svg
                role="img"
                aria-label={ariaLabel}
                className="transform -rotate-90 w-full h-full"
                viewBox="0 0 100 100"
            >
                <title>{ariaLabel}</title>
                {/* Background circle */}
                <circle
                    cx="50"
                    cy="50"
                    r={radius}
                    fill="none"
                    stroke="#f1f5f9"
                    strokeWidth="12"
                />

                {/* Available liquidity segment (green) - drawn first as base */}
                <circle
                    cx="50"
                    cy="50"
                    r={radius}
                    fill="none"
                    stroke="#10b981"
                    strokeWidth="12"
                    strokeDasharray={`${availableStroke} ${circumference}`}
                    strokeDashoffset="0"
                    strokeLinecap="round"
                    className="transition-[stroke-dasharray,stroke-dashoffset] duration-700 motion-reduce:transition-none"
                />

                {/* Borrowed segment (blue) - overlaid */}
                <circle
                    cx="50"
                    cy="50"
                    r={radius}
                    fill="none"
                    stroke="#3b82f6"
                    strokeWidth="12"
                    strokeDasharray={`${borrowedStroke} ${circumference}`}
                    strokeDashoffset={`-${availableStroke}`}
                    strokeLinecap="round"
                    className="transition-[stroke-dasharray,stroke-dashoffset] duration-700 motion-reduce:transition-none"
                />
            </svg>

            {/* Center text - aria-hidden since SVG already provides accessible label */}
            <div className="absolute inset-0 flex flex-col items-center justify-center" aria-hidden="true">
                {isLoading ? (
                    <span className="text-sm text-brand-muted">...</span>
                ) : (
                    <>
                        <span className="text-lg font-bold text-brand-dark">
                            {borrowedPercent.toFixed(2)}%
                        </span>
                        <span className="text-[9px] text-brand-muted uppercase">
                            Utilized
                        </span>
                    </>
                )}
            </div>
        </div>
    );
});
MarketDonutChart.displayName = 'MarketDonutChart';

/**
 * Market Composition Card - displays USDC supply breakdown with donut chart.
 * Replaces redundant TVL metrics with distinct supply/borrow visualization.
 */
export const MarketCompositionCard = React.memo<MarketCompositionCardProps>(({ className }) => {
    const { isConnected } = useDynamicWallet();
    const systemParams = useSystemParams();

    const utilizationRate = systemParams.utilizationRate ?? 0;
    const totalSupply = systemParams.totalSupply ?? '0';
    const totalBorrow = systemParams.totalBorrow ?? '0';
    const availableLiquidity = systemParams.availableLiquidity ?? '0';

    return (
        <Card className={cn(
            "border-l-4 border-l-brand-DEFAULT bg-white shadow-soft-xl",
            className
        )}>
            <CardHeader className="pb-2">
                <CardTitle className="text-sm font-bold text-brand-muted uppercase tracking-wider flex items-center gap-2">
                    <PieChart className="h-4 w-4" />
                    Market Composition
                </CardTitle>
            </CardHeader>
            <CardContent className="pt-2">
                <div className="flex items-start gap-4">
                    {/* Donut chart visualization */}
                    <MarketDonutChart
                        utilizationRate={utilizationRate}
                        isLoading={systemParams.isLoading}
                    />

                    {/* Legend and metrics */}
                    <div className="flex-1 space-y-3">
                        {/* Total Supply */}
                        <div className="flex items-center gap-2">
                            <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 flex-shrink-0" />
                            <div className="flex-1 min-w-0">
                                <p className="text-[9px] text-brand-muted uppercase font-bold">
                                    Total Supply
                                </p>
                                <p className="text-base font-bold text-brand-dark leading-tight tabular-nums truncate">
                                    {systemParams.isLoading ? '...' : formatTvl(totalSupply)}
                                    <span className="text-[10px] font-normal text-brand-muted ml-1">USDC</span>
                                </p>
                            </div>
                        </div>

                        {/* Total Borrowed */}
                        <div className="flex items-center gap-2">
                            <div className="w-2.5 h-2.5 rounded-full bg-blue-500 flex-shrink-0" />
                            <div className="flex-1 min-w-0">
                                <p className="text-[9px] text-brand-muted uppercase font-bold">
                                    Borrowed
                                </p>
                                <p className="text-base font-bold text-brand-dark leading-tight tabular-nums truncate">
                                    {systemParams.isLoading ? '...' : formatTvl(totalBorrow)}
                                    <span className="text-[10px] font-normal text-brand-muted ml-1">USDC</span>
                                </p>
                            </div>
                        </div>

                        {/* Available Liquidity */}
                        <div className="pt-2 border-t border-slate-100">
                            <div className="flex items-center gap-1.5">
                                <Wallet className="h-3 w-3 text-brand-muted" />
                                <p className="text-[9px] text-brand-muted uppercase font-bold">
                                    Available Liquidity
                                </p>
                            </div>
                            <p className="text-sm font-bold text-emerald-600 tabular-nums">
                                {systemParams.isLoading ? '...' : formatTvl(availableLiquidity)}
                            </p>
                        </div>
                    </div>
                </div>

                {/* Connect wallet CTA when disconnected */}
                {!isConnected && (
                    <div className="mt-4 flex items-center gap-2 p-2.5 bg-blue-50/50 rounded-lg border border-blue-100/50">
                        <Info className="h-3.5 w-3.5 text-blue-500 flex-shrink-0" />
                        <p className="text-[10px] text-blue-700 font-medium leading-tight">
                            Connect wallet to view your personal position
                        </p>
                    </div>
                )}
            </CardContent>
        </Card>
    );
});
MarketCompositionCard.displayName = 'MarketCompositionCard';
