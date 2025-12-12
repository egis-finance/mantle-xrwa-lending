/**
 * SWR refresh intervals for different data types.
 * Shorter intervals for time-sensitive data (oracle, positions).
 * Longer intervals for relatively static data (system params, TVL).
 */
export const RefreshIntervals = {
  /** Oracle price - liquidation safety critical */
  ORACLE_PRICE: 10_000,
  /** User positions - balance freshness vs RPC cost */
  USER_POSITION: 15_000,
  /** Protocol TVL - aggregate data changes slowly */
  PROTOCOL_TVL: 30_000,
  /** System params - LTV ratios rarely change */
  SYSTEM_PARAMS: 60_000,
} as const;
