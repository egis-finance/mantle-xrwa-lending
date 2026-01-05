'use client';

import React from 'react';
import { parseUnits, formatUnits } from 'viem';
import { Navbar } from '@/components/Navbar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { TrendingUp, Activity, Coins, Info, Loader2, CheckCircle, AlertCircle, Wallet, DollarSign } from 'lucide-react';
import { useOraclePrice } from '@/hooks/useOraclePrice';
import { useSystemParams } from '@/hooks/useSystemParams';
import { useSupplyAPY } from '@/hooks/useSupplyAPY';
import { useUSDCBalance } from '@/hooks/useUSDCBalance';
import { useSupplyUSDCAdapter } from '@/hooks/useSupplyUSDCAdapter';
import { useLenderPosition } from '@/hooks/useLenderPosition';
import { useDynamicWallet } from '@/hooks/useDynamicWallet';
import { formatTvl } from '@/lib/format';

export default function EarnPage() {
    const { address: walletAddress, isConnected } = useDynamicWallet();
    const { data: oracleData } = useOraclePrice();

    // Market state for live metrics
    const systemParams = useSystemParams();
    const supplyAPY = useSupplyAPY();

    // Lender's USDC balance and current position
    const usdcBalance = useUSDCBalance(walletAddress);
    const lenderPosition = useLenderPosition(walletAddress);
    const { supply, status: supplyStatus, statusMessage, error: supplyError, reset: resetSupply } = useSupplyUSDCAdapter();

    const [activeTab, setActiveTab] = React.useState<'supply' | 'withdraw'>('supply');
    const [amount, setAmount] = React.useState('');
    const [amountError, setAmountError] = React.useState('');

    // Available balance depends on tab: wallet USDC for supply, supplied position for withdraw
    const availableBalance = activeTab === 'supply'
        ? (usdcBalance.data?.value ?? null)
        : (lenderPosition.data?.suppliedValue ?? null);
    // Raw BigInt for exact validation (USDC 6 decimals)
    const availableBalanceRaw = activeTab === 'supply'
        ? (usdcBalance.data?.raw ?? 0n)
        : (lenderPosition.data?.suppliedRaw ?? 0n);
    const hasBalance = availableBalanceRaw > 0n;
    // Tab-aware loading: supply only needs wallet balance, withdraw only needs position
    const isLoading = activeTab === 'supply'
        ? usdcBalance.isLoading
        : lenderPosition.isLoading;
    const isProcessing = ['approving', 'supplying', 'confirming'].includes(supplyStatus);

    // Calculate estimated monthly earnings from position × APY
    const estimatedMonthlyEarnings = React.useMemo(() => {
        const position = lenderPosition.data?.suppliedValue;
        const apy = supplyAPY.apy;
        // Check for null/undefined explicitly (0 APY is valid when no borrowers)
        if (!position || apy === null || apy === undefined) return null;
        return (parseFloat(position) * apy) / 12;
    }, [lenderPosition.data?.suppliedValue, supplyAPY.apy]);

    // Utilization bar color based on rate (default to 0 if null)
    const utilizationRate = systemParams.utilizationRate ?? 0;
    const utilizationColor = utilizationRate < 50
        ? 'bg-success-DEFAULT'
        : utilizationRate < 80
            ? 'bg-yellow-500'
            : 'bg-danger-DEFAULT';

    const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value;
        setAmount(value);

        // Clear error when user types
        if (amountError) {
            setAmountError('');
        }

        // Validate
        if (value === '') {
            return;
        }

        // Validate using BigInt to avoid float precision issues at boundaries
        let inputRaw: bigint;
        try {
            inputRaw = parseUnits(value, 6);
        } catch {
            setAmountError('Please enter a valid number');
            return;
        }

        if (inputRaw <= 0n) {
            setAmountError('Amount must be greater than 0');
            return;
        }

        if (inputRaw > availableBalanceRaw) {
            setAmountError(`Amount exceeds available balance of ${formatTvl(availableBalance)}`);
            return;
        }
    };

    const handleMaxClick = () => {
        if (availableBalance) {
            setAmount(availableBalance);
            setAmountError('');
        }
    };

    const handlePercentageClick = (percentage: number) => {
        if (availableBalanceRaw > 0n) {
            // Calculate percentage in BigInt space to avoid float precision loss
            const percentageAmount = (availableBalanceRaw * BigInt(percentage)) / 100n;
            const formattedAmount = formatUnits(percentageAmount, 6);
            setAmount(formattedAmount);
            setAmountError('');
        }
    };

    const isActionDisabled = !amount || !!amountError || isLoading || !hasBalance || isProcessing || !isConnected;

    // Handle supply transaction
    const handleSupply = async () => {
        if (activeTab !== 'supply' || !amount || amountError) return;

        try {
            // Parse amount to USDC decimals (6)
            const amountBigInt = parseUnits(amount, 6);
            await supply(amountBigInt);
            setAmount(''); // Clear on success
        } catch {
            // Error handled by hook state
        }
    };

    // Status message helper - uses hook's statusMessage or fallback for errors
    const getStatusDisplay = (): string => {
        if (supplyStatus === 'error') {
            return supplyError?.message ?? 'Transaction failed';
        }
        return statusMessage;
    };

    return (
        <div className="min-h-screen bg-body-gradient flex flex-col">
            <Navbar />

            <main className="flex-1 container max-w-screen-2xl py-8 space-y-8">
                {/* Header */}
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                    <div className="flex flex-col gap-2">
                        <h1 className="text-3xl font-serif font-bold text-brand-dark">Lender Yield</h1>
                        <p className="text-brand-muted">Supply USDC to earn yield from AcUSDY-collateralized loans.</p>
                    </div>
                </div>


                {/* Market Stats Header */}
                <div className="grid md:grid-cols-3 gap-6">
                    {/* Total USDC Supplied */}
                    <Card className="border-none shadow-soft-xl bg-white relative overflow-hidden">
                        <div className="absolute top-0 right-0 p-2">
                            <span className="flex items-center gap-1 bg-success-light text-success-DEFAULT text-xs font-bold px-2 py-1 rounded-full">
                                <span className="h-1.5 w-1.5 bg-success-DEFAULT rounded-full animate-pulse" />
                                Live
                            </span>
                        </div>
                        <CardContent className="p-6 flex items-center gap-4">
                            <div className="h-12 w-12 rounded-full bg-brand-light flex items-center justify-center text-brand-DEFAULT">
                                <Coins className="h-6 w-6" />
                            </div>
                            <div>
                                <p className="text-sm font-medium text-brand-muted">Total USDC Supplied</p>
                                <p className="text-2xl font-bold text-brand-dark">
                                    {systemParams.isLoading ? '...' : systemParams.totalSupply ? formatTvl(systemParams.totalSupply) : '$0'}
                                </p>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Supply APY */}
                    <Card className="border-none shadow-soft-xl bg-white relative overflow-hidden">
                        <div className="absolute top-0 right-0 p-2">
                            <span className="flex items-center gap-1 bg-success-light text-success-DEFAULT text-xs font-bold px-2 py-1 rounded-full">
                                <span className="h-1.5 w-1.5 bg-success-DEFAULT rounded-full animate-pulse" />
                                Live
                            </span>
                        </div>
                        <CardContent className="p-6 flex items-center gap-4">
                            <div className="h-12 w-12 rounded-full bg-success-light flex items-center justify-center text-success-DEFAULT">
                                <TrendingUp className="h-6 w-6" />
                            </div>
                            <div>
                                <p className="text-sm font-medium text-brand-muted">Supply APY</p>
                                <div className="flex items-baseline gap-2">
                                    <p className="text-2xl font-bold text-success-DEFAULT">
                                        {supplyAPY.isLoading ? '...' : supplyAPY.apyFormatted ?? '0.00%'}
                                    </p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Utilization Rate */}
                    <Card className="border-none shadow-soft-xl bg-white relative overflow-hidden">
                        <div className="absolute top-0 right-0 p-2">
                            <span className="flex items-center gap-1 bg-success-light text-success-DEFAULT text-xs font-bold px-2 py-1 rounded-full">
                                <span className="h-1.5 w-1.5 bg-success-DEFAULT rounded-full animate-pulse" />
                                Live
                            </span>
                        </div>
                        <CardContent className="p-6 flex items-center gap-4">
                            <div className="h-12 w-12 rounded-full bg-brand-light flex items-center justify-center text-brand-DEFAULT">
                                <Activity className="h-6 w-6" />
                            </div>
                            <div className="flex-1">
                                <p className="text-sm font-medium text-brand-muted">Utilization Rate</p>
                                <p className="text-2xl font-bold text-brand-dark">
                                    {systemParams.isLoading ? '...' : `${utilizationRate.toFixed(1)}%`}
                                </p>
                                {/* Utilization progress bar */}
                                <div className="w-full h-2 bg-gray-200 rounded-full mt-2 overflow-hidden">
                                    <div
                                        className={`h-full rounded-full transition-all duration-500 ${utilizationColor}`}
                                        style={{ width: `${Math.min(utilizationRate, 100)}%` }}
                                    />
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* Main Content: Supply & Risk */}
                <div className="grid lg:grid-cols-[2fr_1fr] gap-8">

                    {/* Supply Widget */}
                    <Card>
                        <CardHeader>
                            <CardTitle>Manage Supply</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            <div className="flex p-1 bg-brand-light/50 rounded-lg w-fit">
                                <button 
                                    onClick={() => { setActiveTab('supply'); setAmount(''); setAmountError(''); }}
                                    className={`px-6 py-2 rounded-md text-sm font-semibold transition-all duration-200 ${activeTab === 'supply' ? 'bg-white shadow-sm text-brand-dark scale-100' : 'text-brand-muted hover:text-brand-dark hover:bg-white/50'}`}
                                >
                                    Supply
                                </button>
                                <button 
                                    onClick={() => { setActiveTab('withdraw'); setAmount(''); setAmountError(''); }}
                                    className={`px-6 py-2 rounded-md text-sm font-semibold transition-all duration-200 ${activeTab === 'withdraw' ? 'bg-white shadow-sm text-brand-dark scale-100' : 'text-brand-muted hover:text-brand-dark hover:bg-white/50'}`}
                                >
                                    Withdraw
                                </button>
                            </div>

                            <div className="space-y-4">
                                <div className="flex justify-between text-sm items-center">
                                    <span className="text-brand-muted">Amount (USDC)</span>
                                    <div className="flex items-center gap-2">
                                         <button
                                            onClick={() => handlePercentageClick(25)}
                                            disabled={isLoading || !hasBalance}
                                            type="button"
                                            className="px-2 py-1 text-xs font-medium text-white bg-brand-DEFAULT hover:bg-brand-dark rounded-md transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer hover:shadow-md active:scale-95"
                                        >
                                            25%
                                        </button>
                                        <button
                                            onClick={() => handlePercentageClick(50)}
                                            disabled={isLoading || !hasBalance}
                                            type="button"
                                            className="px-2 py-1 text-xs font-medium text-white bg-brand-DEFAULT hover:bg-brand-dark rounded-md transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer hover:shadow-md active:scale-95"
                                        >
                                            50%
                                        </button>
                                        <button
                                            onClick={handleMaxClick}
                                            disabled={isLoading || !hasBalance}
                                            type="button"
                                            className="px-2 py-1 text-xs font-medium text-white bg-brand-DEFAULT hover:bg-brand-dark rounded-md transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer hover:shadow-md active:scale-95"
                                        >
                                            MAX
                                        </button>
                                        <span className="text-brand-dark font-medium ml-1">
                                            {activeTab === 'supply' ? 'Wallet: ' : 'Supplied: '}
                                            {availableBalance ? formatTvl(availableBalance) : '...'}
                                        </span>
                                    </div>
                                </div>
                                <div className="relative">
                                    <input
                                        type="number"
                                        className={`w-full h-12 px-4 rounded-xl text-base font-medium border-2 ${amountError ? 'border-danger-DEFAULT focus:ring-danger-DEFAULT/50 focus:border-danger-DEFAULT bg-red-50/30' : 'border-gray-300 focus:ring-mantle/30 focus:border-mantle bg-gray-50/50'} focus:ring-4 outline-none transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-gray-100 hover:border-mantle/50`}
                                        placeholder="0.00"
                                        value={amount}
                                        onChange={handleAmountChange}
                                        disabled={isLoading || !hasBalance}
                                    />
                                </div>
                                {amountError && (
                                    <p className="text-sm text-danger-DEFAULT font-medium">{amountError}</p>
                                )}
                            </div>

                            <div className="bg-brand-light/20 rounded-xl p-4 border border-brand-light space-y-2">
                                <div className="flex justify-between text-sm items-center">
                                    <span className="text-brand-muted">Est. Monthly Earnings</span>
                                    <span className="font-bold text-success-DEFAULT">
                                        {estimatedMonthlyEarnings !== null
                                            ? `+$${estimatedMonthlyEarnings.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                                            : lenderPosition.data?.suppliedValue
                                                ? '...'
                                                : '+$0.00'
                                        }
                                    </span>
                                </div>
                                <div className="flex items-center gap-2 text-xs text-brand-muted">
                                    <Info className="h-3 w-3" /> Approve + supply via MorphoAdapter
                                </div>
                            </div>

                            {/* Transaction status feedback */}
                            {supplyStatus !== 'idle' && (
                                <div className={`flex items-center gap-2 p-3 rounded-lg ${
                                    supplyStatus === 'success' ? 'bg-success-light text-success-DEFAULT' :
                                    supplyStatus === 'error' ? 'bg-red-50 text-danger-DEFAULT' :
                                    'bg-blue-50 text-blue-600'
                                }`}>
                                    {isProcessing && <Loader2 className="h-4 w-4 animate-spin" />}
                                    {supplyStatus === 'success' && <CheckCircle className="h-4 w-4" />}
                                    {supplyStatus === 'error' && <AlertCircle className="h-4 w-4" />}
                                    <span className="text-sm font-medium">{getStatusDisplay()}</span>
                                    {supplyStatus === 'error' && (
                                        <button onClick={resetSupply} className="ml-auto text-xs underline">Dismiss</button>
                                    )}
                                </div>
                            )}

                            <Button
                                className="w-full h-12 text-lg bg-gradient-to-r from-success-DEFAULT to-emerald-500 hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
                                disabled={isActionDisabled}
                                onClick={activeTab === 'supply' ? handleSupply : undefined}
                            >
                                {isProcessing ? (
                                    <span className="flex items-center justify-center gap-2">
                                        <Loader2 className="h-5 w-5 animate-spin" />
                                        Processing...
                                    </span>
                                ) : !isConnected ? (
                                    <span className="flex items-center justify-center gap-2">
                                        {`${activeTab === 'supply' ? 'Supply' : 'Withdraw'} USDC`}
                                        <span title="Sign in to continue">
                                            <Info className="h-4 w-4 opacity-70" />
                                        </span>
                                    </span>
                                ) : (
                                    `${activeTab === 'supply' ? 'Supply' : 'Withdraw'} USDC`
                                )}
                            </Button>
                        </CardContent>
                    </Card>

                    {/* Market Health */}
                    <Card>
                        <CardHeader>
                            <div className="flex items-center justify-between">
                                <CardTitle className="text-lg">Market Health</CardTitle>
                                <span className="flex items-center gap-1 text-xs text-success-DEFAULT">
                                    <span className="h-1.5 w-1.5 bg-success-DEFAULT rounded-full animate-pulse" />
                                    Live
                                </span>
                            </div>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            {/* Available Liquidity */}
                            <div className="space-y-2">
                                <p className="text-xs text-brand-muted uppercase tracking-wider">Available Liquidity</p>
                                <div className="flex items-center gap-3">
                                    <div className="h-10 w-10 rounded-full bg-success-light flex items-center justify-center">
                                        <Wallet className="h-5 w-5 text-success-DEFAULT" />
                                    </div>
                                    <div>
                                        <p className="text-xl font-bold text-brand-dark">
                                            {systemParams.isLoading ? '...' : systemParams.availableLiquidity ? formatTvl(systemParams.availableLiquidity) : '$0'}
                                        </p>
                                        <p className="text-xs text-brand-muted">USDC available to borrow</p>
                                    </div>
                                </div>
                            </div>

                            <div className="h-px bg-border"></div>

                            {/* Total Borrowed */}
                            <div className="space-y-2">
                                <p className="text-xs text-brand-muted uppercase tracking-wider">Total Borrowed</p>
                                <div className="flex items-center gap-3">
                                    <div className="h-10 w-10 rounded-full bg-brand-light flex items-center justify-center">
                                        <DollarSign className="h-5 w-5 text-brand-DEFAULT" />
                                    </div>
                                    <div>
                                        <p className="text-xl font-bold text-brand-dark">
                                            {systemParams.isLoading ? '...' : systemParams.totalBorrow ? formatTvl(systemParams.totalBorrow) : '$0'}
                                        </p>
                                        <p className="text-xs text-brand-muted">Borrowed by AcUSDY holders</p>
                                    </div>
                                </div>
                            </div>

                            <div className="h-px bg-border"></div>

                            {/* Oracle Price */}
                            <div className="space-y-2">
                                <p className="text-xs text-brand-muted uppercase tracking-wider">Oracle Price</p>
                                <div className="flex justify-between items-baseline">
                                    <span className="text-2xl font-bold text-brand-dark">{oracleData?.value ? `$${Number(oracleData.value).toFixed(2)}` : '$--'}</span>
                                    <span className="text-sm text-brand-muted">USDC / AcUSDY</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <p className="text-xs text-brand-muted">
                                        NAV Oracle with {oracleData?.haircutPercentage ?? '--'}% haircut
                                    </p>
                                    {oracleData?.isStale && (
                                        <span className="text-xs text-danger-DEFAULT font-medium">(Stale)</span>
                                    )}
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                </div>
            </main>
        </div>
    );
}
