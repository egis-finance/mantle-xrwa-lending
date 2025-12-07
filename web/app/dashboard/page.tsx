'use client';

import React from 'react';
import { Navbar } from '@/components/Navbar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { TvlPegDisplay } from '@/components/TvlPegDisplay';
import { Activity, RefreshCw, Info } from 'lucide-react';
import { useSystemParams } from '@/hooks/useSystemParams';
import { formatTvl } from '@/lib/format';
import { contracts } from '@/lib/contracts';

export default function DashboardPage() {
    const systemParams = useSystemParams();

    return (
        <div className="min-h-screen bg-body-gradient flex flex-col">
            <Navbar />

            <main className="flex-1 container max-w-screen-2xl py-8 space-y-6">
                {/* Header */}
                <div className="flex flex-col gap-2">
                    <h1 className="text-3xl font-serif font-bold text-brand-dark">Mission Control</h1>
                    <p className="text-brand-muted">System monitoring and risk management operations.</p>
                </div>

                {/* Global Health Bar */}
                <Card className="border-l-4 border-l-success-DEFAULT shadow-soft-xl">
                    <CardContent className="p-6 flex flex-wrap items-center justify-between gap-6">

                        <div className="flex items-center gap-8">
                            <TvlPegDisplay />
                        </div>

                        <div className="h-10 w-px bg-border hidden md:block"></div>

                        <div className="flex items-center gap-4">
                            <div className="space-y-1 text-right">
                                <p className="text-xs text-brand-muted uppercase tracking-wider">Oracle Heartbeat</p>
                                <div className="flex items-center gap-2 justify-end">
                                    <span className="text-sm font-medium text-brand-dark">Last Update: 2m ago</span>
                                    <span className="relative flex h-3 w-3">
                                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success-DEFAULT opacity-75"></span>
                                        <span className="relative inline-flex rounded-full h-3 w-3 bg-success-DEFAULT"></span>
                                    </span>
                                </div>
                            </div>
                        </div>

                    </CardContent>
                </Card>

                {/* Main Ops Tables */}
                <div className="grid lg:grid-cols-[3fr_2fr] gap-6">

                    {/* Liquidation Radar */}
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between">
                            <CardTitle className="text-lg flex items-center gap-2">
                                <Activity className="h-5 w-5 text-brand-DEFAULT" /> Liquidation Radar
                            </CardTitle>
                            <Button variant="outline" size="sm"><RefreshCw className="h-4 w-4" /></Button>
                        </CardHeader>
                        <CardContent>
                            <div className="rounded-lg border border-border overflow-hidden">
                                <table className="w-full text-sm text-left">
                                    <thead className="bg-brand-light/50 text-brand-muted font-medium uppercase text-xs">
                                        <tr>
                                            <th className="p-4">Safe Address</th>
                                            <th className="p-4">Health Factor</th>
                                            <th className="p-4">Debt</th>
                                            <th className="p-4 text-right">Action</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-border">
                                        <tr className="bg-white">
                                            <td className="p-4 font-mono text-brand-dark">0xab...45</td>
                                            <td className="p-4 text-success-DEFAULT font-bold">1.66</td>
                                            <td className="p-4">$60,000</td>
                                            <td className="p-4 text-right text-brand-muted">-</td>
                                        </tr>
                                        <tr className="bg-warning-light/10">
                                            <td className="p-4 font-mono text-brand-dark">0xcd...89</td>
                                            <td className="p-4 text-warning-DEFAULT font-bold">1.17</td>
                                            <td className="p-4">$85,000</td>
                                            <td className="p-4 text-right text-brand-muted">-</td>
                                        </tr>
                                        <tr className="bg-danger-light/10">
                                            <td className="p-4 font-mono text-brand-dark">0xef...12</td>
                                            <td className="p-4 text-danger-DEFAULT font-bold">1.02</td>
                                            <td className="p-4">$98,000</td>
                                            <td className="p-4 text-right">
                                                <Button size="sm" variant="destructive" className="h-8">Trigger Liq</Button>
                                            </td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Release Queue */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-lg">Release Queue</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-4">
                                {[1, 2].map((i) => (
                                    <div key={i} className="flex items-center justify-between p-4 rounded-lg border border-border bg-white shadow-sm">
                                        <div className="space-y-1">
                                            <p className="font-mono text-sm text-brand-dark">0xab...45</p>
                                            <p className="text-xs text-brand-muted">Request: <span className="font-bold text-brand-dark">50,000 USDY</span></p>
                                        </div>
                                        {i === 1 ? (
                                            <Button size="sm" variant="outline" className="text-brand-DEFAULT border-brand-DEFAULT hover:bg-brand-light">
                                                Process Release
                                            </Button>
                                        ) : (
                                            <Button size="sm" disabled variant="secondary">
                                                Waiting...
                                            </Button>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </CardContent>
                    </Card>

                </div>

                {/* System Params - Enhanced Compact Design */}
                <Card className="shadow-lg">
                    <CardHeader className="pb-4">
                        <CardTitle className="text-xl font-bold">System Parameters</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-6">
                        {systemParams.isLoading && !systemParams.lltv ? (
                            <div className="flex items-center justify-center py-12">
                                <RefreshCw className="h-6 w-6 animate-spin text-brand-DEFAULT" />
                            </div>
                        ) : systemParams.isError ? (
                            <div className="flex items-center justify-center py-12">
                                <p className="text-sm font-medium text-danger-DEFAULT">Error loading parameters.</p>
                            </div>
                        ) : (
                            <>
                                {/* Enhanced 3-column grid with circular charts */}
                                <div className="grid grid-cols-3 gap-6">
                                    {/* Max LTV with circular chart */}
                                    <div className="flex flex-col items-center p-5 rounded-2xl bg-gradient-to-br from-blue-50 via-white to-blue-50/50 border-2 border-blue-100 shadow-md hover:shadow-xl transition-all duration-300 hover:-translate-y-1">
                                        <div className="relative w-20 h-20 mb-3">
                                            <svg className="transform -rotate-90 w-20 h-20">
                                                <circle cx="40" cy="40" r="34" stroke="#e0e7ff" strokeWidth="7" fill="none" />
                                                <circle
                                                    cx="40" cy="40" r="34"
                                                    stroke="url(#blueGradient)"
                                                    strokeWidth="7"
                                                    fill="none"
                                                    strokeDasharray={`${(86 / 100) * 213.6} 213.6`}
                                                    strokeLinecap="round"
                                                    className="transition-all duration-700"
                                                />
                                                <defs>
                                                    <linearGradient id="blueGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                                                        <stop offset="0%" stopColor="#3b82f6" />
                                                        <stop offset="100%" stopColor="#1e40af" />
                                                    </linearGradient>
                                                </defs>
                                            </svg>
                                            <div className="absolute inset-0 flex items-center justify-center">
                                                <span className="text-lg font-bold text-blue-700">86%</span>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-1.5">
                                            <p className="text-xs text-blue-600 uppercase font-semibold tracking-wide text-center">Max LTV</p>
                                            <div className="group/info relative">
                                                <Info className="h-3.5 w-3.5 text-blue-400 hover:text-blue-600 cursor-help transition-colors" />
                                                <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 w-52 p-3 bg-gray-900 text-white text-xs rounded-lg shadow-2xl opacity-0 invisible group-hover/info:opacity-100 group-hover/info:visible transition-all z-50">
                                                    <p className="font-semibold mb-1">Max LTV (LLTV)</p>
                                                    <p className="text-white/80 text-[10px]">Maximum loan-to-value ratio from Morpho Blue</p>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Utilization with circular chart */}
                                    <div className="flex flex-col items-center p-5 rounded-2xl bg-gradient-to-br from-emerald-50 via-white to-emerald-50/50 border-2 border-emerald-100 shadow-md hover:shadow-xl transition-all duration-300 hover:-translate-y-1">
                                        <div className="relative w-20 h-20 mb-3">
                                            <svg className="transform -rotate-90 w-20 h-20">
                                                <circle cx="40" cy="40" r="34" stroke="#d1fae5" strokeWidth="7" fill="none" />
                                                <circle
                                                    cx="40" cy="40" r="34"
                                                    stroke={systemParams.utilizationRate && systemParams.utilizationRate > 90 ? "url(#orangeGradient)" : "url(#greenGradient)"}
                                                    strokeWidth="7"
                                                    fill="none"
                                                    strokeDasharray={`${((systemParams.utilizationRate || 0) / 100) * 213.6} 213.6`}
                                                    strokeLinecap="round"
                                                    className="transition-all duration-700"
                                                />
                                                <defs>
                                                    <linearGradient id="greenGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                                                        <stop offset="0%" stopColor="#10b981" />
                                                        <stop offset="100%" stopColor="#059669" />
                                                    </linearGradient>
                                                    <linearGradient id="orangeGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                                                        <stop offset="0%" stopColor="#f59e0b" />
                                                        <stop offset="100%" stopColor="#d97706" />
                                                    </linearGradient>
                                                </defs>
                                            </svg>
                                            <div className="absolute inset-0 flex items-center justify-center">
                                                <span className={`text-lg font-bold ${systemParams.utilizationRate && systemParams.utilizationRate > 90 ? 'text-orange-600' : 'text-emerald-600'}`}>
                                                    {systemParams.utilizationRate?.toFixed(0) || 0}%
                                                </span>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-1.5">
                                            <p className="text-xs text-emerald-600 uppercase font-semibold tracking-wide text-center">Utilization</p>
                                            <div className="group/info relative">
                                                <Info className="h-3.5 w-3.5 text-emerald-400 hover:text-emerald-600 cursor-help transition-colors" />
                                                <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 w-52 p-3 bg-gray-900 text-white text-xs rounded-lg shadow-2xl opacity-0 invisible group-hover/info:opacity-100 group-hover/info:visible transition-all z-50">
                                                    <p className="font-semibold mb-1">Utilization Rate</p>
                                                    <p className="text-white/80 text-[10px]">Percentage of supplied capital currently borrowed</p>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Oracle Status with indicator */}
                                    <div className="flex flex-col items-center justify-center p-5 rounded-2xl bg-gradient-to-br from-purple-50 via-white to-purple-50/50 border-2 border-purple-100 shadow-md hover:shadow-xl transition-all duration-300 hover:-translate-y-1">
                                        <div className="mb-3">
                                            {systemParams.oracleIsStale === false ? (
                                                <div className="relative w-20 h-20 flex items-center justify-center">
                                                    <span className="absolute animate-ping h-16 w-16 rounded-full bg-emerald-400 opacity-30"></span>
                                                    <span className="relative h-14 w-14 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center shadow-lg">
                                                        <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                                        </svg>
                                                    </span>
                                                </div>
                                            ) : (
                                                <div className="w-20 h-20 flex items-center justify-center">
                                                    <span className="h-14 w-14 rounded-full bg-gradient-to-br from-gray-300 to-gray-400 flex items-center justify-center shadow-lg">
                                                        <span className="text-white text-2xl font-bold">?</span>
                                                    </span>
                                                </div>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-1.5">
                                            <p className="text-xs text-purple-600 uppercase font-semibold tracking-wide text-center">Oracle</p>
                                            <div className="group/info relative">
                                                <Info className="h-3.5 w-3.5 text-purple-400 hover:text-purple-600 cursor-help transition-colors" />
                                                <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 w-52 p-3 bg-gray-900 text-white text-xs rounded-lg shadow-2xl opacity-0 invisible group-hover/info:opacity-100 group-hover/info:visible transition-all z-50">
                                                    <p className="font-semibold mb-1">Oracle Status</p>
                                                    <p className="text-white/80 text-[10px]">Price feed freshness indicator</p>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Enhanced stats row with better styling */}
                                <div className="grid grid-cols-3 gap-4 pt-4 border-t-2 border-gray-100">
                                    <div className="flex flex-col items-center justify-center p-4 rounded-xl bg-gradient-to-br from-green-50 to-white border border-green-100 hover:shadow-md transition-shadow">
                                        <p className="text-xl font-bold text-green-700 mb-2">
                                            {systemParams.availableLiquidity ? formatTvl(systemParams.availableLiquidity) : '$0'}
                                        </p>
                                        <div className="flex items-center gap-1.5">
                                            <p className="text-xs text-green-600 uppercase font-semibold tracking-wide text-center">Available Liquidity</p>
                                            <div className="group/info relative">
                                                <Info className="h-3.5 w-3.5 text-green-400 hover:text-green-600 cursor-help transition-colors" />
                                                <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 w-52 p-3 bg-gray-900 text-white text-xs rounded-lg shadow-2xl opacity-0 invisible group-hover/info:opacity-100 group-hover/info:visible transition-all z-50">
                                                    <p className="font-semibold mb-1">Available Liquidity</p>
                                                    <p className="text-white/80 text-[10px]">Amount of USDC available to borrow (Total Supply - Total Borrowed)</p>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex flex-col items-center justify-center p-4 rounded-xl bg-gradient-to-br from-amber-50 to-white border border-amber-100 hover:shadow-md transition-shadow">
                                        <p className="text-xl font-bold text-amber-700 mb-2">15%</p>
                                        <div className="flex items-center gap-1.5">
                                            <p className="text-xs text-amber-600 uppercase font-semibold tracking-wide text-center">Liq. Bonus</p>
                                            <div className="group/info relative">
                                                <Info className="h-3.5 w-3.5 text-amber-400 hover:text-amber-600 cursor-help transition-colors" />
                                                <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 w-52 p-3 bg-gray-900 text-white text-xs rounded-lg shadow-2xl opacity-0 invisible group-hover/info:opacity-100 group-hover/info:visible transition-all z-50">
                                                    <p className="font-semibold mb-1">Liquidation Bonus</p>
                                                    <p className="text-white/80 text-[10px]">Bonus percentage awarded to liquidators for maintaining protocol health</p>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex flex-col items-center justify-center p-4 rounded-xl bg-gradient-to-br from-indigo-50 to-white border border-indigo-100 hover:shadow-md transition-shadow">
                                        <p className="text-xl font-bold text-indigo-700 mb-2">
                                            {systemParams.oracleHaircutPercentage !== null ? `${systemParams.oracleHaircutPercentage}%` : '2%'}
                                        </p>
                                        <div className="flex items-center gap-1.5">
                                            <p className="text-xs text-indigo-600 uppercase font-semibold tracking-wide text-center">Oracle Haircut</p>
                                            <div className="group/info relative">
                                                <Info className="h-3.5 w-3.5 text-indigo-400 hover:text-indigo-600 cursor-help transition-colors" />
                                                <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 w-52 p-3 bg-gray-900 text-white text-xs rounded-lg shadow-2xl opacity-0 invisible group-hover/info:opacity-100 group-hover/info:visible transition-all z-50">
                                                    <p className="font-semibold mb-1">Oracle Haircut</p>
                                                    <p className="text-white/80 text-[10px]">Safety margin applied to collateral price for conservative valuation (2% discount)</p>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </>
                        )}
                    </CardContent>
                </Card>

            </main>
        </div>
    );
}
