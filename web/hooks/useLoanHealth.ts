'use client';

import { useMemo } from 'react';
import { useMorphoCollateral } from './useMorphoCollateral';
import { useBorrowerDebt } from './useBorrowerDebt';
import { useOraclePrice } from './useOraclePrice';
import type { Address } from 'viem';

// Default LLTV matches deployed Morpho market (86%)
// Callers should pass lltv from useSystemParams for on-chain accuracy
const DEFAULT_LLTV = 0.86;

export interface LoanHealthMetrics {
  collateralValue: number | null;
  debtValue: number | null;
  ltv: number | null;
  healthFactor: number | null;
  liquidationPrice: number | null;
  isHealthy: boolean;
  riskLevel: 'safe' | 'warning' | 'danger';
}

export interface LoanHealthResult extends LoanHealthMetrics {
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
}

export interface UseLoanHealthOptions {
  /** LLTV from useSystemParams (0.0-1.0 scale). Defaults to 0.86 if not provided. */
  lltv?: number | null;
}

/**
 * Calculates loan health metrics from Morpho position.
 * Uses AcUSDY collateral on Ethereum (not locked USDY on Mantle).
 */
export function useLoanHealth(
  borrowerAddress: Address | undefined,
  options: UseLoanHealthOptions = {}
): LoanHealthResult {
  const collateral = useMorphoCollateral(borrowerAddress);
  const debt = useBorrowerDebt(borrowerAddress);
  const oraclePrice = useOraclePrice();

  // Use provided LLTV or fall back to default (86% matches deployed market)
  const effectiveLltv = options.lltv ?? DEFAULT_LLTV;

  const isLoading = collateral.isLoading || debt.isLoading || oraclePrice.isLoading;
  const isError = collateral.isError || debt.isError || oraclePrice.isError;

  const metrics = useMemo((): LoanHealthMetrics => {
    const collateralVal = collateral.data?.value;
    const debtVal = debt.data?.value;
    const priceVal = oraclePrice.data?.value;

    if (!collateralVal || !debtVal || !priceVal) {
      return {
        collateralValue: null,
        debtValue: null,
        ltv: null,
        healthFactor: null,
        liquidationPrice: null,
        isHealthy: true,
        riskLevel: 'safe',
      };
    }

    const collateralAmount = parseFloat(collateralVal);
    const debtAmount = parseFloat(debtVal);
    const price = parseFloat(priceVal);

    // Collateral value in USD
    const collateralValueUSD = collateralAmount * price;

    // Debt value in USD (USDC is 1:1)
    const debtValueUSD = debtAmount;

    // LTV = Debt / Collateral Value
    let ltv = 0;
    if (collateralValueUSD > 0) {
      ltv = (debtValueUSD / collateralValueUSD) * 100;
    }

    // Health Factor = (Collateral Value * Max LLTV) / Debt
    let healthFactor = Infinity;
    if (debtValueUSD > 0 && collateralValueUSD > 0) {
      healthFactor = (collateralValueUSD * effectiveLltv) / debtValueUSD;
    }

    // Liquidation Price = Debt / (Collateral * Max LLTV)
    let liquidationPrice = 0;
    if (collateralAmount > 0 && debtValueUSD > 0) {
      liquidationPrice = debtValueUSD / (collateralAmount * effectiveLltv);
    }

    // Risk level
    let riskLevel: 'safe' | 'warning' | 'danger' = 'safe';
    if (ltv >= effectiveLltv * 100) {
      riskLevel = 'danger';
    } else if (ltv >= effectiveLltv * 100 * 0.9) {
      riskLevel = 'warning';
    }

    const isHealthy = healthFactor >= 1.0;

    return {
      collateralValue: collateralValueUSD,
      debtValue: debtValueUSD,
      ltv,
      healthFactor,
      liquidationPrice,
      isHealthy,
      riskLevel,
    };
  }, [collateral.data?.value, debt.data?.value, oraclePrice.data?.value, effectiveLltv]);

  return {
    ...metrics,
    isLoading,
    isError,
    refetch: () => {
      collateral.refetch();
      debt.refetch();
      oraclePrice.refetch();
    },
  };
}
