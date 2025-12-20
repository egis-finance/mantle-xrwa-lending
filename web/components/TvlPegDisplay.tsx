'use client'
import { useTvlPeg } from '@/hooks/useTvlPeg'
import { formatTvl } from '@/lib/format'
import { cn } from '@/lib/utils'
import { ArrowLeftRight, CheckCircle2, AlertTriangle, RefreshCw } from 'lucide-react'

export function TvlPegDisplay() {
  const { mantle, ethereum, isLoading, isError, isBalanced, isRefetching, refetch } = useTvlPeg()

  // Calculate deviation percentage
  // If balanced within 0.01%, deviation is ~0
  // Formula: (Mantle - Eth) / Mantle * 100
  const mantleVal = mantle.value ? parseFloat(mantle.value) : 0
  const ethVal = ethereum.value ? parseFloat(ethereum.value) : 0
  
  const diff = mantleVal - ethVal
  const deviationPercent = mantleVal > 0 ? (Math.abs(diff) / mantleVal) * 100 : 0
  
  // Calculate visual position for the slider (0 to 100)
  // 50 is perfectly balanced
  // If mantle > eth, slider moves right (or left depending on metaphor). 
  // Let's say Center is 50. 
  // Ratio: Eth / Mantle. Target is 1.0
  // Visual Range: 0.8 to 1.2 (+/- 20% deviation max visually)
  const ratio = mantleVal > 0 ? ethVal / mantleVal : 1
  // limit visual deviation to +/- 10% for the bar
  const visualDeviation = Math.max(-10, Math.min(10, (ratio - 1) * 100))
  // Map -10..10 to 0..100 (50 is center)
  // -10 -> 0, 0 -> 50, 10 -> 100
  const sliderPosition = 50 + (visualDeviation * 5)

  return (
    <div className="flex flex-col gap-4 w-full">
      {/* Header Row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
            <h3 className="text-sm font-bold text-brand-dark uppercase tracking-wide">TVL Peg Stability</h3>
             {isBalanced && !isLoading && (
                <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-100">
                    <CheckCircle2 className="h-3 w-3" /> Synced
                </span>
             )}
             {!isBalanced && !isLoading && !isError && (
                <span className="flex items-center gap-1 text-[10px] font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-100 animate-pulse">
                    <AlertTriangle className="h-3 w-3" /> Deviation: {deviationPercent.toFixed(3)}%
                </span>
             )}
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
      <div className="relative p-5 rounded-2xl bg-gradient-to-b from-white to-gray-50 border border-gray-200 shadow-sm overflow-hidden group hover:shadow-md transition-all duration-500">
        
        {/* Background Grid Lines */}
        <div className="absolute inset-0 opacity-[0.03] pointer-events-none" 
             style={{ backgroundImage: 'linear-gradient(#000 1px, transparent 1px), linear-gradient(90deg, #000 1px, transparent 1px)', backgroundSize: '20px 20px' }}>
        </div>

        {/* Main Flex Row */}
        <div className="relative flex justify-between items-end mb-6 z-10">
            {/* Mantle Side (Left) */}
            <div className="flex flex-col items-start">
                <div className="flex items-center gap-1.5 mb-1 opacity-80">
                     <div className="w-2 h-2 rounded-full bg-mantle"></div>
                     <span className="text-xs font-semibold text-brand-muted uppercase">Mantle</span>
                </div>
                <div className="flex items-baseline gap-1">
                    <span className="text-xl font-bold text-brand-dark font-mono tracking-tight">
                        {isLoading ? '...' : formatTvl(mantle.value)}
                    </span>
                    <span className="text-[10px] font-medium text-brand-muted">USDY</span>
                </div>
            </div>

            {/* Middle Icon */}
            <div className="mb-1">
                <div className={cn(
                    "p-2 rounded-full border-2 transition-colors duration-500",
                    isBalanced ? "bg-emerald-50 border-emerald-100" : "bg-amber-50 border-amber-100"
                )}>
                    <ArrowLeftRight className={cn(
                        "h-4 w-4 transition-colors duration-500",
                        isBalanced ? "text-emerald-500" : "text-amber-500"
                    )} />
                </div>
            </div>

            {/* Ethereum Side (Right) */}
            <div className="flex flex-col items-end">
                <div className="flex items-center gap-1.5 mb-1 opacity-80">
                     <span className="text-xs font-semibold text-brand-muted uppercase">Ethereum</span>
                     <div className="w-2 h-2 rounded-full bg-eth"></div>
                </div>
                <div className="flex items-baseline gap-1">
                    <span className="text-xl font-bold text-brand-dark font-mono tracking-tight">
                        {isLoading ? '...' : formatTvl(ethereum.value)}
                    </span>
                    <span className="text-[10px] font-medium text-brand-muted">AcUSDY</span>
                </div>
            </div>
        </div>

        {/* Balance Scale Bar */}
        <div className="relative h-2 w-full bg-gray-100 rounded-full overflow-hidden shadow-inner">
            {/* Center Marker */}
            <div className="absolute left-1/2 top-0 bottom-0 w-0.5 bg-gray-300 -translate-x-1/2 z-0"></div>
            
            {/* Success Zone (Middle) */}
            <div className="absolute left-1/2 top-0 bottom-0 w-[20%] bg-emerald-500/10 -translate-x-1/2 z-0"></div>

            {/* Animated Indicator Bar */}
            <div 
                className={cn(
                    "absolute top-0 bottom-0 w-[40px] h-full rounded-full shadow-sm transition-all duration-1000 ease-out z-10",
                    isBalanced ? "bg-emerald-500" : "bg-amber-500"
                )}
                style={{ 
                    left: `${sliderPosition}%`, 
                    transform: 'translateX(-50%)' 
                }}
            ></div>
        </div>

        {/* Labels under bar */}
        <div className="flex justify-between mt-2 text-[10px] font-medium text-brand-muted/60 uppercase tracking-wider">
            <span>Heavy USDY</span>
            <span>Balanced</span>
            <span>Heavy AcUSDY</span>
        </div>

      </div>
    </div>
  )
}
