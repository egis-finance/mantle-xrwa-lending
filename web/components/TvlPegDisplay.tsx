'use client'
import { useTvlPeg } from '@/hooks/useTvlPeg'
import { formatTvl } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Layers, RefreshCw, Lock, Coins } from 'lucide-react'

export function TvlPegDisplay() {
  const { mantle, ethereum, isLoading, isRefetching, refetch } = useTvlPeg()

  // Architecture: 
  // Mantle (CollateralLocker) holds Locked USDY.
  // Ethereum (Morpho) holds AcUSDY (collateral for borrowing).
  // These represent the total protocol TVL split across two chains.
  // There is no "balance" requirement - users can lock as much USDY as they want.
  
  const mantleVal = mantle.value ? parseFloat(mantle.value) : 0
  const ethVal = ethereum.value ? parseFloat(ethereum.value) : 0
  const totalTvl = mantleVal + ethVal

  // Calculate percentages for the visual bar
  const mantlePercent = totalTvl > 0 ? (mantleVal / totalTvl) * 100 : 0
  const ethPercent = totalTvl > 0 ? (ethVal / totalTvl) * 100 : 0

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

        {/* Visual Bar Graph */}
        <div className="relative h-12 w-full flex rounded-xl overflow-hidden mb-6 bg-gray-50 ring-1 ring-gray-100">
            {/* Mantle Segment */}
            <div 
                className="h-full bg-mantle/10 relative group/mantle transition-all duration-1000 ease-out border-r border-white/50"
                style={{ width: `${mantlePercent}%` }}
            >
                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover/mantle:opacity-100 transition-opacity">
                    <span className="text-[10px] font-bold text-mantle bg-white/90 px-2 py-1 rounded-full shadow-sm">
                        {mantlePercent.toFixed(1)}%
                    </span>
                </div>
                {/* Pattern overlay */}
                <div className="absolute inset-0 opacity-10 bg-[radial-gradient(#000_1px,transparent_1px)] [background-size:8px_8px]"></div>
            </div>

            {/* Ethereum Segment */}
            <div 
                className="h-full bg-eth/10 relative group/eth transition-all duration-1000 ease-out"
                style={{ width: `${ethPercent}%` }}
            >
                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover/eth:opacity-100 transition-opacity">
                    <span className="text-[10px] font-bold text-eth bg-white/90 px-2 py-1 rounded-full shadow-sm">
                        {ethPercent.toFixed(1)}%
                    </span>
                </div>
                 {/* Pattern overlay */}
                 <div className="absolute inset-0 opacity-10 bg-[radial-gradient(#000_1px,transparent_1px)] [background-size:8px_8px]"></div>
            </div>
        </div>

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
}

