#!/usr/bin/env node

/**
 * Debug script to test contract connections and data
 * Run with: node scripts/debug-contracts-viem.mjs
 */

import { createPublicClient, http, keccak256, encodeAbiParameters, parseAbiParameters, formatUnits } from 'viem';
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
config({ path: join(__dirname, '..', '.env.local') });

/**
 * Convert a decimal string to its 18-decimal fixed-point representation.
 * Uses string manipulation to avoid floating-point precision loss.
 * Example: '0.86' -> '860000000000000000'
 */
function decimalToWei(decimalStr) {
  const normalized = (decimalStr || '0').trim();
  const [intPartRaw, fracPartRaw = ''] = normalized.split('.');
  const intPart = intPartRaw === '' ? '0' : intPartRaw;
  const fracPadded = (fracPartRaw + '0'.repeat(18)).slice(0, 18);
  const scale = 10n ** 18n;
  const intBig = BigInt(intPart);
  const fracBig = fracPadded === '' ? 0n : BigInt(fracPadded);
  return (intBig * scale + fracBig).toString();
}

// LLTV can be overridden via env var (default: 86% matching deployed market)
const LLTV_STR = process.env.DEBUG_LLTV || '0.86';
const LLTV = parseFloat(LLTV_STR);
// Derive LLTV_RAW using string math to avoid floating-point precision loss
const LLTV_RAW = process.env.DEBUG_LLTV_RAW || decimalToWei(LLTV_STR);

const envConfig = {
  ethereumRpc: process.env.NEXT_PUBLIC_ETHEREUM_RPC_VTE,
  morphoAddress: process.env.NEXT_PUBLIC_ETH_MORPHO,
  oracleAddress: process.env.NEXT_PUBLIC_ETH_ORACLE,
  acUsdyAddress: process.env.NEXT_PUBLIC_ETH_ACUSDY,
  borrowerAddress: process.env.NEXT_PUBLIC_BORROWER_ADDRESS,
  usdcAddress: process.env.NEXT_PUBLIC_ETH_USDC,
  irmAddress: process.env.NEXT_PUBLIC_ETH_IRM,
};

console.log('📋 Configuration Check:');
console.log('─────────────────────────────────────');
Object.entries(envConfig).forEach(([key, value]) => {
  const status = value && value !== '0x0' ? '✅' : '❌';
  console.log(`${status} ${key}: ${value || 'NOT SET'}`);
});
console.log('');

// Create viem client
const client = createPublicClient({
  transport: http(envConfig.ethereumRpc),
});

// Calculate market ID
function calculateMarketId() {
  const loanToken = envConfig.usdcAddress;
  const collateralToken = envConfig.acUsdyAddress;
  const oracle = envConfig.oracleAddress;
  const irm = envConfig.irmAddress;
  const lltv = BigInt(LLTV_RAW);

  const encoded = encodeAbiParameters(
    parseAbiParameters('address, address, address, address, uint256'),
    [loanToken, collateralToken, oracle, irm, lltv]
  );

  return keccak256(encoded);
}

// Test functions
async function testRpcConnection() {
  console.log('🌐 Testing RPC Connection...');
  try {
    const blockNumber = await client.getBlockNumber();
    console.log(`✅ Connected! Current block: ${blockNumber}`);
    return true;
  } catch (error) {
    console.log(`❌ Connection failed: ${error.message}`);
    return false;
  }
}

async function testOraclePrice() {
  console.log('\n💰 Testing Oracle Price...');
  try {
    const data = await client.readContract({
      address: envConfig.oracleAddress,
      abi: [
        {
          name: 'price',
          type: 'function',
          stateMutability: 'view',
          inputs: [],
          outputs: [{ type: 'uint256' }],
        },
      ],
      functionName: 'price',
    });

    const price = formatUnits(data, 18);
    console.log(`✅ Oracle Price: $${parseFloat(price).toFixed(6)}`);
    return parseFloat(price);
  } catch (error) {
    console.log(`❌ Oracle call failed: ${error.message}`);
    console.log(`   This usually means the oracle contract is not deployed or has a different interface`);
    return null;
  }
}

async function testBorrowerCollateral() {
  console.log('\n🏦 Testing Borrower Collateral...');

  try {
    const marketId = calculateMarketId();
    console.log(`Market ID: ${marketId}`);

    const data = await client.readContract({
      address: envConfig.morphoAddress,
      abi: [
        {
          name: 'position',
          type: 'function',
          stateMutability: 'view',
          inputs: [
            { name: 'id', type: 'bytes32' },
            { name: 'user', type: 'address' },
          ],
          outputs: [
            {
              type: 'tuple',
              components: [
                { name: 'supplyShares', type: 'uint256' },
                { name: 'borrowShares', type: 'uint128' },
                { name: 'collateral', type: 'uint128' },
              ],
            },
          ],
        },
      ],
      functionName: 'position',
      args: [marketId, envConfig.borrowerAddress],
    });

    const collateral = parseFloat(formatUnits(data.collateral, 18));
    const borrowShares = parseFloat(formatUnits(data.borrowShares, 18));
    const supplyShares = parseFloat(formatUnits(data.supplyShares, 18));

    console.log(`✅ Position Found:`);
    console.log(`   Supply Shares: ${supplyShares.toFixed(6)}`);
    console.log(`   Borrow Shares: ${borrowShares.toFixed(6)}`);
    console.log(`   Collateral: ${collateral.toFixed(6)} AcUSDY`);

    return { collateral, borrowShares, supplyShares };
  } catch (error) {
    console.log(`❌ Collateral check failed: ${error.message}`);
    console.log(`   Raw error:`, error.shortMessage || error.details);
    return null;
  }
}

