import { keccak256, encodeAbiParameters, parseAbiParameters } from 'viem'
import { contracts } from './contracts'

/**
 * Computes the Morpho Blue market ID from market parameters
 * Market ID = keccak256(abi.encode(MarketParams))
 */
export function computeMarketId(): `0x${string}` {
  // Market parameters matching the Solidity struct
  const loanToken = (process.env.NEXT_PUBLIC_ETH_USDC ?? '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48') as `0x${string}`
  const collateralToken = contracts.acUSDY.address
  const oracle = contracts.navOracle.address
  const irm = (process.env.NEXT_PUBLIC_ETH_IRM ?? '0x870aC11D48B15DB9a138Cf899d20F13F79Ba00BC') as `0x${string}`
  const lltv = BigInt('750000000000000000') // 0.75 = 75% (18 decimals)

  // Encode the market params struct
  const encoded = encodeAbiParameters(
    parseAbiParameters('address, address, address, address, uint256'),
    [loanToken, collateralToken, oracle, irm, lltv]
  )

  // Hash to get the market ID
  return keccak256(encoded)
}

/**
 * Gets the market ID from environment or computes it dynamically
 */
export function getMarketId(): `0x${string}` {
  const envMarketId = process.env.NEXT_PUBLIC_MORPHO_MARKET_ID
  if (envMarketId && envMarketId !== '0x0' && envMarketId !== '0x0000000000000000000000000000000000000000000000000000000000000000') {
    return envMarketId as `0x${string}`
  }
  return computeMarketId()
}
