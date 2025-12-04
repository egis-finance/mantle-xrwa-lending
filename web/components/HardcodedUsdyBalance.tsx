'use client';

import { useState } from 'react';
import { useMemo } from 'react';
import { useReadContracts } from 'wagmi';
import { formatUnits, type Address } from 'viem';
import { cn } from '@/lib/utils';
import { Copy, Check, Info, Coins, Loader2, Wallet } from 'lucide-react';

const DEFAULT_USDY_ADDRESS =
    '0x5bE26527e817998A7206475496fDE1E68957c5A6' as const;
const MANTLE_VTE_CHAIN_ID = 15000;

const usdyAddress: Address =
    (process.env.NEXT_PUBLIC_MANTLE_USDY as Address | undefined) ??
    DEFAULT_USDY_ADDRESS;

// ERC-20 ABI for balanceOf and decimals
const erc20Abi = [
    {
        name: 'balanceOf',
        type: 'function',
        stateMutability: 'view',
        inputs: [{ name: 'account', type: 'address' }],
        outputs: [{ name: 'balance', type: 'uint256' }],
    },
    {
        name: 'decimals',
        type: 'function',
        stateMutability: 'view',
        inputs: [],
        outputs: [{ name: '', type: 'uint8' }],
    },
] as const;

interface HardcodedUsdyBalanceProps {
    address: Address;
    label: string;
}

