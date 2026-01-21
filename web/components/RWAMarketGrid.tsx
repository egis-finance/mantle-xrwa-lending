'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatTvl } from '@/lib/format';
import { cn } from '@/lib/utils';
import { TrendingUp, Building, FileText, Receipt } from 'lucide-react';

// Locale-safe LTV formatter with adaptive precision for small values
// null = loading, Infinity = over-leveraged (collateral=0, debt>0)
const formatLtv = (ltv: number | null): string => {
    if (ltv === null) return '...'; // Still loading
    if (!Number.isFinite(ltv)) return 'Over-leveraged'; // Infinity = collateral=0 but debt>0
    if (ltv === 0) return 'Est. 0% LTV';
    // Use 2 decimal places for small values (<1%), 1 decimal for larger
    const formatter = new Intl.NumberFormat(undefined, {
        minimumFractionDigits: ltv < 1 ? 2 : 1,
        maximumFractionDigits: ltv < 1 ? 2 : 1,
    });
    return `Est. ${formatter.format(ltv)}% LTV`;
};

// Asset class configuration - extend this when adding new RWA types
interface RWAAssetClass {
    id: string;
    name: string;
    subtitle: string;
    icon: React.ElementType;
    colorScheme: {
        border: string;
        bg: string;
        text: string;
        icon: string;
        badge: string;
        badgeText: string;
        progress: string;
    };
}

const ASSET_CLASSES: RWAAssetClass[] = [
    {
        id: 'short-term-yield',
        name: 'Short-Term Yield',
        subtitle: 'AcUSDY',
        icon: TrendingUp,
        colorScheme: {
            border: 'border-emerald-500',
            bg: 'bg-emerald-50/50',
            text: 'text-emerald-700',
            icon: 'text-emerald-600',
            badge: 'bg-emerald-100',
            badgeText: 'text-emerald-700',
            progress: 'bg-emerald-500',
        },
    },
    {
        id: 'real-estate',
        name: 'Real Estate',
        subtitle: 'Tokenized Property',
        icon: Building,
        colorScheme: {
            border: 'border-gray-300',
            bg: 'bg-gray-50/30',
            text: 'text-gray-400',
            icon: 'text-gray-300',
            badge: 'bg-gray-100',
            badgeText: 'text-gray-400',
            progress: 'bg-gray-200',
        },
    },
    {
        id: 'bonds',
        name: 'Bonds',
        subtitle: 'Fixed Income',
        icon: FileText,
        colorScheme: {
            border: 'border-gray-300',
            bg: 'bg-gray-50/30',
            text: 'text-gray-400',
            icon: 'text-gray-300',
            badge: 'bg-gray-100',
            badgeText: 'text-gray-400',
            progress: 'bg-gray-200',
        },
    },
    {
        id: 'invoices',
        name: 'Invoices',
        subtitle: 'Trade Finance',
        icon: Receipt,
        colorScheme: {
            border: 'border-gray-300',
            bg: 'bg-gray-50/30',
            text: 'text-gray-400',
            icon: 'text-gray-300',
            badge: 'bg-gray-100',
            badgeText: 'text-gray-400',
            progress: 'bg-gray-200',
        },
    },
];

// Progress bar for utilization visualization
const UtilizationBar = React.memo<{ value: number; colorClass: string }>(
    ({ value, colorClass }) => (
        <div className="h-1.5 w-full bg-gray-200 rounded-full overflow-hidden">
            <div
                className={cn('h-full rounded-full transition-[width] duration-500', colorClass)}
                style={{ width: `${Math.min(value, 100)}%` }}
            />
        </div>
    )
);
UtilizationBar.displayName = 'UtilizationBar';

