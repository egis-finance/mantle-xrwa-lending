/**
 * Supply APY calculation for Morpho Blue market.
 *
 * Morpho Blue APY = borrowRate × utilization × (1 - fee)
 *
 * Uses an approximation of AdaptiveCurveIRM's kinked rate curve:
 * - Below target (90%): linear increase from ~1% to ~4%
 * - Above target: steep increase toward 100%+
 *
 * Future enhancement: Read actual rate from IRM.borrowRateView()
 */

export interface SupplyAPYResult {
  /** Annual percentage yield (0.05 = 5%) */
  apy: number | null;
  /** Formatted APY string ("5.42%") */
  apyFormatted: string | null;
  /** Annualized borrow rate (0.06 = 6%) */
  borrowRate: number | null;
  /** Whether data is loading */
  isLoading: boolean;
}

export interface SupplyAPYParams {
  utilizationRate: number | null;
  fee: number | null;
  isLoading: boolean;
}

// AdaptiveCurveIRM typical parameters (approximate)
const TARGET_UTILIZATION = 0.9; // 90%
const BASE_RATE = 0.01; // 1% at 0% utilization
const TARGET_RATE = 0.04; // 4% at target utilization
const MAX_RATE = 1.0; // 100% at 100% utilization

/**
 * Approximates borrow rate from AdaptiveCurveIRM curve.
 * @param utilization - Utilization rate as decimal (0.45 = 45%)
 */
export function approximateBorrowRate(utilization: number): number {
  if (utilization < 0) return BASE_RATE;
  if (utilization >= 1) return MAX_RATE;

  if (utilization <= TARGET_UTILIZATION) {
    // Linear from BASE_RATE to TARGET_RATE
    return BASE_RATE + (utilization / TARGET_UTILIZATION) * (TARGET_RATE - BASE_RATE);
  } else {
    // Steep curve from TARGET_RATE toward MAX_RATE
    const excess = (utilization - TARGET_UTILIZATION) / (1 - TARGET_UTILIZATION);
    return TARGET_RATE + excess * (MAX_RATE - TARGET_RATE);
  }
}

/**
 * Calculates supply APY from market state.
 *
 * @param utilizationRate - Utilization as percentage (45 = 45%)
 * @param fee - Protocol fee as decimal (0.1 = 10%)
 */
export function calculateSupplyAPY(utilizationRate: number, fee: number): number {
  const utilization = utilizationRate / 100; // Convert percentage to decimal
  const borrowRate = approximateBorrowRate(utilization);
  // Supply APY = borrowRate × utilization × (1 - fee)
  return borrowRate * utilization * (1 - fee);
}

export function formatApy(apy: number | null): string | null {
  if (apy === null) return null;
  const percent = apy * 100;
  if (percent <= 0) return '0.00%';
  if (percent < 0.01) return '<0.01%';
  return `${percent.toFixed(2)}%`;
}

/**
 * Hook returning live supply APY from market state.
 */
export function useSupplyAPY({ utilizationRate, fee, isLoading }: SupplyAPYParams): SupplyAPYResult {
  // Return null state when loading or data unavailable
  if (isLoading || utilizationRate === null || fee == null) {
    return {
      apy: null,
      apyFormatted: null,
      borrowRate: null,
      isLoading,
    };
  }

  const utilization = utilizationRate / 100;
  const borrowRate = approximateBorrowRate(utilization);
  const apy = calculateSupplyAPY(utilizationRate, fee);

  return {
    apy,
    apyFormatted: formatApy(apy),
    borrowRate,
    isLoading: false,
  };
}
