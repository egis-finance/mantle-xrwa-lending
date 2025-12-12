import { keccak256, encodeAbiParameters, parseAbiParameters } from 'viem'
import { contracts } from './contracts'

// Default LLTV: 86% (0.86e18) - can be overridden via NEXT_PUBLIC_MARKET_LLTV
const DEFAULT_LLTV = BigInt('860000000000000000')

/**
 * Computes the Morpho Blue market ID from market parameters
 * Market ID = keccak256(abi.encode(MarketParams))
 * All parameters come from environment variables for flexibility
 */
export function computeMarketId(): `0x${string}` {
  const loanToken = contracts.usdc.address
  const collateralToken = contracts.acUSDY.address
  const oracle = contracts.navOracle.address
  const irm = contracts.irm.address

  // LLTV from env or default (86%)
  const lltvEnv = process.env.NEXT_PUBLIC_MARKET_LLTV
  const lltv = lltvEnv ? BigInt(lltvEnv) : DEFAULT_LLTV

  const encoded = encodeAbiParameters(
    parseAbiParameters('address, address, address, address, uint256'),
    [loanToken, collateralToken, oracle, irm, lltv]
  )

  return keccak256(encoded)
}

/**
 * Gets the market ID from environment or computes it dynamically
 * Prefer setting NEXT_PUBLIC_MORPHO_MARKET_ID for production
 */
export function getMarketId(): `0x${string}` {
  const envMarketId = process.env.NEXT_PUBLIC_MORPHO_MARKET_ID
  if (envMarketId && envMarketId !== '0x0' && envMarketId !== '0x0000000000000000000000000000000000000000000000000000000000000000') {
    return envMarketId as `0x${string}`
  }
  return computeMarketId()
}
