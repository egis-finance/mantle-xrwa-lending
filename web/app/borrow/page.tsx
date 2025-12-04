'use client';

import React from 'react';
import { Navbar } from '@/components/Navbar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowRightLeft, ShieldCheck, Lock, Wallet } from 'lucide-react';
import { HardcodedUsdyBalance } from '@/components/HardcodedUsdyBalance';
import { useTvlPeg } from '@/hooks/useTvlPeg';
import { formatTvl } from '@/lib/format';


export default function BorrowPage() {
    const borrowerAddress = process.env.NEXT_PUBLIC_BORROWER_ADDRESS as `0x${string}` | undefined;
    const { mantle, ethereum, isLoading } = useTvlPeg();
    const [isSwapped, setIsSwapped] = React.useState(false);

    const handleSwap = () => {
        setIsSwapped(!isSwapped);
    };

    return (
        <div className="min-h-screen bg-body-gradient flex flex-col">
            <Navbar />

            <main className="flex-1 container max-w-screen-2xl py-8 space-y-8">
                {/* Header */}
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                    <div className="flex flex-col gap-2">
                        <h1 className="text-3xl font-serif font-bold text-brand-dark">Borrower Terminal</h1>
                        <p className="text-brand-muted">Manage your cross-chain collateral and Morpho Blue positions.</p>
                    </div>
                    {borrowerAddress && (
                        <HardcodedUsdyBalance address={borrowerAddress} label="Borrower balance" />
                    )}
                </div>


                {/* Cross-Chain Asset Bridge Card */}
                <Card className="overflow-hidden border-none shadow-soft-xl">
                    <div className="grid md:grid-cols-[1fr_auto_1fr] gap-0">

                        {/* Mantle Side */}
                        <div className={`bg-mantle-light/20 p-8 flex flex-col gap-6 ${isSwapped ? 'md:order-3 border-l' : 'md:order-1 border-r'} border-brand-light transition-all duration-500 ease-in-out`}>
                            <div className="flex items-center gap-3">
                                <div className="relative h-8 w-8">
                                    {/* Placeholder for Mantle Icon */}
                                    <div className="w-8 h-8 bg-mantle rounded-full flex items-center justify-center text-white font-bold text-xs">M</div>
                                </div>
                                <h3 className="text-xl font-semibold text-brand-dark">Mantle Vault</h3>
                            </div>

                            <div className="space-y-1">
                                <p className="text-sm text-brand-muted font-medium uppercase tracking-wider">Available Balance</p>
                                <p className="text-4xl font-bold text-brand-dark">
                                    {isLoading ? '...' : formatTvl(mantle.value)}{' '}
                                    <span className="text-xl text-brand-muted font-normal">USDY</span>
                                </p>
                            </div>

                            <div className="mt-auto space-y-3">
                                <div className="relative">
                                    <input
                                        type="number"
                                        placeholder="Amount to lock"
                                        className="w-full h-12 pl-4 pr-12 rounded-lg border border-input bg-white focus:ring-2 focus:ring-mantle/50 outline-none transition-all"
                                    />
                                    <button className="absolute right-2 top-2 text-xs font-medium text-mantle hover:text-mantle-dark px-2 py-1 rounded bg-mantle-light">MAX</button>
                                </div>
                                <Button variant="mantle" className="w-full h-12 text-lg shadow-mantle/20">
                                    <Lock className="mr-2 h-4 w-4" /> Propose Lock & Bridge
                                </Button>
                            </div>
                        </div>

                        {/* Bridge Visual */}
                        <div className="relative flex items-center justify-center p-4 bg-white/50 backdrop-blur-sm min-h-[100px] md:min-h-auto md:order-2">
                            <div className="absolute inset-0 flex items-center justify-center">
                                <div className={`w-full h-[1px] bg-gradient-to-r transition-all duration-500 ease-in-out ${isSwapped ? 'from-eth/30 via-brand/30 to-mantle/30' : 'from-mantle/30 via-brand/30 to-eth/30'}`}></div>
                            </div>
                            <button 
                                onClick={handleSwap}
                                className="relative z-10 bg-white p-3 rounded-full shadow-floating border border-brand-light hover:bg-brand-light/30 hover:shadow-lg hover:scale-110 transition-all duration-500 ease-out cursor-pointer active:scale-95"
                                aria-label="Swap chain positions"
                            >
                                <ArrowRightLeft className={`h-6 w-6 text-brand-muted hover:text-brand-DEFAULT transition-all duration-500 ease-in-out ${isSwapped ? 'rotate-180' : 'rotate-0'}`} />
                            </button>
                        </div>

                        {/* Ethereum Side */}
                        <div className={`bg-eth-light/20 p-8 flex flex-col gap-6 ${isSwapped ? 'md:order-1 border-r' : 'md:order-3 border-l'} border-brand-light transition-all duration-500 ease-in-out`}>
                            <div className="flex items-center gap-3">
                                <div className="relative h-8 w-8">
                                    {/* Placeholder for Eth Icon */}
                                    <div className="w-8 h-8 bg-eth rounded-full flex items-center justify-center text-white font-bold text-xs">E</div>
                                </div>
                                <h3 className="text-xl font-semibold text-brand-dark">Ethereum Collateral</h3>
                            </div>

                            <div className="space-y-1">
                                <p className="text-sm text-brand-muted font-medium uppercase tracking-wider">Minted Collateral</p>
                                <p className="text-4xl font-bold text-brand-dark">
                                    {isLoading ? '...' : formatTvl(ethereum.value)}{' '}
                                    <span className="text-xl text-brand-muted font-normal">AcUSDY</span>
                                </p>
                            </div>

                            <div className="mt-auto">
                                <div className="p-4 rounded-lg bg-white/60 border border-brand-light/50 text-center">
                                    <p className="text-sm text-brand-muted">No pending attestations</p>
                                </div>
                            </div>
                        </div>

                    </div>
                </Card>

                {/* Lower Section: Transaction Builder & Health */}
                <div className="grid lg:grid-cols-[3fr_2fr] gap-8">

                    {/* Safe Transaction Builder */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Wallet className="h-5 w-5 text-brand-DEFAULT" />
                                Safe Transaction Builder
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            <div className="space-y-4">
                                <label className="text-sm font-medium text-brand-dark">Borrow Amount (USDC)</label>
                                <div className="flex gap-4">
                                    <input
                                        type="number"
                                        className="flex-1 h-12 px-4 rounded-lg border border-input bg-white focus:ring-2 focus:ring-brand/50 outline-none"
                                        placeholder="0.00"
                                    />
                                    <Button size="lg">Add to Batch</Button>
                                </div>
                            </div>

                            <div className="bg-brand-light/30 rounded-xl p-6 space-y-4 border border-brand-light">
                                <h4 className="text-sm font-semibold text-brand-muted uppercase tracking-wider">Proposed Batch Actions</h4>
                                <div className="space-y-3">
                                    {[1, 2, 3].map((step) => (
                                        <div key={step} className="flex items-center gap-4 p-3 bg-white rounded-lg border border-brand-light/50 shadow-sm">
                                            <div className="h-6 w-6 rounded-full bg-brand-light text-brand-DEFAULT flex items-center justify-center text-xs font-bold border border-brand/20">
                                                {step}
                                            </div>
                                            <span className="text-sm font-medium text-brand-dark">
                                                {step === 1 ? 'Approve AcUSDY Manager' : step === 2 ? 'Supply AcUSDY Collateral' : 'Borrow USDC'}
                                            </span>
                                        </div>
                                    ))}
                                </div>

                                <div className="pt-4 flex gap-4">
                                    <Button variant="outline" className="flex-1">Simulate Batch</Button>
                                    <Button className="flex-[2]">Propose Transaction</Button>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Loan Health Monitor */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <ShieldCheck className="h-5 w-5 text-success" />
                                Loan Health
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="flex flex-col items-center justify-center py-8 space-y-8">
                            {/* Gauge Placeholder */}
                            <div className="relative w-48 h-24 bg-gradient-to-t from-brand-light to-white rounded-t-full border-t-8 border-x-8 border-brand-light flex items-end justify-center overflow-hidden">
                                <div className="absolute bottom-0 w-full text-center pb-2">
                                    <span className="text-3xl font-bold text-brand-dark">65%</span>
                                    <p className="text-xs text-brand-muted">Current LTV</p>
                                </div>
                                {/* Needle */}
                                <div className="absolute bottom-0 left-1/2 w-1 h-20 bg-brand-dark origin-bottom transform -rotate-45 rounded-full"></div>
                            </div>

                            <div className="grid grid-cols-2 gap-8 w-full pt-4 border-t border-brand-light">
                                <div className="text-center space-y-1">
                                    <p className="text-xs text-brand-muted uppercase">Collateral Value</p>
                                    <p className="text-xl font-bold text-brand-dark">$150,000</p>
                                </div>
                                <div className="text-center space-y-1">
                                    <p className="text-xs text-brand-muted uppercase">Total Debt</p>
                                    <p className="text-xl font-bold text-brand-dark">$97,500</p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                </div>
            </main>
        </div>
    );
}
