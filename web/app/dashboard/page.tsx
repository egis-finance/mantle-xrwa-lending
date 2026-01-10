'use client';

import React from 'react';
import { Navbar } from '@/components/Navbar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { TvlPegDisplay } from '@/components/TvlPegDisplay';
import { Activity, RefreshCw, Info, ShieldCheck, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { useSystemParams } from '@/hooks/useSystemParams';
import { useDynamicWallet } from '@/hooks/useDynamicWallet';
import { useBorrowerDebt } from '@/hooks/useBorrowerDebt';
import { useLoanHealth } from '@/hooks/useLoanHealth';
import { MyPosition } from '@/components/MyPosition';
import { formatTvl } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useReleaseQueue } from '@/hooks/useReleaseQueue';
import { useLiquidationRadar, type BorrowerPosition } from '@/hooks/useLiquidationRadar';
import { useChainAbstracted } from '@/hooks/useChainAbstracted';
import { contracts, MANTLE_CHAIN_ID, ETHEREUM_CHAIN_ID } from '@/lib/contracts';
import { CollateralLockerAbi } from '@/lib/contracts/abis/CollateralLocker';
import { MorphoAbi } from '@/lib/contracts/abis/Morpho';

export default function DashboardPage() {
    const { address: userAddress, isConnected } = useDynamicWallet();
    const systemParams = useSystemParams();
    const borrowerDebt = useBorrowerDebt(userAddress);
    const loanHealth = useLoanHealth(userAddress, { lltv: systemParams.lltv ?? 0.86 });
    
    const { requests, isLoading: isQueueLoading, refetch: refetchQueue } = useReleaseQueue();
    const { positions: radarPositions, isLoading: isRadarLoading, refetch: refetchRadar } = useLiquidationRadar(systemParams.lltv ?? 0.86);
    const { signOnMantle, executeOnEthereum, waitForTransaction } = useChainAbstracted();
    
    const [processingId, setProcessingId] = React.useState<string | null>(null);
    const [processError, setProcessError] = React.useState<string | null>(null);
    
    const [liquidatingId, setLiquidatingId] = React.useState<string | null>(null);
    const [liqError, setLiquidatingError] = React.useState<string | null>(null);

    const handleProcessRelease = async (borrower: string, amount: bigint, lockId: string) => {
        try {
            setProcessingId(borrower);
            setProcessError(null);
            
            const hash = await signOnMantle({
                address: contracts.collateralLocker.address,
                abi: CollateralLockerAbi,
                functionName: 'unlock',
                args: [borrower, amount, lockId],
            });
            
            await waitForTransaction(MANTLE_CHAIN_ID, hash);
            await refetchQueue();
        } catch (err) {
            console.error('Release failed:', err);
            setProcessError(err instanceof Error ? err.message : 'Processing failed');
        } finally {
            setProcessingId(null);
        }
    };

    const handleLiquidate = async (position: BorrowerPosition) => {
        if (!systemParams.marketParams) return;
        
        try {
            setLiquidatingId(position.borrower);
            setLiquidatingError(null);

            // 1. Approve Morpho to spend USDC (liquidator pays debt)
            // Note: In a real bot this would be atomic, but here we do it simply
            const approveHash = await executeOnEthereum({
                address: contracts.usdc.address,
                abi: [{ name: 'approve', type: 'function', inputs: [{ name: 's', type: 'address' }, { name: 'a', type: 'uint256' }], outputs: [{ type: 'bool' }] }],
                functionName: 'approve',
                args: [contracts.morpho.address, position.debtRaw],
            });
            await waitForTransaction(ETHEREUM_CHAIN_ID, approveHash);

            // 2. Trigger liquidation on Morpho Blue
            const hash = await executeOnEthereum({
                address: contracts.morpho.address,
                abi: MorphoAbi,
                functionName: 'liquidate',
                args: [
                    systemParams.marketParams,
                    position.borrower,
                    position.collateralRaw, // seize all collateral
                    position.debtRaw,       // repay all debt
                    '0x'                    // no callback data
                ],
            });
            
            await waitForTransaction(ETHEREUM_CHAIN_ID, hash);
            await refetchRadar();
        } catch (err) {
            console.error('Liquidation failed:', err);
            setLiquidatingError(err instanceof Error ? err.message : 'Liquidation failed');
        } finally {
            setLiquidatingId(null);
        }
    };
    
    return (
        <div className="min-h-screen bg-slate-50/50 flex flex-col relative overflow-hidden">
            {/* Decorative background elements */}
            <div className="absolute top-0 left-0 w-full h-96 bg-gradient-to-b from-brand-light/30 to-transparent pointer-events-none z-0"></div>
            <div className="absolute -top-24 -right-24 w-96 h-96 bg-blue-100/40 rounded-full blur-3xl pointer-events-none z-0"></div>
            <div className="absolute top-48 -left-24 w-72 h-72 bg-emerald-100/30 rounded-full blur-3xl pointer-events-none z-0"></div>

            <Navbar />

            <main className="flex-1 container max-w-screen-2xl py-8 space-y-6 relative z-10">
                {/* Header */}
                <div className="flex flex-col gap-2">
                    <h1 className="text-3xl font-serif font-bold text-brand-dark bg-clip-text text-transparent bg-gradient-to-r from-brand-dark to-brand-DEFAULT w-fit">Mission Control</h1>
                    <p className="text-brand-muted">System monitoring and risk management operations.</p>
                </div>

                {/* Global Health Bar */}
                <div className="grid lg:grid-cols-[2fr_1fr] gap-6">
                    <Card className="border-l-4 border-l-success-DEFAULT shadow-soft-xl bg-gradient-to-r from-white via-white to-emerald-50/30">
                        <CardContent className="p-6 flex flex-wrap items-center gap-6 h-full">
                            <div className="flex-1 min-w-[300px]">
                                <TvlPegDisplay />
                            </div>
                        </CardContent>
                    </Card>

                    <MyPosition title="All Positions" />
                </div>

                {/* Main Ops Tables */}
                <div className="grid lg:grid-cols-[3fr_2fr] gap-6">

                    {/* Liquidation Radar */}
                    <Card className="overflow-hidden border-t-4 border-t-brand-DEFAULT shadow-md hover:shadow-lg transition-shadow bg-gradient-to-br from-white to-slate-50">
                        <CardHeader className="flex flex-row items-center justify-between border-b border-gray-100 bg-white/50 backdrop-blur-sm">
                            <CardTitle className="text-lg flex items-center gap-2 text-brand-dark">
                                <div className="p-1.5 rounded-lg bg-brand-light/50 text-brand-DEFAULT">
                                    <Activity className="h-5 w-5" />
                                </div>
                                Liquidation Radar
                            </CardTitle>
                            <div className="flex items-center gap-2">
                                {isRadarLoading && <Loader2 className="h-4 w-4 animate-spin text-brand-DEFAULT" />}
                                <Button 
                                    variant="outline" 
                                    size="sm" 
                                    onClick={() => refetchRadar()}
                                    className="hover:bg-brand-light/20 border-brand-light text-brand-muted hover:text-brand-DEFAULT group transition-colors"
                                >
                                    <RefreshCw className="h-4 w-4 group-hover:rotate-180 transition-transform duration-500" />
                                </Button>
                            </div>
                        </CardHeader>
                        <CardContent className="p-0">
                            <div className="overflow-hidden">
                                <table className="w-full text-sm text-left">
                                    <thead className="bg-gray-50/80 text-brand-muted font-medium uppercase text-xs border-b border-gray-100">
                                        <tr>
                                            <th className="p-4">Borrower Address</th>
                                            <th className="p-4">Health Factor</th>
                                            <th className="p-4">Debt</th>
                                            <th className="p-4 text-right">Action</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-50">
                                        {radarPositions.length === 0 && !isRadarLoading ? (
                                            <tr>
                                                <td colSpan={4} className="p-8 text-center text-brand-muted italic">No active borrowers found</td>
                                            </tr>
                                        ) : (
                                            radarPositions.map((pos) => (
                                                <tr key={pos.borrower} className="bg-white hover:bg-blue-50/30 transition-colors group">
                                                    <td className="p-4 font-mono text-brand-dark group-hover:text-brand-DEFAULT transition-colors">
                                                        {pos.borrower.slice(0, 6)}...{pos.borrower.slice(-4)}
                                                        {pos.borrower === userAddress && (
                                                            <span className="ml-2 inline-block px-1.5 py-0.5 rounded text-[8px] bg-brand-DEFAULT text-white uppercase tracking-tighter">You</span>
                                                        )}
                                                    </td>
                                                    <td className={cn(
                                                        "p-4 font-bold bg-success-light/5 rounded-r-lg",
                                                        pos.riskLevel === 'liquidatable' ? "text-danger-DEFAULT animate-pulse" :
                                                        pos.riskLevel === 'danger' ? "text-danger-DEFAULT" :
                                                        pos.riskLevel === 'warning' ? "text-warning-DEFAULT" :
                                                        "text-success-DEFAULT"
                                                    )}>
                                                        {pos.healthFactor ? pos.healthFactor.toFixed(2) : '--'}
                                                    </td>
                                                    <td className="p-4 font-bold text-brand-dark">${pos.debtValue}</td>
                                                    <td className="p-4 text-right">
                                                        {liquidatingId === pos.borrower ? (
                                                            <Button size="sm" disabled className="bg-danger-DEFAULT text-white opacity-70">
                                                                <Loader2 className="h-3 w-3 animate-spin mr-2" />
                                                                Liquidating
                                                            </Button>
                                                        ) : pos.riskLevel === 'liquidatable' ? (
                                                            <Button 
                                                                size="sm" 
                                                                variant="destructive" 
                                                                onClick={() => handleLiquidate(pos)}
                                                                className="h-8 hover:bg-red-700 transition-all shadow-sm hover:shadow-red-200 hover:scale-105 active:scale-95"
                                                            >
                                                                Trigger Liq
                                                            </Button>
                                                        ) : (
                                                            <span className="inline-block px-2 py-0.5 rounded text-[10px] bg-brand-light/20 text-brand-DEFAULT font-medium border border-brand-light shadow-sm">Safe</span>
                                                        )}
                                                    </td>
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                </table>
                                {liqError && (
                                    <div className="p-3 m-4 rounded-lg bg-red-50 border border-red-100 flex items-center gap-2 text-xs text-danger-DEFAULT">
                                        <AlertCircle className="h-3 w-3" />
                                        {liqError}
                                        <button onClick={() => setLiquidatingError(null)} className="ml-auto underline">Dismiss</button>
                                    </div>
                                )}
                            </div>
                        </CardContent>
                    </Card>

                    {/* Release Queue */}
                    <Card className="border-t-4 border-t-purple-500 shadow-md bg-gradient-to-br from-white to-purple-50/20">
                        <CardHeader className="border-b border-gray-100 bg-white/50 backdrop-blur-sm">
                            <div className="flex items-center justify-between">
                                <CardTitle className="text-lg text-purple-900 flex items-center gap-2">
                                    <div className="p-1.5 rounded-lg bg-purple-100 text-purple-600">
                                        <Activity className="h-5 w-5 rotate-90" />
                                    </div>
                                    Release Queue
                                </CardTitle>
                                {isQueueLoading && <Loader2 className="h-4 w-4 animate-spin text-purple-600" />}
                            </div>
                        </CardHeader>
                        <CardContent className="p-6">
                            <div className="space-y-4">
                                {requests.length === 0 && !isQueueLoading ? (
                                    <div className="text-center py-8">
                                        <p className="text-sm text-brand-muted italic">No pending releases found</p>
                                    </div>
                                ) : (
                                    requests.map((request) => (
                                        <div key={request.borrower} className="flex items-center justify-between p-4 rounded-xl border border-gray-100 bg-white shadow-sm hover:shadow-md transition-all hover:border-purple-100 group">
                                            <div className="space-y-1">
                                                <div className="flex items-center gap-2">
                                                    <p className="font-mono text-sm text-brand-dark group-hover:text-purple-700 transition-colors">
                                                        {request.borrower.slice(0, 6)}...{request.borrower.slice(-4)}
                                                    </p>
                                                    {request.borrower === userAddress && (
                                                        <span className="inline-block px-1.5 py-0.5 rounded text-[9px] bg-brand-DEFAULT text-white uppercase tracking-tighter">You</span>
                                                    )}
                                                </div>
                                                <p className="text-xs text-gray-500">
                                                    Locked: <span className="font-bold text-gray-900">{request.lockedAmount} USDY</span>
                                                </p>
                                                {request.status === 'waiting' && (
                                                    <p className="text-[10px] text-amber-600 flex items-center gap-1">
                                                        <AlertCircle className="h-3 w-3" />
                                                        Repayment pending on Ethereum
                                                    </p>
                                                )}
                                            </div>
                                            
                                            {processingId === request.borrower ? (
                                                <Button size="sm" disabled className="bg-purple-100 text-purple-600 border-purple-200">
                                                    <Loader2 className="h-3 w-3 animate-spin mr-2" />
                                                    Processing
                                                </Button>
                                            ) : request.status === 'ready' ? (
                                                <Button 
                                                    size="sm" 
                                                    variant="outline" 
                                                    onClick={() => handleProcessRelease(request.borrower, request.lockedAmountRaw, request.lastLockId)}
                                                    className="text-purple-600 border-purple-200 hover:bg-purple-50 hover:border-purple-300 transition-all hover:scale-105 active:scale-95"
                                                >
                                                    Process Release
                                                </Button>
                                            ) : (
                                                <Button size="sm" disabled variant="secondary" className="bg-gray-100 text-gray-400">
                                                    Waiting...
                                                </Button>
                                            )}
                                        </div>
                                    ))
                                )}
                                {processError && (
                                    <div className="p-3 rounded-lg bg-red-50 border border-red-100 flex items-center gap-2 text-xs text-danger-DEFAULT">
                                        <AlertCircle className="h-3 w-3" />
                                        {processError}
                                        <button onClick={() => setProcessError(null)} className="ml-auto underline">Dismiss</button>
                                    </div>
                                )}
                            </div>
                        </CardContent>
                    </Card>

                </div>

                {/* System Parameters - Horizontal Layout */}
                <Card className="shadow-lg">
                    <CardHeader className="pb-4 border-b border-gray-100 bg-gray-50/30">
                        <CardTitle className="text-xl font-bold flex items-center gap-2">
                            <RefreshCw className="h-5 w-5 text-brand-DEFAULT" />
                            System Parameters
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="p-6">
                        {systemParams.isLoading && !systemParams.lltvPercentage ? (
                            <div className="flex items-center justify-center py-12">
                                <RefreshCw className="h-6 w-6 animate-spin text-brand-DEFAULT" />
                                <span className="ml-3 text-sm font-medium text-brand-muted">Loading parameters...</span>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                {/* Max LTV */}
                                <div className="flex items-center gap-4 p-4 rounded-xl bg-blue-50/50 border border-blue-100 hover:shadow-md transition-all duration-300 hover:-translate-y-0.5 group h-24">
                                    <div className="relative w-12 h-12 flex-shrink-0">
                                        <svg className="transform -rotate-90 w-12 h-12">
                                            <circle cx="24" cy="24" r="20" stroke="#e0e7ff" strokeWidth="4" fill="none" />
                                            <circle
                                                cx="24" cy="24" r="20"
                                                stroke="#3b82f6"
                                                strokeWidth="4"
                                                fill="none"
                                                strokeDasharray={`${((systemParams.lltv ?? 0) * 125.6)} 125.6`}
                                                strokeLinecap="round"
                                                className="transition-all duration-700"
                                            />
                                        </svg>
                                        <div className="absolute inset-0 flex items-center justify-center">
                                            <span className="text-xs font-bold text-blue-700">{systemParams.lltvPercentage ?? '--'}</span>
                                        </div>
                                    </div>
                                    <div className="flex flex-col">
                                        <div className="flex items-center gap-1.5">
                                            <p className="text-xs text-blue-600 uppercase font-bold tracking-wider">Max LTV</p>
                                            <div className="group/info relative">
                                                <Info className="h-3 w-3 text-blue-400 cursor-help" />
                                                <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 w-52 p-3 bg-gray-900 text-white text-xs rounded-lg shadow-2xl opacity-0 invisible group-hover/info:opacity-100 group-hover/info:visible transition-all z-50">
                                                    <p className="font-semibold mb-1">Max LTV (LLTV)</p>
                                                    <p className="text-white/80 text-[10px]">Maximum loan-to-value ratio from Morpho Blue</p>
                                                </div>
                                            </div>
                                        </div>
                                        <p className="text-[10px] text-blue-400/80">Loan to Value</p>
                                    </div>
                                </div>

                                {/* Utilization */}
                                <div className="flex items-center gap-4 p-4 rounded-xl bg-emerald-50/50 border border-emerald-100 hover:shadow-md transition-all duration-300 hover:-translate-y-0.5 group h-24">
                                    <div className="relative w-12 h-12 flex-shrink-0">
                                        <svg className="transform -rotate-90 w-12 h-12">
                                            <circle cx="24" cy="24" r="20" stroke="#d1fae5" strokeWidth="4" fill="none" />
                                            <circle
                                                cx="24" cy="24" r="20"
                                                stroke={systemParams.utilizationRate && systemParams.utilizationRate > 90 ? "#f59e0b" : "#10b981"}
                                                strokeWidth="4"
                                                fill="none"
                                                strokeDasharray={`${((systemParams.utilizationRate || 0) / 100) * 125.6} 125.6`}
                                                strokeLinecap="round"
                                                className="transition-all duration-700"
                                            />
                                        </svg>
                                        <div className="absolute inset-0 flex items-center justify-center">
                                            <span className={`text-xs font-bold ${systemParams.utilizationRate && systemParams.utilizationRate > 90 ? 'text-orange-600' : 'text-emerald-600'}`}>
                                                {systemParams.utilizationRate?.toFixed(0) || 0}%
                                            </span>
                                        </div>
                                    </div>
                                    <div className="flex flex-col">
                                        <div className="flex items-center gap-1.5">
                                            <p className="text-xs text-emerald-600 uppercase font-bold tracking-wider">Util. Rate</p>
                                            <div className="group/info relative">
                                                <Info className="h-3 w-3 text-emerald-400 cursor-help" />
                                                <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 w-52 p-3 bg-gray-900 text-white text-xs rounded-lg shadow-2xl opacity-0 invisible group-hover/info:opacity-100 group-hover/info:visible transition-all z-50">
                                                    <p className="font-semibold mb-1">Utilization Rate</p>
                                                    <p className="text-white/80 text-[10px]">Percentage of supplied capital currently borrowed</p>
                                                </div>
                                            </div>
                                        </div>
                                        <p className="text-[10px] text-emerald-400/80">Capital Usage</p>
                                    </div>
                                </div>

                                {/* Oracle Status */}
                                <div className="flex items-center gap-4 p-4 rounded-xl bg-purple-50/50 border border-purple-100 hover:shadow-md transition-all duration-300 hover:-translate-y-0.5 group h-24">
                                    <div className="w-12 h-12 flex items-center justify-center flex-shrink-0">
                                        {systemParams.oracleIsStale === false ? (
                                            <div className="relative flex items-center justify-center">
                                                <span className="absolute animate-ping h-8 w-8 rounded-full bg-emerald-400 opacity-30"></span>
                                                <span className="relative h-10 w-10 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center border-2 border-emerald-200">
                                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                                    </svg>
                                                </span>
                                            </div>
                                        ) : (
                                            <span className="h-10 w-10 rounded-full bg-gray-100 text-gray-400 flex items-center justify-center border-2 border-gray-200">
                                                <span className="text-sm font-bold">?</span>
                                            </span>
                                        )}
                                    </div>
                                    <div className="flex flex-col">
                                        <div className="flex items-center gap-1.5">
                                            <p className="text-xs text-purple-600 uppercase font-bold tracking-wider">Oracle</p>
                                            <div className="group/info relative">
                                                <Info className="h-3 w-3 text-purple-400 cursor-help" />
                                                <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 w-52 p-3 bg-gray-900 text-white text-xs rounded-lg shadow-2xl opacity-0 invisible group-hover/info:opacity-100 group-hover/info:visible transition-all z-50">
                                                    <p className="font-semibold mb-1">Oracle Status</p>
                                                    <p className="text-white/80 text-[10px]">Price feed freshness indicator</p>
                                                </div>
                                            </div>
                                        </div>
                                        <p className="text-[10px] text-purple-400/80">Feed Health</p>
                                    </div>
                                </div>

                                {/* Available Liquidity */}
                                <div className="flex items-center gap-4 p-4 rounded-xl bg-gray-50 border border-gray-100 hover:shadow-md transition-all duration-300 hover:-translate-y-0.5 group h-24">
                                    <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0 border border-gray-200">
                                        <span className="text-gray-500 font-serif font-bold">$</span>
                                    </div>
                                    <div className="flex flex-col">
                                        <div className="flex items-center gap-1.5">
                                            <p className="text-xs text-gray-500 uppercase font-bold tracking-wider">Liquidity</p>
                                            <div className="group/info relative">
                                                <Info className="h-3 w-3 text-gray-400 cursor-help" />
                                                <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 w-52 p-3 bg-gray-900 text-white text-xs rounded-lg shadow-2xl opacity-0 invisible group-hover/info:opacity-100 group-hover/info:visible transition-all z-50">
                                                    <p className="font-semibold mb-1">Available Liquidity</p>
                                                    <p className="text-white/80 text-[10px]">Amount of USDC available to borrow</p>
                                                </div>
                                            </div>
                                        </div>
                                        <p className="text-lg font-bold text-gray-700 leading-none mt-0.5">
                                            {systemParams.availableLiquidity ? formatTvl(systemParams.availableLiquidity) : '$0'}
                                        </p>
                                    </div>
                                </div>

                                {/* Liquidation Bonus */}
                                <div className="flex items-center gap-4 p-4 rounded-xl bg-amber-50/50 border border-amber-100 hover:shadow-md transition-all duration-300 hover:-translate-y-0.5 group h-24">
                                    <div className="w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0 border border-amber-200">
                                        <Activity className="h-5 w-5 text-amber-600" />
                                    </div>
                                    <div className="flex flex-col">
                                        <div className="flex items-center gap-1.5">
                                            <p className="text-xs text-amber-600 uppercase font-bold tracking-wider">Liq. Bonus</p>
                                            <div className="group/info relative">
                                                <Info className="h-3 w-3 text-amber-400 cursor-help" />
                                                <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 w-52 p-3 bg-gray-900 text-white text-xs rounded-lg shadow-2xl opacity-0 invisible group-hover/info:opacity-100 group-hover/info:visible transition-all z-50">
                                                    <p className="font-semibold mb-1">Liquidation Bonus</p>
                                                    <p className="text-white/80 text-[10px]">Bonus percentage awarded to liquidators</p>
                                                </div>
                                            </div>
                                        </div>
                                        <p className="text-lg font-bold text-amber-700 leading-none mt-0.5">{systemParams.liquidationBonusPercentage ?? '0%'}</p>
                                    </div>
                                </div>

                                {/* Oracle Haircut */}
                                <div className="flex items-center gap-4 p-4 rounded-xl bg-indigo-50/50 border border-indigo-100 hover:shadow-md transition-all duration-300 hover:-translate-y-0.5 group h-24">
                                    <div className="w-12 h-12 rounded-full bg-indigo-100 flex items-center justify-center flex-shrink-0 border border-indigo-200">
                                        <ShieldCheck className="h-5 w-5 text-indigo-600" />
                                    </div>
                                    <div className="flex flex-col">
                                        <div className="flex items-center gap-1.5">
                                            <p className="text-xs text-indigo-600 uppercase font-bold tracking-wider">Haircut</p>
                                            <div className="group/info relative">
                                                <Info className="h-3 w-3 text-indigo-400 cursor-help" />
                                                <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 w-52 p-3 bg-gray-900 text-white text-xs rounded-lg shadow-2xl opacity-0 invisible group-hover/info:opacity-100 group-hover/info:visible transition-all z-50">
                                                    <p className="font-semibold mb-1">Oracle Haircut</p>
                                                    <p className="text-white/80 text-[10px]">Safety margin applied to collateral price</p>
                                                </div>
                                            </div>
                                        </div>
                                        <p className="text-lg font-bold text-indigo-700 leading-none mt-0.5">
                                            {systemParams.oracleHaircutPercentage !== null ? `${systemParams.oracleHaircutPercentage}%` : '2%'}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        )}
                    </CardContent>
                </Card>

            </main>
        </div>
    );
}
