'use client'
import { Link as LinkIcon, AlertTriangle, Loader2, RefreshCw } from 'lucide-react'
import { useTvlPeg } from '@/hooks/useTvlPeg'
import { formatTvl } from '@/lib/format'

export function TvlPegDisplay() {
  const { mantle, ethereum, isLoading, isError, isBalanced, isRefetching, refetch } = useTvlPeg()

  const renderStatus = () => {
    if (isLoading) {
      return (
        <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-brand-light/30 text-brand-muted text-sm">
          <Loader2 className="h-3 w-3 animate-spin" />
          Loading
        </span>
      )
    }
    if (isError) {
      return (
        <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-danger-DEFAULT/10 text-danger-DEFAULT text-sm">
          <AlertTriangle className="h-3 w-3" />
          Error
        </span>
      )
    }
    if (isBalanced) {
      return (
        <span className="px-3 py-1 rounded-full bg-success-DEFAULT/10 text-success-DEFAULT text-sm">
          System Balanced
        </span>
      )
    }
    return (
      <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-danger-DEFAULT/10 text-danger-DEFAULT text-sm">
        <AlertTriangle className="h-3 w-3" />
        Peg Deviation
      </span>
    )
  }

  return (
    <div className="flex items-center justify-between">
      <div className="space-y-1">
        <p className="text-xs text-brand-muted uppercase tracking-wider">Cross-Chain TVL Peg</p>
        <div className="flex items-center gap-3">
          <span
            className="font-mono font-bold text-brand-dark"
            data-testid="mantle-tvl"
            data-value={mantle.value ?? ''}
          >
            {isLoading ? '...' : formatTvl(mantle.value)}{' '}
            <span className="text-xs font-normal">
              <span className="text-brand-dark">USDY</span>
              <span className="text-mantle"> on Mantle</span>
            </span>
          </span>
          <LinkIcon className="h-4 w-4 text-success-DEFAULT" />
          <span
            className="font-mono font-bold text-brand-dark"
            data-testid="eth-tvl"
            data-value={ethereum.value ?? ''}
          >
            {isLoading ? '...' : formatTvl(ethereum.value)}{' '}
            <span className="text-xs font-normal">
              <span className="text-brand-dark">AcUSDY</span>
              <span className="text-eth"> on Eth</span>
            </span>
          </span>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {renderStatus()}
        <button
          onClick={refetch}
          disabled={isLoading || isRefetching}
          className="p-1.5 hover:bg-brand-light/50 rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          aria-label="Refresh TVL data"
          data-testid="refresh-tvl"
        >
          <RefreshCw
            className={`h-4 w-4 text-brand-muted ${isRefetching ? 'animate-spin' : ''}`}
          />
        </button>
      </div>
    </div>
  )
}
