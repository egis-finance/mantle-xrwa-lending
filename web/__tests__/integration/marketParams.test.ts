/**
 * Integration test for Morpho market parameters
 * Queries the actual Tenderly VTE to verify chain data
 */

import { createPublicClient, http, formatUnits } from 'viem'
import { MorphoAbi } from '@/lib/contracts/abis/Morpho'

// Load env vars - in Jest, these come from .env.local via dotenv
const ETHEREUM_VTE_RPC = process.env.NEXT_PUBLIC_ETHEREUM_RPC_VTE
const MORPHO_ADDRESS = process.env.NEXT_PUBLIC_ETH_MORPHO as `0x${string}`
const MARKET_ID = process.env.NEXT_PUBLIC_MORPHO_MARKET_ID as `0x${string}`
const RUN_INTEGRATION_TESTS = process.env.RUN_INTEGRATION_TESTS === 'true'

// Skip tests unless explicitly enabled and configured
const shouldRun =
  RUN_INTEGRATION_TESTS &&
  Boolean(ETHEREUM_VTE_RPC && MORPHO_ADDRESS && MARKET_ID && MARKET_ID !== '0x0')

describe('Morpho Market Parameters (Integration)', () => {
  // Increase timeout for RPC calls
  jest.setTimeout(30000)

  const client = shouldRun
    ? createPublicClient({
        transport: http(ETHEREUM_VTE_RPC),
      })
    : null

  beforeAll(() => {
    if (!shouldRun) {
      console.log('Skipping integration tests - set RUN_INTEGRATION_TESTS=true to enable')
      console.log({
        RUN_INTEGRATION_TESTS,
        ETHEREUM_VTE_RPC: ETHEREUM_VTE_RPC ? 'SET' : 'NOT SET',
        MORPHO_ADDRESS: MORPHO_ADDRESS || 'NOT SET',
        MARKET_ID: MARKET_ID || 'NOT SET',
      })
    }
  })

  it('should query LLTV from Morpho contract on chain', async () => {
    if (!shouldRun || !client) {
      console.log('Test skipped - integration disabled')
      return
    }

    // Query market params from Morpho Blue
    const marketParams = await client.readContract({
      address: MORPHO_ADDRESS,
      abi: MorphoAbi,
      functionName: 'idToMarketParams',
      args: [MARKET_ID],
    })

    expect(marketParams).toBeDefined()
    expect(marketParams.lltv).toBeDefined()

    // LLTV should be a bigint > 0
    expect(typeof marketParams.lltv).toBe('bigint')
    expect(marketParams.lltv).toBeGreaterThan(0n)

    // Convert to percentage for logging
    const lltvPercent = Number(formatUnits(marketParams.lltv, 18)) * 100
    console.log(`LLTV from chain: ${lltvPercent.toFixed(2)}%`)

    // Verify LLTV is in reasonable range (1% - 99%)
    expect(lltvPercent).toBeGreaterThan(1)
    expect(lltvPercent).toBeLessThan(99)
  })

  it('should return all market params including oracle and IRM', async () => {
    if (!shouldRun || !client) {
      console.log('Test skipped - integration disabled')
      return
    }

    const marketParams = await client.readContract({
      address: MORPHO_ADDRESS,
      abi: MorphoAbi,
      functionName: 'idToMarketParams',
      args: [MARKET_ID],
    })

    // Verify all expected fields are present
    expect(marketParams.loanToken).toBeDefined()
    expect(marketParams.collateralToken).toBeDefined()
    expect(marketParams.oracle).toBeDefined()
    expect(marketParams.irm).toBeDefined()
    expect(marketParams.lltv).toBeDefined()

    // Addresses should not be zero
    expect(marketParams.loanToken).not.toBe('0x0000000000000000000000000000000000000000')
    expect(marketParams.collateralToken).not.toBe('0x0000000000000000000000000000000000000000')
    expect(marketParams.oracle).not.toBe('0x0000000000000000000000000000000000000000')
    expect(marketParams.irm).not.toBe('0x0000000000000000000000000000000000000000')

    console.log('Market params from chain:', {
      loanToken: marketParams.loanToken,
      collateralToken: marketParams.collateralToken,
      oracle: marketParams.oracle,
      irm: marketParams.irm,
      lltv: `${(Number(formatUnits(marketParams.lltv, 18)) * 100).toFixed(2)}%`,
    })
  })

  it('should query market data (supply, borrow, utilization)', async () => {
    if (!shouldRun || !client) {
      console.log('Test skipped - integration disabled')
      return
    }

    const marketData = await client.readContract({
      address: MORPHO_ADDRESS,
      abi: MorphoAbi,
      functionName: 'market',
      args: [MARKET_ID],
    })

    expect(marketData).toBeDefined()
    expect(marketData.totalSupplyAssets).toBeDefined()
    expect(marketData.totalBorrowAssets).toBeDefined()

    const totalSupply = Number(formatUnits(marketData.totalSupplyAssets, 6))
    const totalBorrow = Number(formatUnits(marketData.totalBorrowAssets, 6))
    const utilization = totalSupply > 0 ? (totalBorrow / totalSupply) * 100 : 0

    console.log('Market data from chain:', {
      totalSupply: `$${totalSupply.toLocaleString()}`,
      totalBorrow: `$${totalBorrow.toLocaleString()}`,
      utilization: `${utilization.toFixed(2)}%`,
    })
  })
})
