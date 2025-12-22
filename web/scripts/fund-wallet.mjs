import { join } from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

// Load .env.local from the web directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = join(__filename, '..', '..');
const envPath = join(__dirname, '.env.local');

if (fs.existsSync(envPath)) {
  const envConfig = fs.readFileSync(envPath, 'utf8');
  // Simple env parser for this script
  envConfig.split('\n').forEach(line => {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) {
      process.env[match[1].trim()] = match[2].trim().replace(/^['"]|['"]$/g, '');
    }
  });
}

const targetAddress = process.argv[2];

if (!targetAddress || !targetAddress.startsWith('0x')) {
  console.error('Usage: node scripts/fund-wallet.mjs <ADDRESS>');
  process.exit(1);
}

const MANTLE_RPC = process.env.NEXT_PUBLIC_MANTLE_RPC_VTE;
const ETHEREUM_RPC = process.env.NEXT_PUBLIC_ETHEREUM_RPC_VTE;
const USDY_ADDRESS = process.env.NEXT_PUBLIC_MANTLE_USDY || '0x5bE26527e817998A7206475496fDE1E68957c5A6';
const USDC_ETH_ADDRESS = process.env.NEXT_PUBLIC_ETH_USDC || '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';

if (!MANTLE_RPC || !ETHEREUM_RPC) {
  console.error('Error: RPC URLs not found in .env.local');
  process.exit(1);
}

async function rpc(url, method, params) {
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: Date.now(),
        method,
        params,
      }),
    });
    return response.json();
  } catch (error) {
    console.error(`RPC Error (${method}):`, error.message);
    return null;
  }
}

async function main() {
  console.log(`\n==========================================`);
  console.log(`Funding Address on Tenderly VTEs`);
  console.log(`Target: ${targetAddress}`);
  console.log(`==========================================\n`);

  // 1. Fund Native MNT on Mantle (for gas)
  console.log('  - Setting 1,000 MNT on Mantle VTE...');
  await rpc(MANTLE_RPC, 'tenderly_setBalance', [targetAddress, '0x3635c9adc5dea00000']); // 1000 tokens (18 dec)

  // 2. Fund USDY on Mantle
  console.log('  - Setting 1,000,000 USDY on Mantle VTE...');
  await rpc(MANTLE_RPC, 'tenderly_setErc20Balance', [USDY_ADDRESS, targetAddress, '0xd3c21bcecceda1000000']); // 1M tokens (18 dec)

  // 3. Fund Native ETH on Ethereum (for gas)
  console.log('  - Setting 10 ETH on Ethereum VTE...');
  await rpc(ETHEREUM_RPC, 'tenderly_setBalance', [targetAddress, '0x8ac7230489e80000']); // 10 tokens (18 dec)

  // 4. Fund USDC on Ethereum
  console.log('  - Setting 1,000,000 USDC on Ethereum VTE...');
  await rpc(ETHEREUM_RPC, 'tenderly_setErc20Balance', [USDC_ETH_ADDRESS, targetAddress, '0xe8d4a51000']); // 1M tokens (6 dec)

  console.log('\n✅ Funding complete! Your wallet now has funds on both chains.');
  console.log('\nMantle VTE:');
  console.log(`  - MNT: 1,000`);
  console.log(`  - USDY: 1,000,000`);
  console.log('\nEthereum VTE:');
  console.log(`  - ETH: 10`);
  console.log(`  - USDC: 1,000,000`);
}

main().catch(console.error);
