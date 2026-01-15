/**
 * Environment configuration with build-time validation.
 *
 * Mode selector: NEXT_PUBLIC_USE_MAINNET (true = mainnet, false/unset = VTE)
 *
 * VTE mode (Tenderly Virtual TestNet):
 * - Chain IDs: Mantle 15000, Ethereum 10001
 * - Requires: MANTLE_RPC_VTE, ETHEREUM_RPC_VTE, VTE explorer URLs
 * - Used for: Development, preview deployments, CI
 *
 * Mainnet mode (Tenderly Gateway):
 * - Chain IDs: Mantle 5000, Ethereum 1
 * - Requires: MANTLE_RPC, ETHEREUM_RPC (explorers hardcoded)
 * - Used for: Production deployment
 *
 * Validation invoked from next.config.ts, ensuring both `next dev` and
 * `next build` fail fast on missing vars. NODE_ENV==='test' bypasses
 * validation so Jest runs without real RPC configuration.
 *
 * See ARCHITECTURE.md for environment strategy.
 */

let validated = false;

/**
 * Validates contract address format. Uses raw value in error messages for easier
 * debugging (preserves checksum capitalization), validates against lowercased form.
 */
function validateAddress(varName: string, rawValue: string | undefined): string | undefined {
  if (!rawValue) return undefined;
  const normalized = rawValue.toLowerCase();
  const isValidFormat = /^0x[a-f0-9]{40}$/.test(normalized);
  const isAllZeros = /^0x0{40}$/.test(normalized);
  if (!isValidFormat) {
    return `Invalid ${varName}: "${rawValue}" - must be 42-character hex address`;
  }
  if (isAllZeros) {
    return `Invalid ${varName}: "${rawValue}" - cannot be all zeros`;
  }
  return undefined;
}

export function validateEnv(): void {
  // Skip validation in test environment (mocked values used)
  if (process.env.NODE_ENV === 'test') {
    validated = true;
    return;
  }

  const missing: string[] = [];

  // Always required
  if (!process.env.NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID) {
    missing.push('NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID');
  }

  const useMainnet = process.env.NEXT_PUBLIC_USE_MAINNET === 'true';

  if (useMainnet) {
    // Mainnet mode: require mainnet RPC vars (explorers hardcoded)
    if (!process.env.NEXT_PUBLIC_MANTLE_RPC) {
      missing.push('NEXT_PUBLIC_MANTLE_RPC');
    }
    if (!process.env.NEXT_PUBLIC_ETHEREUM_RPC) {
      missing.push('NEXT_PUBLIC_ETHEREUM_RPC');
    }
  } else {
    // VTE mode (default): require VTE RPC + explorer vars
    if (!process.env.NEXT_PUBLIC_MANTLE_RPC_VTE) {
      missing.push('NEXT_PUBLIC_MANTLE_RPC_VTE');
    }
    if (!process.env.NEXT_PUBLIC_ETHEREUM_RPC_VTE) {
      missing.push('NEXT_PUBLIC_ETHEREUM_RPC_VTE');
    }
    if (!process.env.NEXT_PUBLIC_MANTLE_VTE_EXPLORER) {
      missing.push('NEXT_PUBLIC_MANTLE_VTE_EXPLORER');
    }
    if (!process.env.NEXT_PUBLIC_ETHEREUM_VTE_EXPLORER) {
      missing.push('NEXT_PUBLIC_ETHEREUM_VTE_EXPLORER');
    }
  }

  // Contract address validation
  // MANTLE_USDY required in VTE mode to prevent silent mainnet fallback
  const REQUIRED_CONTRACTS: string[] = [
    'NEXT_PUBLIC_MANTLE_LOCKER',
    'NEXT_PUBLIC_ETH_ACUSDY',
    'NEXT_PUBLIC_ETH_MORPHO',
    'NEXT_PUBLIC_ETH_ORACLE',
    'NEXT_PUBLIC_ETH_USDC',
    'NEXT_PUBLIC_ETH_IRM',
    'NEXT_PUBLIC_ETH_ADAPTER',
    ...(!useMainnet ? ['NEXT_PUBLIC_MANTLE_USDY'] : []),
  ];

  // Optional contracts: validate format when set (any mode), but not required
  const OPTIONAL_CONTRACTS: string[] = [
    ...(useMainnet ? ['NEXT_PUBLIC_MANTLE_USDY'] : []),
  ];

  const missingContracts: string[] = [];
  const invalidContracts: string[] = [];

  for (const varName of REQUIRED_CONTRACTS) {
    const rawValue = process.env[varName];
    if (!rawValue) {
      missingContracts.push(varName);
      continue;
    }
    const error = validateAddress(varName, rawValue);
    if (error) invalidContracts.push(error);
  }

  // Validate optional contracts when set (format check only, no missing error)
  for (const varName of OPTIONAL_CONTRACTS) {
    const rawValue = process.env[varName];
    if (rawValue) {
      const error = validateAddress(varName, rawValue);
      if (error) invalidContracts.push(error);
    }
  }

  if (invalidContracts.length > 0) {
    throw new Error(`Invalid contract addresses:\n${invalidContracts.map(e => `  - ${e}`).join('\n')}`);
  }

  // Cross-chain address equality check: AcUSDY (Ethereum) vs MANTLE_LOCKER (Mantle)
  // Same address CAN be valid (same nonce deployment), but often indicates copy-paste error.
  // Set SKIP_ADDRESS_EQUALITY_CHECK=true in shell or web/.env.local to suppress.
  const acUsdyRaw = process.env.NEXT_PUBLIC_ETH_ACUSDY;
  const lockerRaw = process.env.NEXT_PUBLIC_MANTLE_LOCKER;
  if (acUsdyRaw && lockerRaw && acUsdyRaw.toLowerCase() === lockerRaw.toLowerCase()) {
    // Check both server-side and client-side variants of the skip flag
    const skipCheck = process.env.SKIP_ADDRESS_EQUALITY_CHECK === 'true' ||
                      process.env.NEXT_PUBLIC_SKIP_ADDRESS_EQUALITY_CHECK === 'true';
    if (!skipCheck) {
      throw new Error(
        `Invalid configuration: NEXT_PUBLIC_ETH_ACUSDY equals NEXT_PUBLIC_MANTLE_LOCKER (${acUsdyRaw}).\n` +
        `AcUSDY (Ethereum) and CollateralLocker (Mantle) are different contracts.\n` +
        `If this is intentional (same nonce deployment), set SKIP_ADDRESS_EQUALITY_CHECK=true\n` +
        `in your shell or web/.env.local (not propagated from root .env).`
      );
    }
  }

  if (missing.length > 0 || missingContracts.length > 0) {
    const lines: string[] = ['Missing required environment variables:'];
    if (missing.length > 0) {
      lines.push('\n  RPC/Mode Configuration:');
      missing.forEach(v => lines.push(`    - ${v}`));
    }
    if (missingContracts.length > 0) {
      lines.push('\n  Contract Addresses (run deployment scripts):');
      missingContracts.forEach(v => lines.push(`    - ${v}`));
    }
    throw new Error(lines.join('\n'));
  }

  validated = true;
}