// Active RWA card - displays live collateral metrics from radar positions
const ActiveRWACard = React.memo<{
    asset: RWAAssetClass;
    collateralUsd: string | null;
    debtBacked: string | null;
    capacityUsed: number | null; // % of LLTV (0-100), null = loading
    currentLtv: number | null; // raw LTV %, null = loading
    isLoading: boolean;
}>(({ asset, collateralUsd, debtBacked, capacityUsed, currentLtv, isLoading }) => {
    const Icon = asset.icon;

    return (
        <Card
            className={cn(
                'border-2 shadow-sm hover:shadow-md transition-shadow',
                asset.colorScheme.border,
                asset.colorScheme.bg
            )}
        >
            <CardContent className="p-4 space-y-3">
                {/* Header: Badge + Icon */}
                <div className="flex items-start justify-between">
                    <span
                        className={cn(
                            'text-[9px] font-bold uppercase px-2 py-0.5 rounded-full',
                            asset.colorScheme.badge,
                            asset.colorScheme.badgeText
                        )}
                    >
                        Active
                    </span>
                    <div className={cn('p-1.5 rounded-lg', asset.colorScheme.bg)}>
                        <Icon className={cn('h-4 w-4', asset.colorScheme.icon)} />
                    </div>
                </div>

                {/* Asset Name */}
                <div>
                    <h3 className={cn('font-semibold text-sm', asset.colorScheme.text)}>
                        {asset.name}
                    </h3>
                    <p className="text-[10px] text-gray-400">{asset.subtitle}</p>
                </div>

                {/* Active Collateral Value */}
                <div>
                    <p className={cn('text-xl font-bold tabular-nums', asset.colorScheme.text)}>
                        {isLoading ? '...' : formatTvl(collateralUsd)}
                    </p>
                    <p className="text-[9px] text-gray-400 uppercase">Active Collateral</p>
                </div>

                {/* Capacity Bar (LTV/LLTV) */}
                <div className="space-y-1">
                    <UtilizationBar value={capacityUsed ?? 0} colorClass={asset.colorScheme.progress} />
                    <div className="flex justify-between text-[9px]">
                        <span className="text-gray-400">
                            {isLoading ? '...' : formatLtv(currentLtv)}
                        </span>
                        <span className="text-gray-400">
                            {isLoading ? '' : `${formatTvl(debtBacked)} debt backed`}
                        </span>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
});
ActiveRWACard.displayName = 'ActiveRWACard';

// Placeholder RWA card - static "Coming Soon" styling
const PlaceholderRWACard = React.memo<{ asset: RWAAssetClass }>(({ asset }) => {
    const Icon = asset.icon;

    return (
        <Card
            className={cn(
                'border-2 border-dashed',
                asset.colorScheme.border,
                asset.colorScheme.bg
            )}
        >
            <CardContent className="p-4 space-y-3">
                {/* Header: Badge + Icon */}
                <div className="flex items-start justify-between">
                    <span className="text-[9px] font-medium uppercase px-2 py-0.5 rounded-full border border-gray-200 text-gray-400">
                        Coming Soon
                    </span>
                    <div className="p-1.5 rounded-lg bg-gray-100/50">
                        <Icon className={cn('h-4 w-4', asset.colorScheme.icon)} />
                    </div>
                </div>

                {/* Asset Name */}
                <div>
                    <h3 className={cn('font-semibold text-sm', asset.colorScheme.text)}>
                        {asset.name}
                    </h3>
                    <p className="text-[10px] text-gray-300">{asset.subtitle}</p>
                </div>

                {/* Placeholder TVL */}
                <div>
                    <p className="text-xl font-bold text-gray-300">--</p>
                    <p className="text-[9px] text-gray-300 uppercase">Total Supplied</p>
                </div>

                {/* Placeholder Bar */}
                <div className="space-y-1">
                    <div className="h-1.5 w-full bg-gray-200 rounded-full" />
                    <p className="text-[9px] text-gray-300">Expansion planned</p>
                </div>
            </CardContent>
        </Card>
    );
});
PlaceholderRWACard.displayName = 'PlaceholderRWACard';

interface RWAMarketGridProps {
    className?: string;
    activeCollateralUsd: string | null; // USD value of AcUSDY collateral
    totalBorrow: string | null; // USDC borrowed against collateral
    capacityUsed: number | null; // LTV/LLTV as % (0-100, for progress bar); null = loading
    currentLtv: number | null; // raw LTV % (for Est. label); null = loading
    isLoading: boolean;
}

/**
 * RWAMarketGrid - displays 4 RWA asset class cards showing collateral composition.
 * Short-Term Yield (AcUSDY) shows live collateral metrics from radar positions;
 * others are placeholders for future expansion. Responsive: 2x2 on mobile, 4-across on desktop.
 */
export const RWAMarketGrid = React.memo<RWAMarketGridProps>(({
    className,
    activeCollateralUsd,
    totalBorrow,
    capacityUsed,
    currentLtv,
    isLoading,
}) => {
    return (
        <Card className={cn('shadow-soft-xl bg-white', className)}>
            <CardHeader className="pb-2">
                <CardTitle className="text-sm font-bold text-brand-muted uppercase tracking-wider">
                    Collateral Composition
                </CardTitle>
            </CardHeader>
            <CardContent className="pt-2">
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    {ASSET_CLASSES.map((asset) =>
                        asset.id === 'short-term-yield' ? (
                            <ActiveRWACard
                                key={asset.id}
                                asset={asset}
                                collateralUsd={activeCollateralUsd}
                                debtBacked={totalBorrow}
                                capacityUsed={capacityUsed}
                                currentLtv={currentLtv}
                                isLoading={isLoading}
                            />
                        ) : (
                            <PlaceholderRWACard key={asset.id} asset={asset} />
                        )
                    )}
                </div>
            </CardContent>
        </Card>
    );
});
RWAMarketGrid.displayName = 'RWAMarketGrid';
