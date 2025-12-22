import { createPublicClient, createWalletClient, http, parseAbiItem, defineChain } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { join } from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

// --- Environment Setup ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = join(__filename, '..', '..');
const envPath = join(__dirname, '.env.local');

if (fs.existsSync(envPath)) {
  const envConfig = fs.readFileSync(envPath, 'utf8');
  envConfig.split('\n').forEach(line => {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) {
      process.env[match[1].trim()] = match[2].trim().replace(/^['"]|['"]$/g, '');
    }
  });
}

const MANTLE_RPC = process.env.NEXT_PUBLIC_MANTLE_RPC_VTE;
const ETHEREUM_RPC = process.env.NEXT_PUBLIC_ETHEREUM_RPC_VTE;
const DVN_KEY = process.env.DVN1_PRIVATE_KEY || process.env.NEXT_PUBLIC_DVN1_PRIVATE_KEY;
const MANTLE_LOCKER = process.env.NEXT_PUBLIC_MANTLE_LOCKER;
const ETH_RECEIVER = process.env.ETH_RECEIVER || process.env.NEXT_PUBLIC_ETH_RECEIVER;

if (!MANTLE_RPC || !ETHEREUM_RPC || !DVN_KEY || !MANTLE_LOCKER || !ETH_RECEIVER) {
  console.error('❌ Error: Missing configuration in .env.local');
  console.error('Required: MANTLE_RPC_VTE, ETHEREUM_RPC_VTE, DVN1_PRIVATE_KEY, MANTLE_LOCKER, ETH_RECEIVER');
  process.exit(1);
}

// --- Chain Definitions ---
const mantleVte = defineChain({
  id: 15000,
  name: 'Mantle VTE',
  nativeCurrency: { name: 'Mantle', symbol: 'MNT', decimals: 18 },
  rpcUrls: { default: { http: [MANTLE_RPC] } },
});

const ethVte = defineChain({
  id: 10001,
  name: 'Ethereum VTE',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: [ETHEREUM_RPC] } },
});

// --- Clients & Signer ---
const mantleClient = createPublicClient({ chain: mantleVte, transport: http() });
const dvnAccount = privateKeyToAccount(DVN_KEY.startsWith('0x') ? DVN_KEY : `0x${DVN_KEY}`);
const ethWalletClient = createWalletClient({
  account: dvnAccount,
  chain: ethVte,
  transport: http(),
});

console.log(`🚀 Node.js Relayer Started`);
console.log(`Signer: ${dvnAccount.address}`);
console.log(`Monitoring Mantle Locker: ${MANTLE_LOCKER}`);
console.log(`Submitting to Eth Receiver: ${ETH_RECEIVER}`);

// --- ABIs ---
const LOCKED_EVENT = parseAbiItem('event Locked(address indexed borrower, bytes32 indexed lockId, uint256 amount, uint256 sourceChainId, uint64 validUntil, bytes32 vcHash)');
const XRWA_RECEIVER_ABI = [
  {
    name: 'mintWithAttestation',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      {
        name: 'message',
        type: 'tuple',
        components: [
          { name: 'borrower', type: 'address' },
          { name: 'lockId', type: 'bytes32' },
          { name: 'amount', type: 'uint256' },
          { name: 'sourceChainId', type: 'uint256' },
          { name: 'sourceLocker', type: 'address' },
          { name: 'validUntil', type: 'uint64' },
          { name: 'vcHash', type: 'bytes32' },
        ],
      },
      { name: 'signature', type: 'bytes' },
    ],
    outputs: [],
  },
  {
    type: 'error',
    name: 'SignatureExpired',
    inputs: [
      { name: 'validUntil', type: 'uint64' },
      { name: 'currentTime', type: 'uint64' },
    ],
  },
  {
    type: 'error',
    name: 'DuplicateLockId',
    inputs: [{ name: 'lockId', type: 'bytes32' }],
  },
  {
    type: 'error',
    name: 'InvalidDVN',
    inputs: [{ name: 'dvn', type: 'address' }],
  },
];

// --- Main Loop ---
async function main() {
  console.log('Listening for Locked events...');

  mantleClient.watchEvent({
    address: MANTLE_LOCKER,
    event: LOCKED_EVENT,
    onLogs: async (logs) => {
      for (const log of logs) {
        const { borrower, lockId, amount, sourceChainId, validUntil, vcHash } = log.args;
        console.log(`\n📦 New Lock Detected!`);
        console.log(`   Borrower: ${borrower}`);
        console.log(`   Amount: ${amount}`);
        console.log(`   Lock ID: ${lockId}`);

        try {
          // 1. Prepare EIP-712 Message
          const message = {
            borrower,
            lockId,
            amount,
            sourceChainId,
            sourceLocker: MANTLE_LOCKER,
            validUntil,
            vcHash,
          };

          // 2. Sign Attestation
          console.log('   Signing attestation...');
          const signature = await ethWalletClient.signTypedData({
            domain: {
              name: 'XRWAReceiver',
              version: '1',
              chainId: 10001,
              verifyingContract: ETH_RECEIVER,
            },
            types: {
              LockMessage: [
                { name: 'borrower', type: 'address' },
                { name: 'lockId', type: 'bytes32' },
                { name: 'amount', type: 'uint256' },
                { name: 'sourceChainId', type: 'uint256' },
                { name: 'sourceLocker', type: 'address' },
                { name: 'validUntil', type: 'uint64' },
                { name: 'vcHash', type: 'bytes32' },
              ],
            },
            primaryType: 'LockMessage',
            message,
          });

          // 3. Submit to Ethereum
          console.log('   Submitting to Ethereum...');
          const hash = await ethWalletClient.writeContract({
            address: ETH_RECEIVER,
            abi: XRWA_RECEIVER_ABI,
            functionName: 'mintWithAttestation',
            args: [message, signature],
          });

          console.log(`   ✅ Success! Tx: ${hash}`);
        } catch (err) {
          console.error(`   ❌ Failed to process lock:`, err.message);
        }
      }
    },
  });
}

main().catch(console.error);

