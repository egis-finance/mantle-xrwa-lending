'use client';

import React from 'react';
import type { ReactElement } from 'react';
import { Navbar } from '@/components/Navbar';
import { Footer } from '@/components/Footer';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowRightLeft, Lock, Wallet, Loader2, CheckCircle2, AlertTriangle, PlusCircle, MinusCircle, ArrowDownCircle, ArrowUpCircle, RefreshCw } from 'lucide-react';
import { useDynamicContext } from '@dynamic-labs/sdk-react-core';
import { isEthereumWallet } from '@dynamic-labs/ethereum';
import { useDynamicWallet } from '@/hooks/useDynamicWallet';
import { useSDKReady } from '@/hooks/useSDKReady';
import { useLockedUSDY } from '@/hooks/useLockedUSDY';
import { useMorphoCollateral } from '@/hooks/useMorphoCollateral';
import { useBorrowerBalance } from '@/hooks/useBorrowerBalance';
import { useAcUSDYBalance } from '@/hooks/useAcUSDYBalance';
import { useBorrowerDebt } from '@/hooks/useBorrowerDebt';
import { useSystemParams } from '@/hooks/useSystemParams';
import { useChainAbstracted } from '@/hooks/useChainAbstracted';
import { useSupplyAcUSDY } from '@/hooks/useSupplyAcUSDY';
import { useBorrowUSDC } from '@/hooks/useBorrowUSDC';
import { useRepayUSDC } from '@/hooks/useRepayUSDC';
import { useWithdrawAcUSDY } from '@/hooks/useWithdrawAcUSDY';
import { LoanHealthCard } from '@/components/LoanHealthCard';
import { contracts } from '@/lib/contracts';
import { formatTvl } from '@/lib/format';
import { formatError } from '@/lib/errors';
import { cn } from '@/lib/utils';
import { parseUnits, formatUnits } from 'viem';
import { CollateralLockerAbi } from '@/lib/contracts/abis/CollateralLocker';
import { ERC20Abi } from '@/lib/contracts/abis/ERC20';
import { invalidateUserReads, invalidateCrossChainReads, invalidateBatchReads } from '@/lib/swr/invalidation';
import { MANTLE_CHAIN_ID } from '@/lib/dynamic/chains';