async function testMarketData() {
  console.log('\n📊 Testing Market Data...');

  try {
    const marketId = calculateMarketId();

    const data = await client.readContract({
      address: envConfig.morphoAddress,
      abi: [
        {
          name: 'market',
          type: 'function',
          stateMutability: 'view',
          inputs: [{ name: 'id', type: 'bytes32' }],
          outputs: [
            {
              type: 'tuple',
              components: [
                { name: 'totalSupplyAssets', type: 'uint128' },
                { name: 'totalSupplyShares', type: 'uint128' },
                { name: 'totalBorrowAssets', type: 'uint128' },
                { name: 'totalBorrowShares', type: 'uint128' },
                { name: 'lastUpdate', type: 'uint128' },
                { name: 'fee', type: 'uint128' },
              ],
            },
          ],
        },
      ],
      functionName: 'market',
      args: [marketId],
    });

    const totalBorrowAssets = parseFloat(formatUnits(data.totalBorrowAssets, 6)); // USDC has 6 decimals
    const totalBorrowShares = parseFloat(formatUnits(data.totalBorrowShares, 18));
    const totalSupplyAssets = parseFloat(formatUnits(data.totalSupplyAssets, 6));

    console.log(`✅ Market Data:`);
    console.log(`   Total Supply: $${totalSupplyAssets.toFixed(2)}`);
    console.log(`   Total Borrow Assets: $${totalBorrowAssets.toFixed(2)}`);
    console.log(`   Total Borrow Shares: ${totalBorrowShares.toFixed(6)}`);

    return { totalBorrowAssets, totalBorrowShares, totalSupplyAssets };
  } catch (error) {
    console.log(`❌ Market data check failed: ${error.message}`);
    console.log(`   This usually means the market hasn't been created yet`);
    return null;
  }
}

// Main execution
async function main() {
  console.log('\n🔍 EGIS FINANCE - CONTRACT DEBUG TOOL\n');

  // Check if we have required config
  if (!envConfig.ethereumRpc) {
    console.log('❌ NEXT_PUBLIC_ETHEREUM_RPC_VTE not set in .env.local');
    process.exit(1);
  }

  const connected = await testRpcConnection();
  if (!connected) {
    console.log('\n❌ Cannot proceed without RPC connection');
    process.exit(1);
  }

  const price = await testOraclePrice();
  const position = await testBorrowerCollateral();
  const market = await testMarketData();

  console.log('\n═══════════════════════════════════════');
  console.log('📊 SUMMARY');
  console.log('═══════════════════════════════════════');

  if (position && market) {
    const collateralValue = price ? position.collateral * price : 0;
    let debt = 0;

    if (market.totalBorrowShares > 0 && position.borrowShares > 0) {
      debt = (position.borrowShares / market.totalBorrowShares) * market.totalBorrowAssets;
    }

    console.log(`\n💎 Collateral: ${position.collateral.toFixed(4)} AcUSDY`);
    if (price) {
      console.log(`💰 Collateral Value: $${collateralValue.toFixed(2)}`);
    } else {
      console.log(`💰 Collateral Value: Cannot calculate (oracle failed)`);
    }
    console.log(`💳 Debt: $${debt.toFixed(2)}`);

    if (collateralValue > 0 && debt > 0) {
      const ltv = (debt / collateralValue) * 100;
      const healthFactor = (collateralValue * LLTV) / debt;
      const warningThreshold = LLTV * 100 * 0.9; // 90% of LLTV
      const dangerThreshold = LLTV * 100;
      console.log(`📊 LTV: ${ltv.toFixed(2)}%`);
      console.log(`🏥 Health Factor: ${healthFactor.toFixed(2)} (LLTV: ${(LLTV * 100).toFixed(0)}%)`);

      if (ltv >= dangerThreshold) {
        console.log(`\n⚠️  CRITICAL: Position at liquidation risk!`);
      } else if (ltv >= warningThreshold) {
        console.log(`\n⚠️  WARNING: Approaching liquidation threshold`);
      } else {
        console.log(`\n✅ SAFE: Position is healthy`);
      }
    } else if (position.collateral > 0 && debt === 0) {
      console.log(`\n✅ Position has collateral but no debt (LTV: 0%)`);
      console.log(`   This is why the UI shows $0 for debt`);
    } else if (position.collateral === 0) {
      console.log(`\n⚠️  No collateral in position - UI will show all $0 values`);
      console.log(`   This is EXPECTED if the borrower hasn't deposited yet`);
    }

    // Show what the UI should display
    console.log('\n═══════════════════════════════════════');
    console.log('📱 EXPECTED UI VALUES');
    console.log('═══════════════════════════════════════');
    console.log(`Collateral Value: $${collateralValue.toFixed(0).toLocaleString()}`);
    console.log(`Total Debt: $${debt.toFixed(0).toLocaleString()}`);
    if (debt > 0 && collateralValue > 0) {
      const ltv = (debt / collateralValue) * 100;
      console.log(`Current LTV: ${ltv.toFixed(1)}%`);
    } else {
      console.log(`Current LTV: 0.0%`);
    }

  } else {
    console.log('\n❌ Unable to fetch complete data\n');
    console.log('Possible causes:');
    if (!position) {
      console.log('- ❌ Morpho contract call failed - check if deployed on VTE');
      console.log('- ❌ Borrower address format incorrect');
    }
    if (!market) {
      console.log('- ❌ Market not created yet on Morpho');
      console.log('- ❌ Market parameters mismatch');
    }
    if (!price) {
      console.log('- ⚠️  Oracle not working (but position data might still work)');
    }
  }

  console.log('\n');
}

main().catch((error) => {
  console.error('\n❌ Fatal error:', error);
  process.exit(1);
});

