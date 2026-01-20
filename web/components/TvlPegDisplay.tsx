'use client'
import React from 'react'
import { useTvlPeg } from '@/hooks/useTvlPeg'
import { formatTvl } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Layers, RefreshCw, Lock, Coins, AlertTriangle } from 'lucide-react'

export const TvlPegDisplay = React.memo(function TvlPegDisplay() {
  const { mantle, ethereum, isBalanced, isLoading, isRefetching, refetch } = useTvlPeg()

  // Protocol invariant: Locked USDY on Mantle must equal AcUSDY supply on Ethereum.
  // Divergence indicates relayer lag (pending attestations) or operational issues.
  // TVL = Locked USDY (the actual collateral). AcUSDY is a 1:1 receipt on Ethereum.

  const mantleVal = parseFloat(mantle.value || '0') || 0
  const ethVal = parseFloat(ethereum.value || '0') || 0

  // TVL is the locked collateral on Mantle (not sum of both - that would double count)
  const totalTvl = mantleVal

  // Bar shows attestation coverage: what % of locked USDY has been attested as AcUSDY
  const attestedPercent = mantleVal > 0 ? Math.min((ethVal / mantleVal) * 100, 100) : 0
  const unattestedPercent = 100 - attestedPercent

  return (
    <div className="flex flex-col gap-4 w-full">
      {/* Header Row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
            <h3 className="text-sm font-bold text-brand-dark uppercase tracking-wide flex items-center gap-2">
                <Layers className="h-4 w-4 text-brand-DEFAULT" />
                Protocol TVL
            </h3>
        </div>
        
        <button
            onClick={refetch}
            disabled={isLoading || isRefetching}
            className="p-1.5 hover:bg-gray-100 rounded-md transition-all text-brand-muted hover:text-brand-dark disabled:opacity-50"
        >
            <RefreshCw className={cn("h-3.5 w-3.5", isRefetching && "animate-spin")} />
        </button>
      </div>

      {/* Visualization Card */}
      <div className="relative p-5 rounded-2xl bg-white border border-gray-100 shadow-sm overflow-hidden group hover:shadow-md transition-all duration-300">
        
        {/* Total TVL Display */}
        <div className="flex items-baseline gap-2 mb-6">
            <span className="text-3xl font-bold text-brand-dark font-serif">
                {isLoading ? '...' : formatTvl(totalTvl.toString())}
            </span>
            <span className="text-xs font-semibold text-brand-muted uppercase tracking-wider">Total Value Locked</span>
        </div>

        {/* Visual Bar Graph - shows attestation coverage */}
        <div className="relative h-10 w-full flex rounded-lg overflow-hidden mb-6 ring-1 ring-gray-200">
            {/* Attested Segment (purple - AcUSDY minted on Ethereum) */}
            <div
                className="h-full bg-[#627eea] relative transition-all duration-1000 ease-out"
                style={{ width: `${attestedPercent}%` }}
            >
                <div className="absolute inset-0 flex items-center justify-center gap-1.5">
                    <span className="text-[11px] font-medium text-white/90">Attested</span>
                    <span className="text-xs font-bold text-white">
                        {attestedPercent.toFixed(0)}%
                    </span>
                </div>
            </div>

            {/* Unattested Segment (gray - locked but not yet attested) */}
            {unattestedPercent > 0 && (
                <div
                    className="h-full bg-gray-300 relative transition-all duration-1000 ease-out"
                    style={{ width: `${unattestedPercent}%` }}
                >
                    <div className="absolute inset-0 flex items-center justify-center gap-1.5">
                        <span className="text-[11px] font-medium text-gray-600">Pending</span>
                        <span className="text-xs font-bold text-gray-600">
                            {unattestedPercent.toFixed(0)}%
                        </span>
                    </div>
                </div>
            )}
        </div>

        {/* Peg Divergence Warning */}
        {isBalanced === false && (
          <div className="flex items-start gap-2 p-3 mb-4 bg-warning-light/20 rounded-lg border border-warning-DEFAULT/30">
            <AlertTriangle className="h-4 w-4 text-warning-DEFAULT flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-warning-DEFAULT">
                Cross-chain peg divergence detected
              </p>
              <p className="text-xs text-warning-DEFAULT/80 mt-0.5">
                Locked USDY exceeds AcUSDY supply. This may indicate pending attestations or relayer lag.
              </p>
            </div>
          </div>
        )}

        {/* Detailed Breakdown */}
        <div className="grid grid-cols-2 gap-8">
            {/* Mantle Detail */}
            <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2 mb-1">
                    <div className="p-1.5 rounded-lg bg-mantle/10 text-mantle">
                        <Lock className="h-3.5 w-3.5" />
                    </div>
                    <span className="text-xs font-bold text-brand-dark">Locked USDY</span>
                </div>
                <div className="pl-8">
                    <p className="text-lg font-mono font-bold text-brand-dark leading-none mb-0.5">
                        {isLoading ? '...' : formatTvl(mantle.value)}
                    </p>
                    <p className="text-[10px] text-brand-muted font-medium">on Mantle Network</p>
                </div>
            </div>

             {/* Ethereum Detail */}
             <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2 mb-1">
                    <div className="p-1.5 rounded-lg bg-eth/10 text-eth">
                        <Coins className="h-3.5 w-3.5" />
                    </div>
                    <span className="text-xs font-bold text-brand-dark">AcUSDY Supply</span>
                </div>
                <div className="pl-8">
                    <p className="text-lg font-mono font-bold text-brand-dark leading-none mb-0.5">
                        {isLoading ? '...' : formatTvl(ethereum.value)}
                    </p>
                    <p className="text-[10px] text-brand-muted font-medium">on Ethereum</p>
                </div>
            </div>
        </div>

      </div>
    </div>
  )
});

