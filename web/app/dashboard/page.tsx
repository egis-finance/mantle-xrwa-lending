'use client';

import { Navbar } from '@/components/Navbar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { TvlPegDisplay } from '@/components/TvlPegDisplay';
import { Activity, RefreshCw } from 'lucide-react';

export default function DashboardPage() {
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

                {/* System Params */}
                <Card>
                    <CardHeader>
                        <CardTitle className="text-lg">System Parameters</CardTitle>
                    </CardHeader>
                    <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-6">
                        {[
                            { label: 'Max LTV', value: '75%' },
                            { label: 'Liquidation Threshold', value: '80%' },
                            { label: 'Liquidation Bonus', value: '15%' },
                            { label: 'Emergency Mode', value: 'Disabled', color: 'text-success-DEFAULT' },
                        ].map((param) => (
                            <div key={param.label} className="space-y-1">
                                <p className="text-xs text-brand-muted uppercase">{param.label}</p>
                                <p className={`text-lg font-bold ${param.color || 'text-brand-dark'}`}>{param.value}</p>
                            </div>
                        ))}
                    </CardContent>
                </Card>

            </main>
        </div>
    );
}
