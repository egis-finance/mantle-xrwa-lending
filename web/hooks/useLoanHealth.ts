'use client'
import { useMemo } from 'react'
import { useBorrowerCollateral } from './useBorrowerCollateral'
import { useBorrowerDebt } from './useBorrowerDebt'
import { useOraclePrice } from './useOraclePrice'

// Max LLTV (Liquidation Loan-to-Value) is 75%
const MAX_LLTV = 0.75

export function useLoanHealth(borrowerAddress?: `0x${string}`) {
  const collateral = useBorrowerCollateral(borrowerAddress)
  const debt = useBorrowerDebt(borrowerAddress)
  const oraclePrice = useOraclePrice()

  const isLoading = collateral.isLoading || debt.isLoading || oraclePrice.isLoading
  const isError = collateral.isError || debt.isError || oraclePrice.isError

  const metrics = useMemo(() => {
    if (!collateral.value || !debt.value || !oraclePrice.value) {
      return {
        collateralValue: null,
        debtValue: null,
        ltv: null,
        healthFactor: null,
        liquidationPrice: null,
        isHealthy: true,
        riskLevel: 'safe' as 'safe' | 'warning' | 'danger',
      }
    }

    const collateralAmount = parseFloat(collateral.value)
    const debtAmount = parseFloat(debt.value)
    const price = parseFloat(oraclePrice.value)

    // Collateral value in USD
    const collateralValueUSD = collateralAmount * price

    // Debt value in USD (USDC is already in USD, 1:1)
    const debtValueUSD = debtAmount

    // Calculate LTV (Loan-to-Value ratio)
    // LTV = Debt / Collateral Value
    let ltv = 0
    if (collateralValueUSD > 0) {
      ltv = (debtValueUSD / collateralValueUSD) * 100
    }

    // Calculate Health Factor
    // Health Factor = (Collateral Value * Max LLTV) / Debt
    // Or inversely: Health Factor = Max LLTV / LTV
    let healthFactor = Infinity
    if (debtValueUSD > 0 && collateralValueUSD > 0) {
      healthFactor = (collateralValueUSD * MAX_LLTV) / debtValueUSD
    }

    // Calculate liquidation price
    // Price at which LTV = Max LLTV
    // Max LLTV = Debt / (Collateral * Liquidation Price)
    // Liquidation Price = Debt / (Collateral * Max LLTV)
    let liquidationPrice = 0
    if (collateralAmount > 0 && debtValueUSD > 0) {
      liquidationPrice = debtValueUSD / (collateralAmount * MAX_LLTV)
    }

    // Determine risk level
    let riskLevel: 'safe' | 'warning' | 'danger' = 'safe'
    if (ltv >= MAX_LLTV * 100) {
      riskLevel = 'danger' // At or above liquidation threshold
    } else if (ltv >= MAX_LLTV * 100 * 0.9) {
      riskLevel = 'warning' // Within 10% of liquidation (above 67.5%)
    }

    const isHealthy = healthFactor > 1.0

    return {
      collateralValue: collateralValueUSD,
      debtValue: debtValueUSD,
      ltv,
      healthFactor,
      liquidationPrice,
      isHealthy,
      riskLevel,
    }
  }, [collateral.value, debt.value, oraclePrice.value])

  return {
    ...metrics,
    isLoading,
    isError,
    refetch: () => {
      collateral.refetch()
      debt.refetch()
      oraclePrice.refetch()
    },
  }
}

