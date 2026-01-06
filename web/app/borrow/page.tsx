'use client';

import React from 'react';
import type { ReactElement } from 'react';
import { Navbar } from '@/components/Navbar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowRightLeft, Lock, Wallet, Loader2, CheckCircle2 } from 'lucide-react';
import { useDynamicWallet } from '@/hooks/useDynamicWallet';
import { useSDKReady } from '@/hooks/useSDKReady';
import { useLockedUSDY } from '@/hooks/useLockedUSDY';
import { useMorphoCollateral } from '@/hooks/useMorphoCollateral';
import { useBorrowerBalance } from '@/hooks/useBorrowerBalance';
import { useAcUSDYBalance } from '@/hooks/useAcUSDYBalance';
import { useSystemParams } from '@/hooks/useSystemParams';
import { useChainAbstracted } from '@/hooks/useChainAbstracted';
import { LoanHealthCard } from '@/components/LoanHealthCard';
import { contracts } from '@/lib/contracts';
import { formatTvl } from '@/lib/format';
import { cn } from '@/lib/utils';
import { parseUnits } from 'viem';
import { CollateralLockerAbi } from '@/lib/contracts/abis/CollateralLocker';
import { ERC20Abi } from '@/lib/contracts/abis/ERC20';
import { invalidateUserReads, invalidateCrossChainReads } from '@/lib/swr/invalidation';
import { MANTLE_CHAIN_ID } from '@/lib/dynamic/chains';

