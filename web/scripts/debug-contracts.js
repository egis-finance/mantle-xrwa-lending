#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports */

/**
 * Debug script to test contract connections and data
 * Run with: node scripts/debug-contracts.js
 */

const https = require('https');

// Load environment variables
require('dotenv').config({ path: '.env.local' });

const config = {
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
Object.entries(config).forEach(([key, value]) => {
  const status = value && value !== '0x0' ? '✅' : '❌';
  console.log(`${status} ${key}: ${value || 'NOT SET'}`);
});
console.log('');

// Calculate market ID
function calculateMarketId() {
  const { ethers } = require('ethers');
  
  const loanToken = config.usdcAddress;
  const collateralToken = config.acUsdyAddress;
  const oracle = config.oracleAddress;
  const irm = config.irmAddress;
  const lltv = ethers.BigNumber.from('750000000000000000'); // 0.75

  const encoded = ethers.utils.defaultAbiCoder.encode(
    ['address', 'address', 'address', 'address', 'uint256'],
    [loanToken, collateralToken, oracle, irm, lltv]
  );

  return ethers.utils.keccak256(encoded);
}

// Make RPC call
function makeRpcCall(method, params = []) {
  return new Promise((resolve, reject) => {
    const url = new URL(config.ethereumRpc);
    
    const postData = JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method,
      params,
    });

    const options = {
      hostname: url.hostname,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          const response = JSON.parse(data);
          if (response.error) {
            reject(new Error(response.error.message || JSON.stringify(response.error)));
          } else {
            resolve(response.result);
          }
        } catch (err) {
          reject(err);
        }
      });
    });

    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

// Test functions
async function testRpcConnection() {
  console.log('🌐 Testing RPC Connection...');
  try {
    const blockNumber = await makeRpcCall('eth_blockNumber');
    console.log(`✅ Connected! Current block: ${parseInt(blockNumber, 16)}`);
    return true;
  } catch (error) {
    console.log(`❌ Connection failed: ${error.message}`);
    return false;
  }
}

async function testOraclePrice() {
  console.log('\n💰 Testing Oracle Price...');
  try {
    // Call oracle.price()
    const data = await makeRpcCall('eth_call', [
      {
        to: config.oracleAddress,
        data: '0xa035b1fe', // price() function selector
      },
      'latest',
    ]);
    
    if (data === '0x') {
      console.log('❌ Oracle returned empty data (contract might not be deployed)');
      return null;
    }
    
    const priceBigInt = BigInt(data);
    const price = Number(priceBigInt) / 1e18;
    console.log(`✅ Oracle Price: $${price.toFixed(6)}`);
    return price;
  } catch (error) {
    console.log(`❌ Oracle call failed: ${error.message}`);
    return null;
  }
}

async function testBorrowerCollateral() {
  console.log('\n🏦 Testing Borrower Collateral...');
  
  try {
    // First, calculate or get market ID
    let marketId = process.env.NEXT_PUBLIC_MORPHO_MARKET_ID;
    if (!marketId || marketId === '') {
      console.log('Computing market ID...');
      try {
        marketId = calculateMarketId();
        console.log(`Market ID: ${marketId}`);
      } catch (err) {
        console.log('❌ Could not compute market ID:', err.message);
        return null;
      }
    }

    // Encode function call: position(bytes32 id, address user)
    const { ethers } = require('ethers');
    const abiCoder = ethers.utils.defaultAbiCoder;
    
    // Remove '0x' and pad to 32 bytes
    const marketIdPadded = marketId.slice(2).padStart(64, '0');
    const addressPadded = config.borrowerAddress.slice(2).padStart(64, '0');
    
    const data = '0x9edb6f0f' + marketIdPadded + addressPadded;
    
    const result = await makeRpcCall('eth_call', [
      {
        to: config.morphoAddress,
        data,
      },
      'latest',
    ]);

    if (result === '0x') {
      console.log('❌ Morpho returned empty data (contract might not be deployed)');
      return null;
    }

    // Decode result (tuple: supplyShares, borrowShares, collateral)
    const decoded = abiCoder.decode(
      ['uint256', 'uint128', 'uint128'],
      result
    );

    const collateral = Number(decoded[2]) / 1e18;
    const borrowShares = Number(decoded[1]) / 1e18;
    
    console.log(`✅ Position Found:`);
    console.log(`   Collateral: ${collateral.toFixed(6)} AcUSDY`);
    console.log(`   Borrow Shares: ${borrowShares.toFixed(6)}`);
    
    return { collateral, borrowShares };
  } catch (error) {
    console.log(`❌ Collateral check failed: ${error.message}`);
    return null;
  }
}