export default function BorrowPage(): ReactElement {
  const sdkReady = useSDKReady();
  const { primaryWallet } = useDynamicContext();
  const { address: borrowerAddress, isConnected } = useDynamicWallet();
  const { signOnMantle, waitForTransaction } = useChainAbstracted();

  // Wallet gating: require connected Ethereum wallet for borrower operations
  const walletReady = primaryWallet && isEthereumWallet(primaryWallet);
  const effectiveAddress = walletReady ? borrowerAddress : undefined;

  // Borrower's locked USDY on Mantle (not protocol TVL)
  const lockedUSDY = useLockedUSDY(effectiveAddress);
  // Borrower's AcUSDY collateral in Morpho on Ethereum
  const morphoCollateral = useMorphoCollateral(effectiveAddress);
  // Borrower's AcUSDY balance in wallet on Ethereum
  const acUsdyBalance = useAcUSDYBalance(effectiveAddress);
  // Borrower's total USDY balance on Mantle
  const borrowerBalance = useBorrowerBalance(effectiveAddress);
  // Borrower's debt position in Morpho
  const borrowerDebt = useBorrowerDebt(effectiveAddress);
  // Morpho market parameters (LLTV, oracle price from on-chain)
  const systemParams = useSystemParams();

  // Write hooks for borrower operations (require marketParams)
  const { supplyCollateral, status: supplyStatus, statusMessage: supplyMessage, error: supplyError, reset: resetSupply } = useSupplyAcUSDY(systemParams.marketParams);
  const { borrow, status: borrowStatus, statusMessage: borrowMessage, error: borrowError, reset: resetBorrow } = useBorrowUSDC(systemParams.marketParams);
  const { repay, status: repayStatus, statusMessage: repayMessage, error: repayError, reset: resetRepay } = useRepayUSDC(systemParams.marketParams);
  const { withdrawCollateral, status: withdrawStatus, statusMessage: withdrawMessage, error: withdrawError, reset: resetWithdraw } = useWithdrawAcUSDY(systemParams.marketParams);

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

  // Remaining borrow capacity: collateral * price * lltv - existing debt
  const remainingCapacity = React.useMemo(() => {
    const collateralRaw = morphoCollateral.data?.raw;
    const priceRaw = systemParams.oraclePriceRaw;
    const lltvRaw = systemParams.marketParams?.lltv;
    const existingDebtRaw = borrowerDebt.data?.debtAssetsRaw;

    // Only compute when ALL inputs are valid bigints
    if (
      collateralRaw == null ||
      priceRaw == null ||
      lltvRaw == null ||
      existingDebtRaw == null // null means unknown, 0n means no debt
    ) {
      return null;
    }

    // Decimal math: 18 (collateral) + 24 (price) + 18 (lltv) = 60, target 6 (USDC)
    const totalBorrowLimit = (collateralRaw * priceRaw * lltvRaw) / (10n ** 54n);
    return totalBorrowLimit > existingDebtRaw
      ? totalBorrowLimit - existingDebtRaw
      : 0n;
  }, [morphoCollateral.data?.raw, systemParams.oraclePriceRaw, systemParams.marketParams?.lltv, borrowerDebt.data?.debtAssetsRaw]);

  const safeBorrowCapacity = React.useMemo(() => {
    if (remainingCapacity == null) return null;
    // Apply a 0.5% safety buffer to account for Morpho rounding and interest accrual.
    return (remainingCapacity * 995n) / 1000n;
  }, [remainingCapacity]);

  // Safe withdraw amount based on current debt, price, and LLTV
  const safeWithdrawRaw = React.useMemo(() => {
    const collateralRaw = morphoCollateral.data?.raw;
    const debtAssetsRaw = borrowerDebt.data?.debtAssetsRaw;

    if (morphoCollateral.isError || borrowerDebt.isError || systemParams.isError) return null;
    if (collateralRaw == null || debtAssetsRaw == null) return null;
    if (debtAssetsRaw === 0n) return collateralRaw;

    const priceRaw = systemParams.oraclePriceRaw;
    const lltvRaw = systemParams.marketParams?.lltv;
    if (priceRaw == null || lltvRaw == null || priceRaw === 0n || lltvRaw === 0n) return null;

    // Required collateral = ceil((debt * 10^54) / (price * lltv))
    const numerator = debtAssetsRaw * 10n ** 54n;
    const denominator = priceRaw * lltvRaw;
    const requiredCollateral = (numerator + denominator - 1n) / denominator;

    return collateralRaw > requiredCollateral ? collateralRaw - requiredCollateral : 0n;
  }, [
    morphoCollateral.data?.raw,
    morphoCollateral.isError,
    borrowerDebt.data?.debtAssetsRaw,
    borrowerDebt.isError,
    systemParams.oraclePriceRaw,
    systemParams.marketParams?.lltv,
    systemParams.isError,
  ]);

  // State for action card inputs
  // We track both display strings and optional raw values for MAX button scenarios
  // to avoid locale-dependent parseUnits issues with number inputs
  const [supplyAmount, setSupplyAmount] = React.useState('');
  const [supplyAmountRaw, setSupplyAmountRaw] = React.useState<bigint | null>(null);
  const [borrowAmount, setBorrowAmount] = React.useState('');
  const [borrowAmountRaw, setBorrowAmountRaw] = React.useState<bigint | null>(null);
  const [repayAmount, setRepayAmount] = React.useState('');
  const [repayMode, setRepayMode] = React.useState<'partial' | 'full'>('partial');
  const [withdrawAmount, setWithdrawAmount] = React.useState('');
  const [withdrawAmountRaw, setWithdrawAmountRaw] = React.useState<bigint | null>(null);

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

      setLockAmount('');

      // Invalidate all relevant caches to refresh UI BEFORE showing success
      // This ensures the displayed balances are fresh, not stale cached values
      // - Batch reads: Mantle chain multicalls (locked USDY, borrower balance)
      // - User reads: balances and positions tied to user address
      // - Cross-chain reads: any dual-chain aggregations
      if (borrowerAddress) {
        invalidateBatchReads(MANTLE_CHAIN_ID); // Invalidate Mantle multicalls first
        await invalidateUserReads(borrowerAddress);
        invalidateCrossChainReads();
      }

      // Set success AFTER cache invalidation to ensure UI shows fresh data
      setTxStatus('success');
    } catch (err) {
      console.error('Lock failed:', err);
      setTxStatus('error');
      setLockError(formatError(err));
    } finally {
      setIsLocking(false);
    }
  };

  const isLockDisabled = !lockAmount || !!lockError || isLoading || availableBalanceNum === 0 || isLocking;

  const handleReset = () => {
    setTxStatus('idle');
    setLockAmount('');
    setLockError('');
  };

  // Helper to safely parse amount, handling locale decimal separators and exponent notation
  const safeParseUnits = (value: string, decimals: number): bigint => {
    const normalized = value.replace(',', '.').trim();
    if (!/[eE]/.test(normalized)) {
      return parseUnits(normalized, decimals);
    }

    const match = normalized.match(/^([+-])?(\d+)(?:\.(\d+))?[eE]([+-]?\d+)$/);
    if (!match) {
      return parseUnits(normalized, decimals);
    }

    const sign = match[1] ?? '';
    const integerPart = match[2];
    const fractionalPart = match[3] ?? '';
    const exponent = Number.parseInt(match[4], 10);
    const digits = integerPart + fractionalPart;
    const decimalIndex = integerPart.length;
    const shiftedIndex = decimalIndex + exponent;

    if (shiftedIndex >= digits.length) {
      return parseUnits(`${sign}${digits}${'0'.repeat(shiftedIndex - digits.length)}`, decimals);
    }

    if (shiftedIndex <= 0) {
      return parseUnits(`${sign}0.${'0'.repeat(-shiftedIndex)}${digits}`, decimals);
    }

    return parseUnits(
      `${sign}${digits.slice(0, shiftedIndex)}.${digits.slice(shiftedIndex)}`,
      decimals
    );
  };

  const borrowAmountParsed = React.useMemo(() => {
    if (!borrowAmount) return null;
    if (borrowAmountRaw !== null) return borrowAmountRaw;
    try {
      return safeParseUnits(borrowAmount, 6);
    } catch {
      return null;
    }
  }, [borrowAmount, borrowAmountRaw]);

  const borrowAmountExceedsCapacity = safeBorrowCapacity !== null &&
    borrowAmountParsed !== null &&
    borrowAmountParsed > safeBorrowCapacity;

  const repayAmountParsed = React.useMemo(() => {
    if (!repayAmount || repayMode === 'full') return null;
    try {
      return safeParseUnits(repayAmount, 6);
    } catch {
      return null;
    }
  }, [repayAmount, repayMode]);

  const repayAmountExceedsDebt = repayMode === 'partial' &&
    repayAmountParsed !== null &&
    borrowerDebt.data?.debtAssetsRaw != null &&
    repayAmountParsed > borrowerDebt.data.debtAssetsRaw;

  // Full repay amount with 0.1% interest buffer to account for accrual between
  // submission and confirmation. Matches the buffer in useRepayUSDC.ts line 175.
  const fullRepayAmount = React.useMemo(() => {
    const debtRaw = borrowerDebt.data?.debtAssetsRaw;
    if (debtRaw == null || debtRaw === 0n) return null;
    return (debtRaw * 1001n) / 1000n;
  }, [borrowerDebt.data?.debtAssetsRaw]);

  const fullRepayFormatted = fullRepayAmount
    ? `$${formatUnits(fullRepayAmount, 6)}`
    : '--';

  // Action card handlers
  // Each handler resets status before starting to clear any previous success/error state
  // Uses raw value if available (from MAX button), otherwise parses the input string
  const handleSupply = async () => {
    if (!supplyAmount) return;
    resetSupply(); // Clear previous state before new action
    try {
      const amount = supplyAmountRaw ?? safeParseUnits(supplyAmount, 18);
      await supplyCollateral(amount);
      setSupplyAmount('');
      setSupplyAmountRaw(null);
    } catch (err) {
      console.error('Supply failed:', err);
    }
  };

  const handleBorrow = async () => {
    if (!borrowAmount) return;
    resetBorrow(); // Clear previous state before new action
    try {
      const amount = borrowAmountRaw ?? safeParseUnits(borrowAmount, 6);
      await borrow(amount);
      setBorrowAmount('');
      setBorrowAmountRaw(null);
    } catch (err) {
      console.error('Borrow failed:', err);
    }
  };

  const handleRepay = async () => {
    resetRepay(); // Clear previous state before new action
    try {
      const isFullRepay = repayMode === 'full';
      const amount = isFullRepay ? 0n : safeParseUnits(repayAmount, 6);
      await repay(
        amount,
        isFullRepay,
        borrowerDebt.data?.debtAssetsRaw ?? null,
        borrowerDebt.data?.borrowShares ?? null
      );
      setRepayAmount('');
      setRepayMode('partial'); // Reset to partial after success
    } catch (err) {
      console.error('Repay failed:', err);
    }
  };

  const handleWithdraw = async () => {
    if (!withdrawAmount) return;
    resetWithdraw(); // Clear previous state before new action
    try {
      const amount = withdrawAmountRaw ?? safeParseUnits(withdrawAmount, 18);
      await withdrawCollateral(amount);
      setWithdrawAmount('');
      setWithdrawAmountRaw(null);
    } catch (err) {
      console.error('Withdraw failed:', err);
    }
  };

  // Disable conditions for action buttons
  // Allow re-triggering when status is 'success' (user can perform another action without manually dismissing)
  const supplyDisabled = !supplyAmount || !acUsdyBalance.data?.raw || acUsdyBalance.data.raw === 0n || (supplyStatus !== 'idle' && supplyStatus !== 'success');
  const borrowDisabled =
    !borrowAmount ||
    borrowAmountParsed === null ||
    borrowAmountParsed <= 0n ||
    borrowAmountExceedsCapacity ||
    safeBorrowCapacity === null ||
    safeBorrowCapacity === 0n ||
    morphoCollateral.data?.raw === 0n ||
    systemParams.oracleIsStale === true ||
    morphoCollateral.isError ||
    systemParams.isError ||
    borrowerDebt.isError ||
    (borrowStatus !== 'idle' && borrowStatus !== 'success');
  const repayDisabled =
    (repayMode === 'partial' && (
      !repayAmount ||
      repayAmountParsed === null ||
      repayAmountParsed <= 0n ||
      repayAmountExceedsDebt
    )) ||
    (repayMode === 'full' && (borrowerDebt.data?.debtAssetsRaw == null || borrowerDebt.data.debtAssetsRaw === 0n)) ||
    borrowerDebt.isError ||
    (repayStatus !== 'idle' && repayStatus !== 'success');
  const withdrawDisabled = !withdrawAmount || morphoCollateral.isError || (withdrawStatus !== 'idle' && withdrawStatus !== 'success');

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
                                                className="px-3 py-1.5 text-xs font-medium text-white bg-brand-DEFAULT hover:bg-brand-dark rounded-md transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer hover:scale-110 active:scale-95 hover:shadow-md"
                                            >
                                                25%
                                            </button>
                                            <button
                                                onClick={() => handlePercentageClick(50)}
                                                disabled={isLoading || availableBalanceNum === 0}
                                                type="button"
                                                className="px-3 py-1.5 text-xs font-medium text-white bg-brand-DEFAULT hover:bg-brand-dark rounded-md transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer hover:scale-110 active:scale-95 hover:shadow-md"
                                            >
                                                50%
                                            </button>
                                            <button
                                                onClick={handleMaxClick}
                                                disabled={isLoading || availableBalanceNum === 0}
                                                type="button"
                                                className="px-3 py-1.5 text-xs font-medium text-white bg-brand-DEFAULT hover:bg-brand-dark rounded-md transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer hover:scale-110 active:scale-95 hover:shadow-md"
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
                                            <div className="flex-1">
                                                <p className="text-sm text-red-700 font-medium">{lockError}</p>
                                                <button 
                                                    onClick={handleReset}
                                                    className="text-xs text-red-600 underline mt-1 hover:text-red-800 transition-colors"
                                                >
                                                    Reset Form
                                                </button>
                                            </div>
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

                {/* Lower Section: Action Cards & Health */}
                <div className="grid lg:grid-cols-[3fr_2fr] gap-8">
                  {/* Action Cards Column */}
                  <div className="space-y-4">
                    {!walletReady ? (
                      // Connect wallet CTA when not connected
                      <Card className="border-none shadow-soft-xl">
                        <CardContent className="py-12 text-center">
                          <Wallet className="h-12 w-12 text-brand-muted mx-auto mb-4" />
                          <h3 className="text-xl font-semibold text-brand-dark mb-2">Connect Wallet to Borrow</h3>
                          <p className="text-sm text-brand-muted max-w-md mx-auto">
                            Connect your wallet to supply collateral, borrow USDC, repay debt, and withdraw assets.
                          </p>
                        </CardContent>
                      </Card>
                    ) : (
                      // 4 Action Cards when connected
                      <>
                        {/* Supply AcUSDY Card */}
                        <Card className="border-none shadow-soft-xl">
                          <CardHeader className="pb-2">
                            <CardTitle className="flex items-center gap-2 text-base">
                              <PlusCircle className="h-4 w-4 text-emerald-500" />
                              Supply Collateral
                            </CardTitle>
                          </CardHeader>
                          <CardContent className="space-y-3">
                            {acUsdyBalance.isError ? (
                              <div className="flex items-center justify-between p-3 bg-red-50 rounded-lg border border-red-200">
                                <p className="text-sm text-red-700">Failed to load balance</p>
                                <Button variant="ghost" size="sm" onClick={() => acUsdyBalance.refetch()}>
                                  <RefreshCw className="h-4 w-4" />
                                </Button>
                              </div>
                            ) : (
                              <>
                                <div className="flex items-center justify-between text-sm">
                                  <span className="text-brand-muted">Available AcUSDY</span>
                                  <span className="font-medium">
                                    {acUsdyBalance.isLoading ? '...' : formatTvl(acUsdyBalance.data?.value ?? '0')}
                                  </span>
                                </div>
                                <div className="flex gap-2">
                                  <input
                                    type="number"
                                    value={supplyAmount}
                                    onChange={(e) => { setSupplyAmount(e.target.value); setSupplyAmountRaw(null); }}
                                    placeholder="0.00"
                                    className="flex-1 h-10 px-3 rounded-lg border border-gray-200 bg-white focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 outline-none text-sm"
                                    disabled={supplyStatus !== 'idle' && supplyStatus !== 'success'}
                                  />
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => {
                                      setSupplyAmount(acUsdyBalance.data?.value ?? '0');
                                      setSupplyAmountRaw(acUsdyBalance.data?.raw ?? null);
                                    }}
                                    disabled={!acUsdyBalance.data?.raw || acUsdyBalance.data.raw === 0n}
                                    className="text-xs"
                                  >
                                    MAX
                                  </Button>
                                </div>
                                {supplyError && (
                                  <div className="flex items-center justify-between">
                                    <p className="text-xs text-red-600">{formatError(supplyError)}</p>
                                    <Button variant="ghost" size="sm" onClick={resetSupply} className="h-6 text-xs">Reset</Button>
                                  </div>
                                )}
                                {supplyStatus !== 'idle' && supplyStatus !== 'error' && (
                                  <div className="flex items-center justify-between">
                                    <p className="text-xs text-emerald-600 flex items-center gap-1">
                                      {supplyStatus === 'success' ? (
                                        <><CheckCircle2 className="h-3 w-3" /> {supplyMessage}</>
                                      ) : (
                                        <><Loader2 className="h-3 w-3 animate-spin" /> {supplyMessage}</>
                                      )}
                                    </p>
                                    {supplyStatus === 'success' && (
                                      <button onClick={resetSupply} className="text-xs underline hover:opacity-80 text-emerald-600">
                                        Dismiss
                                      </button>
                                    )}
                                  </div>
                                )}
                                <Button
                                  onClick={handleSupply}
                                  disabled={supplyDisabled}
                                  className="w-full bg-emerald-500 hover:bg-emerald-600 text-white"
                                  size="sm"
                                >
                                  {['approving', 'supplying', 'confirming'].includes(supplyStatus) ? (
                                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                  ) : (
                                    <PlusCircle className="h-4 w-4 mr-2" />
                                  )}
                                  Supply AcUSDY
                                </Button>
                              </>
                            )}
                          </CardContent>
                        </Card>

                        {/* Borrow USDC Card */}
                        <Card className="border-none shadow-soft-xl">
                          <CardHeader className="pb-2">
                            <CardTitle className="flex items-center gap-2 text-base">
                              <ArrowDownCircle className="h-4 w-4 text-blue-500" />
                              Borrow USDC
                            </CardTitle>
                          </CardHeader>
                          <CardContent className="space-y-3">
                            {systemParams.oracleIsStale && (
                              <div className="flex items-center gap-2 p-2 bg-yellow-50 rounded-lg border border-yellow-200">
                                <AlertTriangle className="h-4 w-4 text-yellow-600" />
                                <p className="text-xs text-yellow-700">Oracle price stale - borrowing disabled</p>
                              </div>
                            )}
                            {morphoCollateral.isError || systemParams.isError || borrowerDebt.isError ? (
                              <div className="flex items-center justify-between text-sm">
                                <span className="text-red-500 text-xs">Failed to load position data</span>
                                <button
                                  onClick={() => { morphoCollateral.refetch(); systemParams.refetch(); borrowerDebt.refetch(); }}
                                  className="text-xs underline hover:opacity-80 text-blue-600"
                                >
                                  Retry
                                </button>
                              </div>
                            ) : (
                              <div className="flex items-center justify-between text-sm">
                                <span className="text-brand-muted">Remaining Capacity</span>
                                <span className="font-medium">
                                  {remainingCapacity === null ? '--' : `$${formatUnits(remainingCapacity, 6)}`}
                                </span>
                              </div>
                            )}
                            {remainingCapacity !== null && (
                              <p className="text-xs text-brand-muted">
                                MAX applies a 0.5% safety buffer.
                              </p>
                            )}
                            {!morphoCollateral.isError && !systemParams.isError && morphoCollateral.data?.raw === 0n && (
                              <p className="text-xs text-brand-muted">Supply collateral first to enable borrowing</p>
                            )}
                            <div className="flex gap-2">
                              <input
                                type="number"
                                value={borrowAmount}
                                onChange={(e) => { setBorrowAmount(e.target.value); setBorrowAmountRaw(null); }}
                                placeholder="0.00"
                                className="flex-1 h-10 px-3 rounded-lg border border-gray-200 bg-white focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 outline-none text-sm"
                                disabled={(borrowStatus !== 'idle' && borrowStatus !== 'success') || systemParams.oracleIsStale || morphoCollateral.isError || systemParams.isError || borrowerDebt.isError}
                              />
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  if (safeBorrowCapacity) {
                                    setBorrowAmount(formatUnits(safeBorrowCapacity, 6));
                                    setBorrowAmountRaw(safeBorrowCapacity);
                                  }
                                }}
                                disabled={!safeBorrowCapacity || safeBorrowCapacity === 0n || morphoCollateral.isError || systemParams.isError || borrowerDebt.isError}
                                className="text-xs"
                              >
                                MAX
                              </Button>
                            </div>
                            {borrowAmountExceedsCapacity && (
                              <p className="text-xs text-red-600">
                                Amount exceeds safe max borrow.
                              </p>
                            )}
                            {borrowError && (
                              <div className="flex items-center justify-between">
                                <p className="text-xs text-red-600">{formatError(borrowError)}</p>
                                <Button variant="ghost" size="sm" onClick={resetBorrow} className="h-6 text-xs">Reset</Button>
                              </div>
                            )}
                            {borrowStatus !== 'idle' && borrowStatus !== 'error' && (
                              <div className="flex items-center justify-between">
                                <p className="text-xs text-blue-600 flex items-center gap-1">
                                  {borrowStatus === 'success' ? (
                                    <><CheckCircle2 className="h-3 w-3" /> {borrowMessage}</>
                                  ) : (
                                    <><Loader2 className="h-3 w-3 animate-spin" /> {borrowMessage}</>
                                  )}
                                </p>
                                {borrowStatus === 'success' && (
                                  <button onClick={resetBorrow} className="text-xs underline hover:opacity-80 text-blue-600">
                                    Dismiss
                                  </button>
                                )}
                              </div>
                            )}
                            <Button
                              onClick={handleBorrow}
                              disabled={borrowDisabled}
                              className="w-full bg-blue-500 hover:bg-blue-600 text-white"
                              size="sm"
                            >
                              {['borrowing', 'confirming'].includes(borrowStatus) ? (
                                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                              ) : (
                                <ArrowDownCircle className="h-4 w-4 mr-2" />
                              )}
                              Borrow USDC
                            </Button>
                          </CardContent>
                        </Card>

                        {/* Repay USDC Card */}
                        <Card className="border-none shadow-soft-xl">
                          <CardHeader className="pb-2">
                            <CardTitle className="flex items-center gap-2 text-base">
                              <ArrowUpCircle className="h-4 w-4 text-purple-500" />
                              Repay Debt
                            </CardTitle>
                          </CardHeader>
                          <CardContent className="space-y-3">
                            {borrowerDebt.isError ? (
                              <div className="flex items-center justify-between text-sm">
                                <span className="text-red-500 text-xs">Failed to load debt</span>
                                <button
                                  onClick={() => borrowerDebt.refetch()}
                                  className="text-xs underline hover:opacity-80 text-purple-600"
                                >
                                  Retry
                                </button>
                              </div>
                            ) : (
                              <div className="flex items-center justify-between text-sm">
                                <span className="text-brand-muted">Current Debt</span>
                                <span className="font-medium">
                                  {borrowerDebt.isLoading ? '...' : (
                                    borrowerDebt.data?.debtAssetsRaw == null ? '--' :
                                    borrowerDebt.data.debtAssetsRaw === 0n ? '$0.00' :
                                    `$${formatUnits(borrowerDebt.data.debtAssetsRaw, 6)}`
                                  )}
                                </span>
                              </div>
                            )}
                            {/* Repay Mode Selector */}
                            <div className="flex rounded-lg border border-gray-200 overflow-hidden">
                              <button
                                type="button"
                                onClick={() => setRepayMode('partial')}
                                className={cn(
                                  "flex-1 py-2 px-3 text-sm font-medium transition-colors",
                                  repayMode === 'partial'
                                    ? "bg-purple-500 text-white"
                                    : "bg-white text-gray-600 hover:bg-gray-50"
                                )}
                                disabled={repayStatus !== 'idle' && repayStatus !== 'success'}
                              >
                                Partial
                              </button>
                              <button
                                type="button"
                                onClick={() => { setRepayMode('full'); setRepayAmount(''); }}
                                disabled={
                                  borrowerDebt.isError ||
                                  borrowerDebt.data?.debtAssetsRaw == null ||
                                  borrowerDebt.data.debtAssetsRaw === 0n ||
                                  (repayStatus !== 'idle' && repayStatus !== 'success')
                                }
                                className={cn(
                                  "flex-1 py-2 px-3 text-sm font-medium transition-colors",
                                  repayMode === 'full'
                                    ? "bg-purple-500 text-white"
                                    : "bg-white text-gray-600 hover:bg-gray-50",
                                  "disabled:opacity-50 disabled:cursor-not-allowed"
                                )}
                              >
                                Full ({fullRepayFormatted})
                              </button>
                            </div>

                            {/* Partial Amount Input (only when partial mode) */}
                            {repayMode === 'partial' && (
                              <input
                                type="number"
                                value={repayAmount}
                                onChange={(e) => setRepayAmount(e.target.value)}
                                placeholder="0.00"
                                className="w-full h-10 px-3 rounded-lg border border-gray-200 bg-white focus:ring-2 focus:ring-purple-500/30 focus:border-purple-500 outline-none text-sm"
                                disabled={(repayStatus !== 'idle' && repayStatus !== 'success') || borrowerDebt.isError}
                              />
                            )}

                            {/* Validation messages */}
                            {repayMode === 'partial' && repayAmountExceedsDebt && (
                              <p className="text-xs text-red-600">
                                Cannot exceed {fullRepayFormatted} (full debt). Select &quot;Full&quot; to clear all debt.
                              </p>
                            )}

                            {/* Full mode explanation */}
                            {repayMode === 'full' && (
                              <p className="text-xs text-purple-600">
                                Includes 0.1% buffer for interest accrual between now and transaction confirmation.
                              </p>
                            )}
                            {repayError && (
                              <div className="flex items-center justify-between">
                                <p className="text-xs text-red-600">{formatError(repayError)}</p>
                                <Button variant="ghost" size="sm" onClick={resetRepay} className="h-6 text-xs">Reset</Button>
                              </div>
                            )}
                            {repayStatus !== 'idle' && repayStatus !== 'error' && (
                              <div className="flex items-center justify-between">
                                <p className="text-xs text-purple-600 flex items-center gap-1">
                                  {repayStatus === 'success' ? (
                                    <><CheckCircle2 className="h-3 w-3" /> {repayMessage}</>
                                  ) : (
                                    <><Loader2 className="h-3 w-3 animate-spin" /> {repayMessage}</>
                                  )}
                                </p>
                                {repayStatus === 'success' && (
                                  <button onClick={resetRepay} className="text-xs underline hover:opacity-80 text-purple-600">
                                    Dismiss
                                  </button>
                                )}
                              </div>
                            )}
                            <Button
                              onClick={handleRepay}
                              disabled={repayDisabled}
                              className="w-full bg-purple-500 hover:bg-purple-600 text-white"
                              size="sm"
                            >
                              {['approving', 'repaying', 'confirming'].includes(repayStatus) ? (
                                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                              ) : (
                                <ArrowUpCircle className="h-4 w-4 mr-2" />
                              )}
                              {repayMode === 'full' ? 'Repay Full Debt' : 'Repay USDC'}
                            </Button>
                          </CardContent>
                        </Card>

                        {/* Withdraw AcUSDY Card */}
                        <Card className="border-none shadow-soft-xl">
                          <CardHeader className="pb-2">
                            <CardTitle className="flex items-center gap-2 text-base">
                              <MinusCircle className="h-4 w-4 text-orange-500" />
                              Withdraw Collateral
                            </CardTitle>
                          </CardHeader>
                          <CardContent className="space-y-3">
                            {morphoCollateral.isError ? (
                              <div className="flex items-center justify-between text-sm">
                                <span className="text-red-500 text-xs">Failed to load collateral</span>
                                <button
                                  onClick={() => morphoCollateral.refetch()}
                                  className="text-xs underline hover:opacity-80 text-orange-600"
                                >
                                  Retry
                                </button>
                              </div>
                            ) : (
                              <div className="flex items-center justify-between text-sm">
                                <span className="text-brand-muted">Supplied to Morpho</span>
                                <span className="font-medium">
                                  {morphoCollateral.isLoading ? '...' : formatTvl(morphoCollateral.data?.value ?? '0')}
                                </span>
                              </div>
                            )}
                            <div className="flex gap-2">
                              <input
                                type="number"
                                value={withdrawAmount}
                                onChange={(e) => { setWithdrawAmount(e.target.value); setWithdrawAmountRaw(null); }}
                                placeholder="0.00"
                                className="flex-1 h-10 px-3 rounded-lg border border-gray-200 bg-white focus:ring-2 focus:ring-orange-500/30 focus:border-orange-500 outline-none text-sm"
                                disabled={(withdrawStatus !== 'idle' && withdrawStatus !== 'success') || morphoCollateral.isError}
                              />
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  if (safeWithdrawRaw == null) return;
                                  setWithdrawAmount(formatUnits(safeWithdrawRaw, 18));
                                  setWithdrawAmountRaw(safeWithdrawRaw);
                                }}
                                disabled={morphoCollateral.isError || safeWithdrawRaw == null || safeWithdrawRaw === 0n}
                                className="text-xs"
                              >
                                MAX
                              </Button>
                            </div>
                            {borrowerDebt.data?.debtAssetsRaw && borrowerDebt.data.debtAssetsRaw > 0n && (
                              <p className="text-xs text-orange-600">
                                ⚠️ You have outstanding debt. Withdrawing too much may cause liquidation.
                              </p>
                            )}
                            {withdrawError && (
                              <div className="flex items-center justify-between">
                                <p className="text-xs text-red-600">{formatError(withdrawError)}</p>
                                <Button variant="ghost" size="sm" onClick={resetWithdraw} className="h-6 text-xs">Reset</Button>
                              </div>
                            )}
                            {withdrawStatus !== 'idle' && withdrawStatus !== 'error' && (
                              <div className="flex items-center justify-between">
                                <p className="text-xs text-orange-600 flex items-center gap-1">
                                  {withdrawStatus === 'success' ? (
                                    <><CheckCircle2 className="h-3 w-3" /> {withdrawMessage}</>
                                  ) : (
                                    <><Loader2 className="h-3 w-3 animate-spin" /> {withdrawMessage}</>
                                  )}
                                </p>
                                {withdrawStatus === 'success' && (
                                  <button onClick={resetWithdraw} className="text-xs underline hover:opacity-80 text-orange-600">
                                    Dismiss
                                  </button>
                                )}
                              </div>
                            )}
                            <Button
                              onClick={handleWithdraw}
                              disabled={withdrawDisabled}
                              className="w-full bg-orange-500 hover:bg-orange-600 text-white"
                              size="sm"
                            >
                              {['withdrawing', 'confirming'].includes(withdrawStatus) ? (
                                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                              ) : (
                                <MinusCircle className="h-4 w-4 mr-2" />
                              )}
                              Withdraw AcUSDY
                            </Button>
                          </CardContent>
                        </Card>
                      </>
                    )}
                  </div>

                  {/* Loan Health Card */}
                  <LoanHealthCard />
                </div>
            </main>

            <Footer />
        </div>
    );
}
