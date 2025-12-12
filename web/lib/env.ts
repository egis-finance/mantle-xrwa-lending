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

  if (missing.length > 0) {
    const mode = useMainnet ? 'mainnet' : 'VTE';
    throw new Error(
      `Missing required env vars for ${mode} mode:\n  - ${missing.join('\n  - ')}\n\n` +
      `Set NEXT_PUBLIC_USE_MAINNET=${useMainnet} and provide the required vars.`
    );
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
  // Auto-validate on first call (prevents shipping with fallback values)
  if (!validated && process.env.NODE_ENV !== 'test') {
    validateEnv();
  }

  return {
    dynamicEnvId: process.env.NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID || 'test-env-id',
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
