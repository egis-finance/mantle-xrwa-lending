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
    const [lockAmount, setLockAmount] = React.useState('');
    const [lockError, setLockError] = React.useState('');

    const handleSwap = () => {
        setIsSwapped(!isSwapped);
    };

    // Get the available balance as a number
    const availableBalance = mantle.value ? parseFloat(mantle.value) : 0;

    const handleLockAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value;
        setLockAmount(value);

        // Clear error when user types
        if (lockError) {
            setLockError('');
        }

        // Validate
        if (value === '') {
            return;
        }

        const numValue = parseFloat(value);

        if (isNaN(numValue)) {
            setLockError('Please enter a valid number');
            return;
        }

        if (numValue <= 0) {
            setLockError('Amount must be greater than 0');
            return;
        }

        if (numValue > availableBalance) {
            setLockError(`Amount exceeds available balance of ${formatTvl(mantle.value)}`);
            return;
        }
    };

    const handleMaxClick = () => {
        if (mantle.value) {
            setLockAmount(mantle.value);
            setLockError('');
        }
    };

    const handlePercentageClick = (percentage: number) => {
        if (mantle.value) {
            const amount = (parseFloat(mantle.value) * percentage / 100).toString();
            setLockAmount(amount);
            setLockError('');
        }
    };

    const isLockDisabled = !lockAmount || !!lockError || isLoading || availableBalance === 0;

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
                        <div className={`bg-gradient-to-br from-gray-100 via-gray-50 to-gray-100 p-6 flex flex-col ${isSwapped ? 'md:order-3 border-l' : 'md:order-1 border-r'} border-brand-light transition-all duration-500 ease-in-out min-h-[400px]`}>
                            {/* Header */}
                            <div className="pb-3">
                                <h3 className="text-lg font-semibold text-brand-dark">Mantle Vault</h3>
                            </div>

                            {/* Divider */}
                            <div className="h-px bg-gradient-to-r from-transparent via-gray-300 to-transparent mb-4"></div>

                            {/* Balance Display */}
                            <div className="space-y-1 pb-4 p-3 rounded-xl bg-white/60 border border-gray-200 shadow-sm">
                                <p className="text-xs text-gray-600 font-medium uppercase tracking-wider">Available Balance</p>
                                <p className="text-2xl font-bold text-gray-900">
                                    {isLoading ? '...' : formatTvl(mantle.value)}{' '}
                                    <span className="text-sm text-gray-600 font-normal">USDY</span>
                                </p>
                            </div>

                            {/* Spacer to push input section to bottom */}
                            <div className="flex-1"></div>

                            {/* Divider */}
                            <div className="h-px bg-gradient-to-r from-transparent via-gray-300 to-transparent mb-3"></div>

                            {/* Lock Input Section */}
                            <div className="space-y-3 p-3 rounded-xl bg-white/80 border border-gray-200 shadow-sm">
                                <div className="space-y-3">
                                    {/* Percentage Buttons */}
                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => handlePercentageClick(25)}
                                            disabled={isLoading || availableBalance === 0}
                                            type="button"
                                            className="px-3 py-1.5 text-xs font-medium text-white bg-brand-DEFAULT hover:bg-brand-dark rounded-md transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                                        >
                                            25%
                                        </button>
                                        <button
                                            onClick={() => handlePercentageClick(50)}
                                            disabled={isLoading || availableBalance === 0}
                                            type="button"
                                            className="px-3 py-1.5 text-xs font-medium text-white bg-brand-DEFAULT hover:bg-brand-dark rounded-md transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                                        >
                                            50%
                                        </button>
                                        <button
                                            onClick={handleMaxClick}
                                            disabled={isLoading || availableBalance === 0}
                                            type="button"
                                            className="px-3 py-1.5 text-xs font-medium text-white bg-brand-DEFAULT hover:bg-brand-dark rounded-md transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                                        >
                                            MAX
                                        </button>
                                    </div>

                                    {/* Amount Input */}
                                    <div className="relative">
                                        <input
                                            type="number"
                                            placeholder="0.00"
                                            value={lockAmount}
                                            onChange={handleLockAmountChange}
                                            min="0"
                                            max={mantle.value || undefined}
                                            step="0.01"
                                            disabled={isLoading || availableBalance === 0}
                                            className={`w-full h-12 px-4 rounded-xl text-base font-medium border-2 ${lockError ? 'border-danger-DEFAULT focus:ring-danger-DEFAULT/50 focus:border-danger-DEFAULT bg-red-50/30' : 'border-gray-300 focus:ring-mantle/30 focus:border-mantle bg-gray-50/50'} focus:ring-4 outline-none transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-gray-100`}
                                        />
                                    </div>

                                    {/* Error Message */}
                                    {lockError && (
                                        <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 border-2 border-red-200">
                                            <span className="text-red-600 font-bold text-sm mt-0.5">⚠</span>
                                            <p className="text-sm text-red-700 font-medium">{lockError}</p>
                                        </div>
                                    )}

                                    {/* Empty Balance Message */}
                                    {availableBalance === 0 && !isLoading && (
                                        <p className="text-sm text-brand-muted text-center py-2">
                                            No USDY available to lock
                                        </p>
                                    )}
                                </div>

                                {/* Lock Button */}
                                <Button 
                                    variant="mantle" 
                                    disabled={isLockDisabled}
                                    className="w-full h-12 text-sm font-semibold shadow-lg shadow-mantle/20 disabled:opacity-50 disabled:cursor-not-allowed hover:shadow-xl hover:scale-[1.01] transition-all"
                                >
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
                        <div className={`bg-gradient-to-br from-gray-50 to-white p-6 flex flex-col ${isSwapped ? 'md:order-1 border-r' : 'md:order-3 border-l'} border-brand-light transition-all duration-500 ease-in-out min-h-[400px]`}>
                            {/* Header */}
                            <div className="pb-3">
                                <h3 className="text-lg font-semibold text-brand-dark">Ethereum Collateral</h3>
                            </div>

                            {/* Divider */}
                            <div className="h-px bg-gradient-to-r from-transparent via-gray-300 to-transparent mb-4"></div>

                            {/* Balance Display */}
                            <div className="space-y-1 pb-4 p-3 rounded-xl bg-white/60 border border-gray-200 shadow-sm">
                                <p className="text-xs text-gray-600 font-medium uppercase tracking-wider">Minted Collateral</p>
                                <p className="text-2xl font-bold text-gray-900">
                                    {isLoading ? '...' : formatTvl(ethereum.value)}{' '}
                                    <span className="text-sm text-gray-600 font-normal">AcUSDY</span>
                                </p>
                            </div>

                            {/* Spacer to push status box to bottom */}
                            <div className="flex-1"></div>

                            {/* Status Box */}
                            <div className="mt-auto">
                                <div className="p-4 rounded-xl bg-white/80 border-2 border-gray-200 text-center shadow-sm">
                                    <p className="text-sm text-gray-600 font-medium">No pending attestations</p>
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
