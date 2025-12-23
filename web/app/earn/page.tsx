'use client';

import React from 'react';
import { Navbar } from '@/components/Navbar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { TrendingUp, ShieldCheck, Coins, Info } from 'lucide-react';
import { HardcodedUsdyBalance } from '@/components/HardcodedUsdyBalance';
import { useOraclePrice } from '@/hooks/useOraclePrice';
import { useTvlPeg } from '@/hooks/useTvlPeg';
import { useBorrowerBalance } from '@/hooks/useBorrowerBalance';
import { formatTvl } from '@/lib/format';

export default function EarnPage() {
    const lenderAddress = process.env.NEXT_PUBLIC_LENDER_ADDRESS as `0x${string}` | undefined;
    const { data: oracleData } = useOraclePrice();
    const { mantle } = useTvlPeg();
    // Use the borrower balance hook which fetches USDY, but for the lender address
    // This ensures we see the 100 USDY the user expects
    const lenderUsdyBalance = useBorrowerBalance(lenderAddress);

    const [activeTab, setActiveTab] = React.useState<'supply' | 'withdraw'>('supply');
    const [amount, setAmount] = React.useState('');
    const [amountError, setAmountError] = React.useState('');

    // Get the available balance as a number for validation
    // For Supply: Wallet Balance (USDY)
    const availableBalance = activeTab === 'supply' ? (lenderUsdyBalance.data?.value ?? null) : '0'; 
    const availableBalanceNum = availableBalance ? parseFloat(availableBalance) : 0;
    const isLoading = lenderUsdyBalance.isLoading;

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

        const numValue = parseFloat(value);

        if (isNaN(numValue)) {
            setAmountError('Please enter a valid number');
            return;
        }

        if (numValue <= 0) {
            setAmountError('Amount must be greater than 0');
            return;
        }

        if (numValue > availableBalanceNum) {
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
        if (availableBalance) {
            const val = (parseFloat(availableBalance) * percentage / 100);
            // Use Intl.NumberFormat to avoid scientific notation for large numbers
            // and limit to 6 decimals (USDC)
            const formattedAmount = val.toLocaleString('fullwide', { 
                useGrouping: false, 
                maximumFractionDigits: 6 
            });
            
            setAmount(formattedAmount);
            setAmountError('');
        }
    };

    const isActionDisabled = !amount || !!amountError || isLoading || availableBalanceNum === 0;

    return (
        <div className="min-h-screen bg-body-gradient flex flex-col">
            <Navbar />

            <main className="flex-1 container max-w-screen-2xl py-8 space-y-8">
                {/* Header */}
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                    <div className="flex flex-col gap-2">
                        <h1 className="text-3xl font-serif font-bold text-brand-dark">Lender Yield</h1>
                        <p className="text-brand-muted">Supply USDY to earn yield backed by verified real-world assets.</p>
                    </div>
                </div>


                {/* Market Stats Header */}
                <div className="grid md:grid-cols-3 gap-6">
                    <Card className="border-none shadow-soft-xl bg-white">
                        <CardContent className="p-6 flex items-center gap-4">
                            <div className="h-12 w-12 rounded-full bg-brand-light flex items-center justify-center text-brand-DEFAULT">
                                <Coins className="h-6 w-6" />
                            </div>
                            <div>
                                <div className="flex items-center gap-2">
                                    <p className="text-sm font-medium text-brand-muted">Total USDY Liquidity</p>
                                    <span className="inline-block px-1.5 py-0.5 rounded text-[9px] bg-gray-100 text-gray-500 font-medium border border-gray-200">Mock Data</span>
                                </div>
                                <p className="text-2xl font-bold text-brand-dark">$14.2M</p>
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="border-none shadow-soft-xl bg-white relative overflow-hidden">
                        <div className="absolute top-0 right-0 p-2">
                            <span className="bg-success-light text-success-DEFAULT text-xs font-bold px-2 py-1 rounded-full">Live</span>
                        </div>
                        <CardContent className="p-6 flex items-center gap-4">
                            <div className="h-12 w-12 rounded-full bg-success-light flex items-center justify-center text-success-DEFAULT">
                                <TrendingUp className="h-6 w-6" />
                            </div>
                            <div>
                                <div className="flex items-center gap-2">
                                    <p className="text-sm font-medium text-brand-muted">Supply APY</p>
                                    <span className="inline-block px-1.5 py-0.5 rounded text-[9px] bg-gray-100 text-gray-500 font-medium border border-gray-200">Mock Data</span>
                                </div>
                                <div className="flex items-baseline gap-2">
                                    <p className="text-2xl font-bold text-success-DEFAULT">5.42%</p>
                                    <span className="text-xs text-brand-muted">7d avg: 5.1%</span>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="border-none shadow-soft-xl bg-white">
                        <CardContent className="p-6 flex items-center gap-4">
                            <div className="h-12 w-12 rounded-full bg-brand-light flex items-center justify-center text-brand-DEFAULT">
                                <ShieldCheck className="h-6 w-6" />
                            </div>
                            <div>
                                <p className="text-sm font-medium text-brand-muted">Verified Collateral</p>
                                <p className="text-2xl font-bold text-brand-dark">{mantle.value ? formatTvl(mantle.value) : '$--'}</p>
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
                                    <span className="text-brand-muted">Amount (USDY)</span>
                                    <div className="flex items-center gap-2">
                                         <button
                                            onClick={() => handlePercentageClick(25)}
                                            disabled={isLoading || availableBalanceNum === 0}
                                            type="button"
                                            className="px-2 py-1 text-xs font-medium text-white bg-brand-DEFAULT hover:bg-brand-dark rounded-md transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer hover:shadow-md active:scale-95"
                                        >
                                            25%
                                        </button>
                                        <button
                                            onClick={() => handlePercentageClick(50)}
                                            disabled={isLoading || availableBalanceNum === 0}
                                            type="button"
                                            className="px-2 py-1 text-xs font-medium text-white bg-brand-DEFAULT hover:bg-brand-dark rounded-md transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer hover:shadow-md active:scale-95"
                                        >
                                            50%
                                        </button>
                                        <button
                                            onClick={handleMaxClick}
                                            disabled={isLoading || availableBalanceNum === 0}
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
                                        disabled={isLoading || availableBalanceNum === 0}
                                    />
                                </div>
                                {amountError && (
                                    <p className="text-sm text-danger-DEFAULT font-medium">{amountError}</p>
                                )}
                            </div>

                            <div className="bg-brand-light/20 rounded-xl p-4 border border-brand-light space-y-2">
                                <div className="flex justify-between text-sm items-center">
                                    <div className="flex items-center gap-2">
                                        <span className="text-brand-muted">Est. Monthly Earnings</span>
                                        <span className="inline-block px-1.5 py-0.5 rounded text-[9px] bg-white text-gray-400 font-medium border border-gray-200">Mock Data</span>
                                    </div>
                                    <span className="font-bold text-success-DEFAULT">+$2,250.00</span>
                                </div>
                                <div className="flex items-center gap-2 text-xs text-brand-muted">
                                    <Info className="h-3 w-3" /> Requires 2 transactions (Approve + {activeTab === 'supply' ? 'Supply' : 'Withdraw'})
                                </div>
                            </div>

                            <Button 
                                className="w-full h-12 text-lg bg-gradient-to-r from-success-DEFAULT to-emerald-500 hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
                                disabled={isActionDisabled}
                            >
                                Propose {activeTab === 'supply' ? 'Supply' : 'Withdraw'}
                            </Button>
                        </CardContent>
                    </Card>

                    {/* Risk Metrics */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-lg">Collateral Insight</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            <div className="space-y-2">
                                <p className="text-xs text-brand-muted uppercase tracking-wider">Composition</p>
                                <div className="flex items-center justify-between">
                                    <span className="font-medium text-brand-dark">100% USDY (Ondo)</span>
                                    <ShieldCheck className="h-4 w-4 text-success-DEFAULT" />
                                </div>
                                <div className="w-full bg-brand-light h-2 rounded-full overflow-hidden">
                                    <div className="bg-mantle h-full w-full"></div>
                                </div>
                                <p className="text-xs text-success-DEFAULT flex items-center gap-1">
                                    <ShieldCheck className="h-3 w-3" /> Verified On-Chain
                                </p>
                            </div>

                            <div className="h-px bg-border"></div>

                            <div className="space-y-2">
                                <p className="text-xs text-brand-muted uppercase tracking-wider">Oracle Price</p>
                                <div className="flex justify-between items-baseline">
                                    <span className="text-2xl font-bold text-brand-dark">{oracleData?.value ? `$${Number(oracleData.value).toFixed(2)}` : '$--'}</span>
                                    <span className="text-sm text-brand-muted">USDC / AcUSDY</span>
                                </div>
                                <p className="text-xs text-brand-muted">Source: Chainlink Feeds</p>
                            </div>
                        </CardContent>
                    </Card>

                </div>
            </main>
        </div>
    );
}