export function HardcodedUsdyBalance({ address, label }: HardcodedUsdyBalanceProps) {
    const [copied, setCopied] = useState(false);
    const [isFunding, setIsFunding] = useState(false);
    const shouldQuery = Boolean(address) && Boolean(usdyAddress);

    const { data, isLoading, isError, error, refetch } = useReadContracts({
        contracts: [
            {
                address: usdyAddress,
                abi: erc20Abi,
                functionName: 'balanceOf',
                args: [address],
                chainId: MANTLE_VTE_CHAIN_ID,
            },
            {
                address: usdyAddress,
                abi: erc20Abi,
                functionName: 'decimals',
                chainId: MANTLE_VTE_CHAIN_ID,
            },
        ],
        query: {
            enabled: shouldQuery,
            refetchInterval: 10000, // Refetch every 10 seconds
        },
    });

    const balanceInfo = useMemo(() => {
        const shortAddress = `${address.slice(0, 6)}...${address.slice(-4)}`;

        if (isLoading) {
            return { value: 'Loading…', shortAddress, isZero: false };
        }

        if (isError || !data || data[0]?.result === undefined || data[1]?.result === undefined) {
            return { value: '—', shortAddress, isZero: false };
        }

        const balance = data[0].result as bigint;
        const decimals = data[1].result as number;

        const raw = formatUnits(balance, decimals);
        const numeric = Number.parseFloat(raw);

        let display = '0';
        let isZero = true;

        if (numeric !== undefined && Number.isFinite(numeric)) {
            isZero = numeric === 0;
            if (numeric < 1000) {
                display = numeric.toLocaleString(undefined, {
                    minimumFractionDigits: 0,
                    maximumFractionDigits: 2,
                });
            } else {
                const suffixes = ["", "K", "M", "B", "T", "Qa", "Qi", "Sx"];
                const suffixNum = Math.floor(Math.log10(numeric) / 3);

                if (suffixNum < suffixes.length) {
                    const shortValue = (numeric / Math.pow(1000, suffixNum));
                    display = new Intl.NumberFormat('en-US', {
                        maximumFractionDigits: 2,
                    }).format(shortValue) + suffixes[suffixNum];
                } else {
                    // Fallback for extremely large numbers
                    display = numeric.toExponential(2);
                }
            }
        }

        return { value: display, shortAddress, isZero };
    }, [address, data, isError, isLoading]);

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(address);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch (err) {
            console.error('Failed to copy address:', err);
        }
    };

    const handleFund = async () => {
        if (isFunding) return;
        setIsFunding(true);
        try {
            const response = await fetch('/api/fund-wallet', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ address }),
            });

            if (!response.ok) {
                throw new Error('Funding failed');
            }

            // Wait a bit for the chain to update
            await new Promise((resolve) => setTimeout(resolve, 2000));
            await refetch();
        } catch (err) {
            console.error('Failed to fund wallet:', err);
        } finally {
            setIsFunding(false);
        }
    };

    return (
        <div
            className={cn(
                'relative rounded-xl border border-brand-light bg-white/80 shadow-sm backdrop-blur transition-all hover:shadow-md group',
            )}
        >
            {/* Gradient accent line at bottom */}
            <div className="absolute bottom-0 left-0 h-0.5 w-full bg-gradient-to-r from-brand-DEFAULT to-mantle-DEFAULT opacity-80 rounded-b-xl" />

            <div className="flex items-center gap-4 px-4 py-3">
                {/* Icon Circle */}
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-light text-brand-DEFAULT shadow-inner ring-1 ring-brand-light/50">
                    <Coins className="h-5 w-5" />
                </div>

                <div className="flex flex-col">
                    <div className="flex items-center gap-1.5">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-brand-muted/80">{label}</span>
                        <div className="group/info relative flex items-center">
                            <Info className="h-3 w-3 text-brand-muted/60 hover:text-brand-muted cursor-help transition-colors" />
                            <div className="absolute left-1/2 -translate-x-1/2 top-full mt-2 w-max max-w-[200px] p-3 bg-brand-dark text-white text-xs font-sans rounded-lg shadow-xl border border-white/10 opacity-0 invisible group-hover/info:opacity-100 group-hover/info:visible transition-all duration-200 pointer-events-none z-[1000] text-center leading-relaxed">
                                For demo purposes we are using pre-set funded addresses
                                <div className="absolute left-1/2 -translate-x-1/2 bottom-full w-0 h-0 border-l-[6px] border-r-[6px] border-b-[6px] border-l-transparent border-r-transparent border-b-brand-dark"></div>
                            </div>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="flex items-baseline gap-1">
                            <span className="font-sans text-xl font-bold text-brand-dark tracking-tight">
                                {balanceInfo.value}
                            </span>
                            <span className="text-xs font-medium text-brand-muted">USDY</span>
                        </div>
                        {balanceInfo.isZero && (
                            <button
                                onClick={handleFund}
                                disabled={isFunding}
                                className="flex items-center gap-1.5 rounded-full bg-brand-light px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-brand-DEFAULT hover:bg-brand-light/80 hover:text-brand-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {isFunding ? (
                                    <>
                                        <Loader2 className="h-3 w-3 animate-spin" />
                                        Funding...
                                    </>
                                ) : (
                                    <>
                                        <Wallet className="h-3 w-3" />
                                        Fund
                                    </>
                                )}
                            </button>
                        )}
                    </div>
                </div>

                {/* Divider */}
                <div className="h-8 w-px bg-gradient-to-b from-transparent via-border to-transparent" />

                {/* Address */}
                <div className="flex flex-col gap-0.5">
                    <span className="text-[10px] uppercase tracking-wide text-brand-muted/80">Wallet</span>
                    <div className="flex items-center gap-2 rounded-md bg-brand-light/30 px-2 py-1 ring-1 ring-brand-light/50">
                        <span className="font-mono text-xs font-medium text-brand-dark/80">{balanceInfo.shortAddress}</span>
                        <div className="relative group/copy">
                            <button
                                onClick={handleCopy}
                                className="p-0.5 hover:bg-white rounded transition-colors text-brand-muted hover:text-brand-dark"
                                title="Copy full address"
                            >
                                {copied ? (
                                    <Check className="h-3 w-3 text-success-DEFAULT" />
                                ) : (
                                    <Copy className="h-3 w-3" />
                                )}
                            </button>
                            {copied && (
                                <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-1 px-2 py-1 bg-gray-900 text-white text-[10px] rounded shadow-lg whitespace-nowrap z-[100]">
                                    Copied!
                                    <div className="absolute left-1/2 -translate-x-1/2 top-full w-0 h-0 border-l-3 border-r-3 border-t-3 border-l-transparent border-r-transparent border-t-gray-900"></div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
