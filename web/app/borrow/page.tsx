'use client';

import React from 'react';
import type { ReactElement } from 'react';
import { Navbar } from '@/components/Navbar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowRightLeft, ShieldCheck, Lock, Wallet, RefreshCw } from 'lucide-react';
import { useDynamicWallet } from '@/hooks/useDynamicWallet';
import { useSDKReady } from '@/hooks/useSDKReady';
import { useLockedUSDY } from '@/hooks/useLockedUSDY';
import { useMorphoCollateral } from '@/hooks/useMorphoCollateral';
import { useBorrowerBalance } from '@/hooks/useBorrowerBalance';
import { useLoanHealth } from '@/hooks/useLoanHealth';
import { useSystemParams } from '@/hooks/useSystemParams';
import { contracts, UNCONFIGURED_ADDRESS } from '@/lib/contracts';
import { getMarketId, DEFAULT_LLTV_DECIMAL } from '@/lib/marketId';
import { formatTvl } from '@/lib/format';

export default function BorrowPage(): ReactElement {
  const sdkReady = useSDKReady();
  const { address: borrowerAddress, isConnected, connect } = useDynamicWallet();

  // Basic config guard (prevents confusing "0" UI when contracts are not wired)
  const marketId = getMarketId();
  const isAppConfigured =
    contracts.collateralLocker.address !== UNCONFIGURED_ADDRESS &&
    contracts.morpho.address !== UNCONFIGURED_ADDRESS &&
    marketId !== UNCONFIGURED_ADDRESS;

  // Borrower's locked USDY on Mantle (not protocol TVL)
  const lockedUSDY = useLockedUSDY(borrowerAddress);
  // Borrower's AcUSDY collateral in Morpho on Ethereum
  const morphoCollateral = useMorphoCollateral(borrowerAddress);
  // Borrower's total USDY balance on Mantle
  const borrowerBalance = useBorrowerBalance(borrowerAddress);
  // Morpho market parameters (LLTV from on-chain)
  const systemParams = useSystemParams();
  // Loan health metrics (LLTV derived from Morpho market, fallback during loading)
  const loanHealth = useLoanHealth(borrowerAddress, { lltv: systemParams.lltv ?? DEFAULT_LLTV_DECIMAL });
  // LLTV as percentage for gauge display (e.g., 86 for 86% LLTV)
  const effectiveLltvPercent = (systemParams.lltv ?? DEFAULT_LLTV_DECIMAL) * 100;

  const isLoading =
    lockedUSDY.isLoading ||
    morphoCollateral.isLoading ||
    borrowerBalance.isLoading ||
    systemParams.isLoading;

  const isWalletInitializing = !sdkReady;
  const isWalletDisconnected = sdkReady && (!isConnected || borrowerAddress === undefined);

  const isLoanHealthUnavailable = isWalletDisconnected || !isAppConfigured;
  const isLoanHealthLoading = isWalletInitializing || (!isLoanHealthUnavailable && loanHealth.isLoading);
  const isLoanHealthError = !isLoanHealthUnavailable && !isLoanHealthLoading && loanHealth.isError;

  // Calculate available balance = total balance - locked amount
  const availableBalance = React.useMemo(() => {
    if (borrowerBalance.data?.value && lockedUSDY.data?.value) {
      const total = parseFloat(borrowerBalance.data.value);
      const locked = parseFloat(lockedUSDY.data.value);
      return Math.max(0, total - locked).toFixed(2);
    }
    return null;
  }, [borrowerBalance.data?.value, lockedUSDY.data?.value]);

  const [isSwapped, setIsSwapped] = React.useState(false);
  const [lockAmount, setLockAmount] = React.useState('');
  const [lockError, setLockError] = React.useState('');

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
    }
  };

  const handlePercentageClick = (percentage: number) => {
    if (availableBalance) {
      const amount = ((parseFloat(availableBalance) * percentage) / 100).toString();
      setLockAmount(amount);
      setLockError('');
    }
  };

  const isLockDisabled = !lockAmount || !!lockError || isLoading || availableBalanceNum === 0;

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
          <div className="flex items-center gap-3">
            {!sdkReady ? (
              <div className="text-sm text-brand-muted">Loading wallet...</div>
            ) : isConnected && borrowerAddress ? (
              <div className="px-4 py-2 rounded-xl bg-white/60 border border-gray-200 shadow-sm">
                <p className="text-[10px] text-gray-600 font-semibold uppercase tracking-wider">Wallet</p>
                <p className="font-mono text-sm font-semibold text-gray-900">
                  {borrowerAddress.slice(0, 6)}...{borrowerAddress.slice(-4)}
                </p>
              </div>
            ) : (
              <Button variant="outline" onClick={connect}>
                Connect wallet
              </Button>
            )}
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
                  disabled={isLockDisabled}
                  className="w-full h-12 text-sm font-semibold shadow-lg shadow-mantle/20 disabled:opacity-50 disabled:cursor-not-allowed hover:shadow-xl hover:scale-[1.01] transition-all"
                >
                  <Lock className="mr-2 h-4 w-4" /> Lock and Deposit
                </Button>
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
              <div className="space-y-1 pb-4 p-3 rounded-xl bg-white/60 border border-gray-200 shadow-sm">
                <p className="text-xs text-gray-600 font-medium uppercase tracking-wider">
                  Attested Collateral
                </p>
                <p className="text-2xl font-bold text-gray-900">
                  {isLoading ? '...' : formatTvl(morphoCollateral.data?.value ?? null)}{' '}
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

          {/* Loan Health Monitor */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShieldCheck
                  className={`h-5 w-5 ${isLoanHealthLoading || isLoanHealthUnavailable ? 'text-brand-muted' : isLoanHealthError ? 'text-danger-DEFAULT' : loanHealth.riskLevel === 'danger' ? 'text-danger-DEFAULT' : loanHealth.riskLevel === 'warning' ? 'text-warning-DEFAULT' : 'text-success'}`}
                />
                Loan Health
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col items-center justify-center py-8 space-y-8">
              {isLoanHealthLoading ? (
                // Loading State
                <div className="w-full flex flex-col items-center space-y-6 animate-pulse">
                  {/* Loading Gauge */}
                  <div className="relative w-48 h-24 bg-gradient-to-t from-gray-200 to-gray-100 rounded-t-full border-t-8 border-x-8 border-gray-200 flex items-end justify-center overflow-hidden">
                    <div className="absolute bottom-0 w-full text-center pb-2">
                      <div className="h-8 w-16 bg-gray-300 rounded mx-auto mb-1"></div>
                      <div className="h-3 w-20 bg-gray-200 rounded mx-auto"></div>
                    </div>
                  </div>

                  {/* Loading Text */}
                  <div className="flex items-center gap-2 text-brand-muted">
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    <span className="text-sm font-medium">Fetching blockchain data...</span>
                  </div>

                  {/* Loading Metrics */}
                  <div className="grid grid-cols-2 gap-8 w-full pt-4 border-t border-brand-light">
                    <div className="text-center space-y-2">
                      <div className="h-3 w-24 bg-gray-200 rounded mx-auto"></div>
                      <div className="h-6 w-32 bg-gray-300 rounded mx-auto"></div>
                    </div>
                    <div className="text-center space-y-2">
                      <div className="h-3 w-24 bg-gray-200 rounded mx-auto"></div>
                      <div className="h-6 w-32 bg-gray-300 rounded mx-auto"></div>
                    </div>
                  </div>
                </div>
              ) : isLoanHealthUnavailable ? (
                // Unavailable State
                <div className="w-full flex flex-col items-center space-y-6">
                  {/* Empty Gauge */}
                  <div className="relative w-48 h-24 bg-gradient-to-t from-gray-100 to-gray-50 rounded-t-full border-t-8 border-x-8 border-gray-200 flex items-end justify-center overflow-hidden">
                    <div className="absolute bottom-0 w-full text-center pb-2">
                      <span className="text-3xl font-bold text-gray-400">--</span>
                      <p className="text-xs text-brand-muted">Current LTV</p>
                    </div>
                  </div>

                  {/* Empty Metrics */}
                  <div className="grid grid-cols-2 gap-8 w-full pt-4 border-t border-brand-light">
                    <div className="text-center space-y-1">
                      <p className="text-xs text-brand-muted uppercase">Collateral Value</p>
                      <p className="text-xl font-bold text-gray-400">--</p>
                    </div>
                    <div className="text-center space-y-1">
                      <p className="text-xs text-brand-muted uppercase">Total Debt</p>
                      <p className="text-xl font-bold text-gray-400">--</p>
                    </div>
                  </div>

                  <div className="w-full space-y-3">
                    <p className="text-sm text-brand-muted text-center">
                      {!isAppConfigured
                        ? 'App not configured. Set contract addresses in env to view position.'
                        : 'Connect wallet to view position'}
                    </p>
                    {isAppConfigured && (
                      <Button variant="outline" className="w-full" onClick={connect}>
                        Connect wallet
                      </Button>
                    )}
                  </div>
                </div>
              ) : isLoanHealthError ? (
                // Error State
                <div className="w-full flex flex-col items-center space-y-4">
                  <p className="text-sm text-danger-DEFAULT font-medium">Failed to fetch loan health</p>
                  <Button variant="outline" onClick={loanHealth.refetch}>
                    Retry
                  </Button>
                </div>
              ) : (
                // Loaded State
                <>
                  {/* Gauge */}
                  <div className="relative w-48 h-24 bg-gradient-to-t from-brand-light to-white rounded-t-full border-t-8 border-x-8 border-brand-light flex items-end justify-center overflow-hidden">
                    <div className="absolute bottom-0 w-full text-center pb-2">
                      <span
                        className={`text-3xl font-bold ${loanHealth.riskLevel === 'danger' ? 'text-danger-DEFAULT' : loanHealth.riskLevel === 'warning' ? 'text-warning-DEFAULT' : 'text-brand-dark'}`}
                      >
                        {loanHealth.ltv !== null ? `${loanHealth.ltv.toFixed(1)}%` : '0%'}
                      </span>
                      <p className="text-xs text-brand-muted">Current LTV</p>
                    </div>
                    {/* Needle - rotates based on LTV (0% = -90deg, LLTV% = 0deg, >LLTV% = clamped) */}
                    {loanHealth.ltv !== null && (
                      <div
                        className={`absolute bottom-0 left-1/2 w-1 h-20 origin-bottom rounded-full transition-transform duration-500 ${loanHealth.riskLevel === 'danger' ? 'bg-danger-DEFAULT' : loanHealth.riskLevel === 'warning' ? 'bg-warning-DEFAULT' : 'bg-brand-dark'}`}
                        style={{
                          transform: `rotate(${Math.min(Math.max((loanHealth.ltv / effectiveLltvPercent) * 90 - 90, -90), 0)}deg)`,
                        }}
                      ></div>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-8 w-full pt-4 border-t border-brand-light">
                    <div className="text-center space-y-1">
                      <p className="text-xs text-brand-muted uppercase">Collateral Value</p>
                      <p className="text-xl font-bold text-brand-dark">
                        {loanHealth.collateralValue !== null
                          ? `$${loanHealth.collateralValue.toLocaleString('en-US', { maximumFractionDigits: 0 })}`
                          : '$0'}
                      </p>
                    </div>
                    <div className="text-center space-y-1">
                      <p className="text-xs text-brand-muted uppercase">Total Debt</p>
                      <p className="text-xl font-bold text-brand-dark">
                        {loanHealth.debtValue !== null
                          ? `$${loanHealth.debtValue.toLocaleString('en-US', { maximumFractionDigits: 0 })}`
                          : '$0'}
                      </p>
                    </div>
                  </div>

                  {/* Health Factor & Liquidation Warning */}
                  {loanHealth.debtValue !== null && loanHealth.debtValue > 0 && (
                    <div className="w-full space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-brand-muted">Health Factor:</span>
                        <span
                          className={`font-bold ${loanHealth.healthFactor !== null && loanHealth.healthFactor < 1.1 ? 'text-danger-DEFAULT' : loanHealth.healthFactor !== null && loanHealth.healthFactor < 1.3 ? 'text-warning-DEFAULT' : 'text-success-DEFAULT'}`}
                        >
                          {loanHealth.healthFactor === Infinity
                            ? '∞'
                            : loanHealth.healthFactor !== null
                              ? (
                                  Math.round((loanHealth.healthFactor + Number.EPSILON) * 100) / 100
                                ).toFixed(2)
                              : '-'}
                        </span>
                      </div>
                      {loanHealth.riskLevel !== 'safe' && (
                        <div
                          className={`p-3 rounded-lg border-2 ${loanHealth.riskLevel === 'danger' ? 'bg-red-50 border-red-200' : 'bg-yellow-50 border-yellow-200'}`}
                        >
                          <p
                            className={`text-xs font-medium ${loanHealth.riskLevel === 'danger' ? 'text-red-700' : 'text-yellow-700'}`}
                          >
                            {loanHealth.riskLevel === 'danger'
                              ? 'Critical: Position at risk of liquidation!'
                              : 'Warning: Approaching liquidation threshold'}
                          </p>
                          {loanHealth.liquidationPrice !== null && (
                            <p
                              className={`text-xs mt-1 ${loanHealth.riskLevel === 'danger' ? 'text-red-600' : 'text-yellow-600'}`}
                            >
                              Liquidation price: ${loanHealth.liquidationPrice.toFixed(4)}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
