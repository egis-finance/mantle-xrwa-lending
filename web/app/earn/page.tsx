'use client';

import { Navbar } from '@/components/Navbar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { TrendingUp, ShieldCheck, Coins, Info } from 'lucide-react';
import { HardcodedUsdyBalance } from '@/components/HardcodedUsdyBalance';

export default function EarnPage() {
    const lenderAddress = process.env.NEXT_PUBLIC_LENDER_ADDRESS as `0x${string}` | undefined;

    return (
        <div className="min-h-screen bg-body-gradient flex flex-col">
            <Navbar />

            <main className="flex-1 container max-w-screen-2xl py-8 space-y-8">
                {/* Header */}
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                    <div className="flex flex-col gap-2">
                        <h1 className="text-3xl font-serif font-bold text-brand-dark">Lender Yield</h1>
                        <p className="text-brand-muted">Supply USDC to earn yield backed by verified real-world assets.</p>
                    </div>
                    {lenderAddress && (
                        <HardcodedUsdyBalance address={lenderAddress} label="Lender balance" />
                    )}
                </div>


                {/* Market Stats Header */}
                <div className="grid md:grid-cols-3 gap-6">
                    <Card className="border-none shadow-soft-xl bg-white">
                        <CardContent className="p-6 flex items-center gap-4">
                            <div className="h-12 w-12 rounded-full bg-brand-light flex items-center justify-center text-brand-DEFAULT">
                                <Coins className="h-6 w-6" />
                            </div>
                            <div>
                                <p className="text-sm font-medium text-brand-muted">Total USDC Liquidity</p>
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
                                <p className="text-sm font-medium text-brand-muted">Supply APY</p>
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
                                <p className="text-2xl font-bold text-brand-dark">$21.5M</p>
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
                                <button className="px-6 py-2 rounded-md bg-white shadow-sm text-sm font-semibold text-brand-dark">Supply</button>
                                <button className="px-6 py-2 rounded-md text-sm font-medium text-brand-muted hover:text-brand-dark">Withdraw</button>
                            </div>

                            <div className="space-y-4">
                                <div className="flex justify-between text-sm">
                                    <span className="text-brand-muted">Amount (USDC)</span>
                                    <span className="text-brand-dark font-medium">Wallet: 500,000 USDC</span>
                                </div>
                                <div className="relative">
                                    <input
                                        type="number"
                                        className="w-full h-14 pl-4 pr-20 rounded-xl border border-input bg-white focus:ring-2 focus:ring-success/50 outline-none text-lg"
                                        placeholder="0.00"
                                    />
                                    <button className="absolute right-3 top-3 text-xs font-bold text-success-DEFAULT bg-success-light px-3 py-1.5 rounded-lg hover:bg-success-light/80">MAX</button>
                                </div>
                            </div>

                            <div className="bg-brand-light/20 rounded-xl p-4 border border-brand-light space-y-2">
                                <div className="flex justify-between text-sm">
                                    <span className="text-brand-muted">Est. Monthly Earnings</span>
                                    <span className="font-bold text-success-DEFAULT">+$2,250.00</span>
                                </div>
                                <div className="flex items-center gap-2 text-xs text-brand-muted">
                                    <Info className="h-3 w-3" /> Requires 2 transactions (Approve + Supply)
                                </div>
                            </div>

                            <Button className="w-full h-12 text-lg bg-gradient-to-r from-success-DEFAULT to-emerald-500 hover:opacity-90">
                                Propose Supply
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
                                    <span className="text-2xl font-bold text-brand-dark">$1.00</span>
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