async function testMarketData() {
  console.log('\n📊 Testing Market Data...');
  
  try {
    let marketId = process.env.NEXT_PUBLIC_MORPHO_MARKET_ID;
    if (!marketId || marketId === '') {
      marketId = calculateMarketId();
    }

    const { ethers } = require('ethers');
    const abiCoder = ethers.utils.defaultAbiCoder;
    
    // Encode function call: market(bytes32 id)
    const marketIdPadded = marketId.slice(2).padStart(64, '0');
    const data = '0x02a2986b' + marketIdPadded;
    
    const result = await makeRpcCall('eth_call', [
      {
        to: config.morphoAddress,
        data,
      },
      'latest',
    ]);

    if (result === '0x') {
      console.log('❌ Market not found (might not be created yet)');
      return null;
    }

    // Decode result
    const decoded = abiCoder.decode(
      ['uint128', 'uint128', 'uint128', 'uint128', 'uint128', 'uint128'],
      result
    );

    const totalBorrowAssets = Number(decoded[2]) / 1e6; // USDC has 6 decimals
    const totalBorrowShares = Number(decoded[3]) / 1e18;
    
    console.log(`✅ Market Data:`);
    console.log(`   Total Borrow Assets: $${totalBorrowAssets.toFixed(2)}`);
    console.log(`   Total Borrow Shares: ${totalBorrowShares.toFixed(6)}`);
    
    return { totalBorrowAssets, totalBorrowShares };
  } catch (error) {
    console.log(`❌ Market data check failed: ${error.message}`);
    return null;
  }
}

// Main execution
async function main() {
  console.log('\n🔍 EGIS FINANCE - CONTRACT DEBUG TOOL\n');
  
  // Check if we have required config
  if (!config.ethereumRpc) {
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
  
  if (price !== null && position && market) {
    const collateralValue = position.collateral * price;
    let debt = 0;
    
    if (market.totalBorrowShares > 0 && position.borrowShares > 0) {
      debt = (position.borrowShares / market.totalBorrowShares) * market.totalBorrowAssets;
    }
    
    console.log(`\n💎 Collateral: ${position.collateral.toFixed(4)} AcUSDY`);
    console.log(`💰 Collateral Value: $${collateralValue.toFixed(2)}`);
    console.log(`💳 Debt: $${debt.toFixed(2)}`);
    
    if (collateralValue > 0 && debt > 0) {
      const ltv = (debt / collateralValue) * 100;
      const healthFactor = (collateralValue * 0.75) / debt;
      console.log(`📊 LTV: ${ltv.toFixed(2)}%`);
      console.log(`🏥 Health Factor: ${healthFactor.toFixed(2)}`);
      
      if (ltv >= 75) {
        console.log(`⚠️  CRITICAL: Position at liquidation risk!`);
      } else if (ltv >= 67.5) {
        console.log(`⚠️  WARNING: Approaching liquidation threshold`);
      } else {
        console.log(`✅ SAFE: Position is healthy`);
      }
    } else if (collateralValue > 0 && debt === 0) {
      console.log(`\n✅ Position has collateral but no debt`);
    } else if (collateralValue === 0) {
      console.log(`\n⚠️  No collateral in position - all values will show as $0`);
    }
  } else {
    console.log('\n❌ Unable to fetch complete data');
    console.log('\nPossible causes:');
    console.log('- Contracts not deployed on this network');
    console.log('- Borrower address has no position');
    console.log('- Wrong contract addresses in .env.local');
    console.log('- RPC endpoint issues');
  }
  
  console.log('\n');
}

main().catch(console.error);

