// Error categorization module
// Provides type-safe error classification for DeFi operations

export { categorizeError, isRetriableError, getRetryDelay } from './categorize';

export type {
  CategorizedError,
  NetworkSubcategory,
  ContractSubcategory,
  WalletSubcategory,
  ConfigSubcategory,
  WalletAction,
  RetryConfig,
} from './types';

export { RETRY_CONFIGS } from './types';

export { getErrorMessage, getActionMessage, mapRevertReason } from './messages';