export interface EnvConfig {
  dynamicEnvId: string;
  useMainnet: boolean;
  rpc: {
    mantleVte: string;
    ethereumVte: string;
    mantleMainnet: string;
    ethereumMainnet: string;
  };
  explorer: {
    mantleVte: string;
    ethereumVte: string;
    mantleMainnet: string;
    ethereumMainnet: string;
  };
}

export function getEnv(): EnvConfig {
  // Validation runs at build time via next.config.ts import.
  // Skip client-side re-validation since env vars are bundled at build time
  // and the validated flag doesn't persist across server/client boundaries.
  if (typeof window === 'undefined' && !validated && process.env.NODE_ENV !== 'test') {
    validateEnv();
  }

  // Defense-in-depth: fallback only allowed in test environment
  const dynamicEnvId =
    process.env.NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID ||
    (process.env.NODE_ENV === 'test' ? 'test-env-id' : '');

  if (!dynamicEnvId) {
    throw new Error('NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID must be set in non-test environments.');
  }

  return {
    dynamicEnvId,
    useMainnet: process.env.NEXT_PUBLIC_USE_MAINNET === 'true',
    rpc: {
      mantleVte: process.env.NEXT_PUBLIC_MANTLE_RPC_VTE || 'http://localhost:8545',
      ethereumVte: process.env.NEXT_PUBLIC_ETHEREUM_RPC_VTE || 'http://localhost:8546',
      mantleMainnet: process.env.NEXT_PUBLIC_MANTLE_RPC || 'https://rpc.mantle.xyz',
      ethereumMainnet: process.env.NEXT_PUBLIC_ETHEREUM_RPC || 'https://eth.llamarpc.com',
    },
    explorer: {
      // VTE explorers (Tenderly VNet ROOT - /tx/<hash> appended in TransactionStatus)
      mantleVte: process.env.NEXT_PUBLIC_MANTLE_VTE_EXPLORER || '',
      ethereumVte: process.env.NEXT_PUBLIC_ETHEREUM_VTE_EXPLORER || '',
      // Mainnet explorers (hardcoded)
      mantleMainnet: 'https://mantlescan.xyz',
      ethereumMainnet: 'https://etherscan.io',
    },
  };
}
