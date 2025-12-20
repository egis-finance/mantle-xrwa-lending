/**
 * Error categorization types for DeFi operations.
 * Each category has distinct handling: retry strategy, user messaging, and logging.
 */

// Network errors - RPC/transport failures (retriable)
export type NetworkSubcategory =
  | 'timeout'
  | 'connection_refused'
  | 'rate_limited'
  | 'server_error'
  | 'cors'
  | 'offline';

// Contract errors - Smart contract reverts (not retriable)
export type ContractSubcategory =
  | 'revert_with_reason'
  | 'revert_unknown'
  | 'out_of_gas'
  | 'invalid_call'
  | 'execution_reverted';

// Wallet errors - User/wallet actions (not retriable, guide user)
export type WalletSubcategory =
  | 'user_rejected'
  | 'insufficient_funds'
  | 'wrong_network'
  | 'not_connected'
  | 'unauthorized';

// Config errors - Missing env/setup (not retriable, developer alert)
export type ConfigSubcategory =
  | 'missing_env'
  | 'invalid_address'
  | 'invalid_chain_id';

// Suggested user action for wallet errors
export type WalletAction =
  | 'connect_wallet'
  | 'switch_network'
  | 'add_funds'
  | 'unlock_wallet'
  | 'retry_transaction';

/**
 * Categorized error with full type safety.
 * Uses discriminated union for exhaustive matching in switch statements.
 */
export type CategorizedError =
  | {
      category: 'network';
      subcategory: NetworkSubcategory;
      messageKey: string;
      userMessage: string;
      original: Error;
      retriable: true;
      retryAfter?: number;
    }
  | {
      category: 'contract';
      subcategory: ContractSubcategory;
      messageKey: string;
      userMessage: string;
      original: Error;
      retriable: false;
      revertReason?: string;
    }
  | {
      category: 'wallet';
      subcategory: WalletSubcategory;
      messageKey: string;
      userMessage: string;
      original: Error;
      retriable: false;
      action?: WalletAction;
    }
  | {
      category: 'config';
      subcategory: ConfigSubcategory;
      messageKey: string;
      userMessage: string;
      original: Error;
      retriable: false;
      missingVar?: string;
    }
  | {
      category: 'unknown';
      subcategory: undefined;
      messageKey: string;
      userMessage: string;
      original: Error;
      retriable: true;
    };

/**
 * Retry configuration per error category.
 */
export interface RetryConfig {
  shouldRetry: boolean;
  maxRetries: number;
  baseDelay: number; // ms
  maxDelay: number; // ms
  backoffMultiplier: number;
}

/**
 * Retry configurations indexed by category.
 */
export const RETRY_CONFIGS: Record<CategorizedError['category'], RetryConfig> = {
  network: {
    shouldRetry: true,
    maxRetries: 3,
    baseDelay: 1000,
    maxDelay: 30000,
    backoffMultiplier: 2,
  },
  contract: {
    shouldRetry: false,
    maxRetries: 0,
    baseDelay: 0,
    maxDelay: 0,
    backoffMultiplier: 1,
  },
  wallet: {
    shouldRetry: false,
    maxRetries: 0,
    baseDelay: 0,
    maxDelay: 0,
    backoffMultiplier: 1,
  },
  config: {
    shouldRetry: false,
    maxRetries: 0,
    baseDelay: 0,
    maxDelay: 0,
    backoffMultiplier: 1,
  },
  unknown: {
    shouldRetry: true,
    maxRetries: 2,
    baseDelay: 2000,
    maxDelay: 10000,
    backoffMultiplier: 1.5,
  },
};