export default function BorrowPage(): ReactElement {
  const sdkReady = useSDKReady();
  const { address: borrowerAddress, isConnected } = useDynamicWallet();
  const { signOnMantle, waitForTransaction } = useChainAbstracted();

  // Borrower's locked USDY on Mantle (not protocol TVL)
  const lockedUSDY = useLockedUSDY(borrowerAddress);
  // Borrower's AcUSDY collateral in Morpho on Ethereum
  const morphoCollateral = useMorphoCollateral(borrowerAddress);
  // Borrower's AcUSDY balance in wallet on Ethereum
  const acUsdyBalance = useAcUSDYBalance(borrowerAddress);
  // Borrower's total USDY balance on Mantle
    const borrowerBalance = useBorrowerBalance(borrowerAddress);
  // Morpho market parameters (LLTV from on-chain)
  const systemParams = useSystemParams();

  const isLoading =
    lockedUSDY.isLoading ||
    morphoCollateral.isLoading ||
    acUsdyBalance.isLoading ||
    borrowerBalance.isLoading ||
    systemParams.isLoading;

  // Calculate available balance = total balance - locked amount
    const availableBalance = React.useMemo(() => {
    if (borrowerBalance.data?.value) {
      // borrowerBalance.data.value is already formatted string from useBorrowerBalance
      // But we need to subtract lockedUSDY if it represents the same token.
      // ARCHITECTURE.md says: 
      // useLockedUSDY: Mantle-side collateral (CollateralLocker)
      // useBorrowerBalance: Borrower's total USDY balance on Mantle
      // So available = total - locked is correct.
      const total = parseFloat(borrowerBalance.data.value);
      const locked = parseFloat(lockedUSDY.data?.value ?? '0');
      return Math.max(0, total - locked).toFixed(2);
        }
        return null;
  }, [borrowerBalance.data?.value, lockedUSDY.data?.value]);
    
    const [isSwapped, setIsSwapped] = React.useState(false);
    const [lockAmount, setLockAmount] = React.useState('');
    const [lockError, setLockError] = React.useState('');
  const [isLocking, setIsLocking] = React.useState(false);
  const [txStatus, setTxStatus] = React.useState<'idle' | 'approving' | 'locking' | 'success' | 'error'>('idle');

    const handleSwap = () => {
        setIsSwapped(!isSwapped);
    };

    // Get the available balance as a number for validation
    const availableBalanceNum = availableBalance ? parseFloat(availableBalance) : 0;

    const handleLockAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value;
        setLockAmount(value);

        // Clear error when user types
        if (lockError) {
            setLockError('');
        }

    // Reset status if user starts typing again after success/error
    if (txStatus === 'success' || txStatus === 'error') {
      setTxStatus('idle');
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

        if (numValue > availableBalanceNum) {
            setLockError(`Amount exceeds available balance of ${formatTvl(availableBalance)}`);
            return;
        }
    };

    const handleMaxClick = () => {
        if (availableBalance) {
            setLockAmount(availableBalance);
            setLockError('');
      if (txStatus === 'success' || txStatus === 'error') {
        setTxStatus('idle');
      }
        }
    };

    const handlePercentageClick = (percentage: number) => {
        if (availableBalance) {
      const amount = ((parseFloat(availableBalance) * percentage) / 100).toString();
            setLockAmount(amount);
            setLockError('');
      if (txStatus === 'success' || txStatus === 'error') {
        setTxStatus('idle');
      }
    }
  };

  const handleLockAndDeposit = async () => {
    if (!borrowerAddress || !lockAmount || isLocking) return;

    try {
      setIsLocking(true);
      setLockError('');
      
      const amountWei = parseUnits(lockAmount, 18);

      // 1. Approve CollateralLocker to spend USDY
      setTxStatus('approving');
      const approveHash = await signOnMantle({
        address: contracts.usdy.address,
        abi: ERC20Abi,
        functionName: 'approve',
        args: [contracts.collateralLocker.address, amountWei],
      });
      await waitForTransaction(MANTLE_CHAIN_ID, approveHash);

      // 2. Call lock(amount, validUntil, vcHash)
      // Set expiration to 1 hour from now
      const validUntil = BigInt(Math.floor(Date.now() / 1000) + 3600);
      setTxStatus('locking');
      const lockHash = await signOnMantle({
        address: contracts.collateralLocker.address,
        abi: CollateralLockerAbi,
        functionName: 'lock',
        // vcHash: zero placeholder - verification credential system not yet implemented
        args: [amountWei, validUntil, '0x0000000000000000000000000000000000000000000000000000000000000000'],
      });
      await waitForTransaction(MANTLE_CHAIN_ID, lockHash);

      setTxStatus('success');
      setLockAmount('');
      
      // Invalidate cache to refresh UI
      if (borrowerAddress) {
        await invalidateUserReads(borrowerAddress);
        invalidateCrossChainReads();
      }
    } catch (err) {
      const error = err as { shortMessage?: string; message?: string };
      console.error('Lock failed:', error);
      setTxStatus('error');
      setLockError(error.shortMessage || error.message || 'Transaction failed');
    } finally {
      setIsLocking(false);
    }
  };

  const isLockDisabled = !lockAmount || !!lockError || isLoading || availableBalanceNum === 0 || isLocking;

    return (
        <div className="min-h-screen bg-body-gradient flex flex-col">
            <Navbar />

            <main className="flex-1 container max-w-screen-2xl py-8 space-y-8">
                {/* Header */}
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                    <div className="flex flex-col gap-2">
                        <h1 className="text-3xl font-serif font-bold text-brand-dark">Borrower Terminal</h1>
            <p className="text-brand-muted">
              Manage your cross-chain collateral and Morpho Blue positions.
            </p>
                    </div>
                </div>

                {/* Cross-Chain Asset Bridge Card */}
                <Card className="overflow-hidden border-none shadow-soft-xl">
                    <div className="grid md:grid-cols-[1fr_auto_1fr] gap-0">
                        {/* Mantle Side */}
            <div
              className={`bg-gradient-to-br from-gray-100 via-gray-50 to-gray-100 p-6 flex flex-col ${isSwapped ? 'md:order-3 border-l' : 'md:order-1 border-r'} border-brand-light transition-all duration-500 ease-in-out min-h-[400px]`}
            >
                            {/* Header */}
                            <div className="pb-3">
                                <h3 className="text-lg font-semibold text-brand-dark">Mantle RWA</h3>
                            </div>

                            {/* Divider */}
                            <div className="h-px bg-gradient-to-r from-transparent via-gray-300 to-transparent mb-4"></div>

                            {/* Balance Display */}
                            <div className="p-3 rounded-xl bg-white/60 border border-gray-200 shadow-sm">
                <p className="text-xs text-gray-600 font-medium uppercase tracking-wider mb-1">
                  Locked Amount
                </p>
                                <p className="text-lg font-bold text-gray-900 break-words">
                  {isLoading ? '...' : formatTvl(lockedUSDY.data?.value ?? null)}{' '}
                                    <span className="text-xs text-gray-600 font-normal">USDY</span>
                                </p>
                            </div>

                            {/* Spacer to push input section to bottom */}
                            <div className="flex-1"></div>

                            {/* Divider */}
                            <div className="h-px bg-gradient-to-r from-transparent via-gray-300 to-transparent mb-3"></div>

                            {/* Lock Input Section */}
                            <div className="space-y-3 p-3 rounded-xl bg-white/80 border border-gray-200 shadow-sm">
                                <div className="space-y-3">
                                    {/* Percentage Buttons with Available Balance */}
                                    <div className="flex items-center justify-between gap-2">
                                        <div className="flex gap-2">
                                            <button
                                                onClick={() => handlePercentageClick(25)}
                                                disabled={isLoading || availableBalanceNum === 0}
                                                type="button"
                        className="px-3 py-1.5 text-xs font-medium text-white bg-brand-DEFAULT hover:bg-brand-dark rounded-md transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                                            >
                                                25%
                                            </button>
                                            <button
                                                onClick={() => handlePercentageClick(50)}
                                                disabled={isLoading || availableBalanceNum === 0}
                                                type="button"
                        className="px-3 py-1.5 text-xs font-medium text-white bg-brand-DEFAULT hover:bg-brand-dark rounded-md transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                                            >
                                                50%
                                            </button>
                                            <button
                                                onClick={handleMaxClick}
                                                disabled={isLoading || availableBalanceNum === 0}
                                                type="button"
                        className="px-3 py-1.5 text-xs font-medium text-white bg-brand-DEFAULT hover:bg-brand-dark rounded-md transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                                            >
                                                MAX
                                            </button>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-xs text-gray-600 font-medium">Available</p>
                                            <p className="text-sm font-bold text-gray-900">
                                                {isLoading ? '...' : formatTvl(availableBalance)}
                                            </p>
                                        </div>
                                    </div>

                                    {/* Amount Input */}
                                    <div className="relative">
                                        <input
                                            type="number"
                                            placeholder="0.00"
                                            value={lockAmount}
                                            onChange={handleLockAmountChange}
                                            min="0"
                                            max={availableBalance || undefined}
                                            step="0.01"
                                            disabled={isLoading || availableBalanceNum === 0}
                      className={`w-full h-12 px-4 rounded-xl text-base font-medium border-2 ${lockError ? 'border-danger-DEFAULT focus:ring-danger-DEFAULT/50 focus:border-danger-DEFAULT bg-red-50/30' : 'border-gray-300 focus:ring-mantle/30 focus:border-mantle bg-gray-50/50'} focus:ring-4 outline-none transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-gray-100`}
                                        />
                                    </div>

                                    {/* Error Message */}
                                    {lockError && (
                                        <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 border-2 border-red-200">
                      <span className="text-red-600 font-bold text-sm mt-0.5">!</span>
                                            <p className="text-sm text-red-700 font-medium">{lockError}</p>
                                        </div>
                                    )}

                                    {/* Empty Balance Message */}
                  {sdkReady && (!isConnected || !borrowerAddress) ? (
                    <p className="text-sm text-brand-muted text-center py-2">
                      Connect wallet to view balances
                    </p>
                  ) : (
                    availableBalanceNum === 0 &&
                    !isLoading &&
                    sdkReady &&
                    isConnected &&
                    borrowerAddress && (
                                        <p className="text-sm text-brand-muted text-center py-2">
                                            No USDY available to lock
                                        </p>
                    )
                                    )}
                                </div>

                                {/* Lock Button */}
                                <Button 
                                    variant="mantle" 
                  onClick={handleLockAndDeposit}
                                    disabled={isLockDisabled}
                                    className="w-full h-12 text-sm font-semibold shadow-lg shadow-mantle/20 disabled:opacity-50 disabled:cursor-not-allowed hover:shadow-xl hover:scale-[1.01] transition-all"
                                >
                  {isLocking ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      {txStatus === 'approving' ? 'Approving USDY...' : 'Locking Collateral...'}
                    </>
                  ) : txStatus === 'success' ? (
                    <>
                      <CheckCircle2 className="mr-2 h-4 w-4" /> Locked Successfully
                    </>
                  ) : (
                    <>
                                    <Lock className="mr-2 h-4 w-4" /> Lock and Deposit
                    </>
                  )}
                                </Button>

                {/* Transaction Status Info */}
                {txStatus !== 'idle' && !lockError && (
                  <div className="mt-2 text-center">
                    {txStatus === 'success' ? (
                      <p className="text-xs text-success-DEFAULT font-medium flex items-center justify-center gap-1">
                        <CheckCircle2 className="h-3 w-3" />
                        Assets locked on Mantle. Relayer will attest soon.
                      </p>
                    ) : isLocking ? (
                      <p className="text-xs text-brand-muted animate-pulse">
                        Please confirm the transaction in your wallet...
                      </p>
                    ) : null}
                  </div>
                )}
                            </div>
                        </div>

                        {/* Bridge Visual */}
                        <div className="relative flex items-center justify-center p-4 bg-white/50 backdrop-blur-sm min-h-[100px] md:min-h-auto md:order-2">
                            <div className="absolute inset-0 flex items-center justify-center">
                <div
                  className={`w-full h-[1px] bg-gradient-to-r transition-all duration-500 ease-in-out ${isSwapped ? 'from-eth/30 via-brand/30 to-mantle/30' : 'from-mantle/30 via-brand/30 to-eth/30'}`}
                ></div>
                            </div>
                            <button 
                                onClick={handleSwap}
                                className="relative z-10 bg-white p-3 rounded-full shadow-floating border border-brand-light hover:bg-brand-light/30 hover:shadow-lg hover:scale-110 transition-all duration-500 ease-out cursor-pointer active:scale-95"
                                aria-label="Swap chain positions"
                            >
                <ArrowRightLeft
                  className={`h-6 w-6 text-brand-muted hover:text-brand-DEFAULT transition-all duration-500 ease-in-out ${isSwapped ? 'rotate-180' : 'rotate-0'}`}
                />
                            </button>
                        </div>

                        {/* Ethereum Side */}
            <div
              className={`bg-gradient-to-br from-gray-50 to-white p-6 flex flex-col ${isSwapped ? 'md:order-1 border-r' : 'md:order-3 border-l'} border-brand-light transition-all duration-500 ease-in-out min-h-[400px]`}
            >
                            {/* Header */}
                            <div className="pb-3">
                                <h3 className="text-lg font-semibold text-brand-dark">Ethereum Collateral</h3>
                            </div>

                            {/* Divider */}
                            <div className="h-px bg-gradient-to-r from-transparent via-gray-300 to-transparent mb-4"></div>

                            {/* Balance Display */}
              <div className="space-y-3">
                <div className={cn(
                  "p-3 rounded-xl border transition-all duration-500",
                  acUsdyBalance.data?.raw && acUsdyBalance.data.raw > 0n 
                    ? "bg-emerald-50 border-emerald-200 shadow-emerald-100/50 shadow-md scale-[1.02]" 
                    : "bg-white/40 border-gray-200 opacity-60"
                )}>
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="text-[10px] text-emerald-700 font-bold uppercase tracking-wider mb-1">
                        Wallet Balance (Attested)
                      </p>
                      <p className="text-lg font-bold text-emerald-900">
                        {acUsdyBalance.isLoading ? '...' : formatTvl(acUsdyBalance.data?.value ?? '0')}{' '}
                        <span className="text-xs font-normal opacity-70">AcUSDY</span>
                      </p>
                    </div>
                    {acUsdyBalance.data?.raw && acUsdyBalance.data.raw > 0n && (
                      <div className="p-1 rounded-full bg-emerald-500 text-white animate-pulse">
                        <CheckCircle2 className="h-3 w-3" />
                      </div>
                    )}
                  </div>
                  {acUsdyBalance.data?.raw && acUsdyBalance.data.raw > 0n && (
                    <p className="text-[9px] text-emerald-600 font-medium mt-1">
                      Ready to be supplied to Morpho below ↓
                    </p>
                  )}
                </div>

                <div className="p-3 rounded-xl bg-white/60 border border-gray-200 shadow-sm">
                  <p className="text-xs text-gray-600 font-medium uppercase tracking-wider mb-1">
                    Supplied to Morpho
                  </p>
                  <p className="text-xl font-bold text-gray-900">
                    {isLoading ? '...' : formatTvl(morphoCollateral.data?.value ?? null)}{' '}
                                    <span className="text-sm text-gray-600 font-normal">AcUSDY</span>
                                </p>
                </div>
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
          {/* Transaction Builder */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Wallet className="h-5 w-5 text-brand-DEFAULT" />
                Transaction Builder
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
                <h4 className="text-sm font-semibold text-brand-muted uppercase tracking-wider">
                  Proposed Batch Actions
                </h4>
                                <div className="space-y-3">
                                    {[1, 2, 3].map((step) => (
                    <div
                      key={step}
                      className="flex items-center gap-4 p-3 bg-white rounded-lg border border-brand-light/50 shadow-sm"
                    >
                                            <div className="h-6 w-6 rounded-full bg-brand-light text-brand-DEFAULT flex items-center justify-center text-xs font-bold border border-brand/20">
                                                {step}
                                            </div>
                                            <span className="text-sm font-medium text-brand-dark">
                        {step === 1
                          ? 'Approve AcUSDY Manager'
                          : step === 2
                            ? 'Supply AcUSDY Collateral'
                            : 'Borrow USDC'}
                                            </span>
                                        </div>
                                    ))}
                                </div>

                                <div className="pt-4 flex gap-4">
                  <Button variant="outline" className="flex-1">
                    Simulate Batch
                  </Button>
                  <Button className="flex-[2]">Execute Transaction</Button>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

          {/* Loan Health Card */}
          <LoanHealthCard />
                </div>
            </main>
        </div>
    );
}
