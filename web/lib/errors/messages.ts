import type { WalletAction, ContractSubcategory } from './types';

/**
 * Default English messages for all error types.
 * Keys follow pattern: error.<category>.<subcategory>
 */
const ERROR_MESSAGES: Record<string, string> = {
  // Network errors
  'error.network.timeout': 'Request timed out. The network may be congested.',
  'error.network.connection_refused': 'Could not connect to the network. Check your connection.',
  'error.network.rate_limited': 'Too many requests. Please wait a moment.',
  'error.network.server_error': 'Server encountered an error. Please try again.',
  'error.network.cors': 'Request blocked by browser security.',
  'error.network.offline': 'You appear to be offline.',

  // Contract errors
  'error.contract.revert_with_reason': 'Transaction would fail',
  'error.contract.revert_unknown': 'Transaction would fail. Check your inputs.',
  'error.contract.out_of_gas': 'Transaction ran out of gas.',
  'error.contract.invalid_call': 'Invalid contract call.',
  'error.contract.execution_reverted': 'Transaction would fail.',

  // Wallet errors
  'error.wallet.user_rejected': 'Transaction was cancelled.',
  'error.wallet.insufficient_funds': 'Insufficient funds for this transaction.',
  'error.wallet.wrong_network': 'Please switch to the correct network.',
  'error.wallet.not_connected': 'Please connect your wallet.',
  'error.wallet.unauthorized': 'Please unlock your wallet.',

  // Config errors
  'error.config.missing_env': 'Application not properly configured.',
  'error.config.invalid_address': 'Contract address not configured.',
  'error.config.invalid_chain_id': 'Invalid network configuration.',

  // Unknown
  'error.unknown': 'Something went wrong. Please try again.',
};

/**
 * Maps common contract revert reasons to user-friendly messages.
 * Specific to this DeFi application's contracts.
 */
const REVERT_REASON_MAP: Record<string, string> = {
  // CollateralLocker errors
  InsufficientBalance: 'Your balance is too low for this operation.',
  AmountZero: 'Amount must be greater than zero.',
  LockExpired: 'The lock period has expired.',
  NotOwner: 'Only the owner can perform this action.',
  AlreadyLocked: 'Collateral is already locked.',
  InvalidValidUntil: 'Invalid expiry timestamp.',
  // AcUSDY errors
  TransferNotAllowed: 'AcUSDY transfers are restricted.',
  NotWhitelisted: 'Address is not whitelisted.',
  OnlyReceiver: 'Only the receiver can mint.',
  // XRWAReceiver errors
  InvalidSignature: 'Attestation signature is invalid.',
  SignatureExpired: 'Attestation has expired.',
  AlreadyConsumed: 'This lock has already been processed.',
  LockerNotAllowed: 'Source locker is not authorized.',
  // Morpho errors
  InsufficientCollateral: 'Not enough collateral to borrow.',
  UnhealthyPosition: 'This would make your position unhealthy.',
  MarketNotCreated: 'Lending market not created.',
  // ERC20 errors
  ERC20InsufficientBalance: 'Insufficient token balance.',
  ERC20InsufficientAllowance: 'Approve token spending first.',
};

/**
 * Action button labels for wallet errors.
 */
const ACTION_MESSAGES: Record<WalletAction, string> = {
  connect_wallet: 'Connect Wallet',
  switch_network: 'Switch Network',
  add_funds: 'Add Funds',
  unlock_wallet: 'Unlock Wallet',
  retry_transaction: 'Try Again',
};

/**
 * Get user-friendly message for error key.
 */
export function getErrorMessage(key: string): string {
  return ERROR_MESSAGES[key] ?? ERROR_MESSAGES['error.unknown'];
}

/**
 * Get action button label for wallet errors.
 */
export function getActionMessage(action: WalletAction): string {
  return ACTION_MESSAGES[action];
}

/**
 * Map revert reason to user-friendly message.
 * Falls back to original reason if no mapping found.
 */
export function mapRevertReason(reason: string): string {
  // Check exact match
  if (REVERT_REASON_MAP[reason]) {
    return REVERT_REASON_MAP[reason];
  }

  // Check partial match (custom errors often have parameters)
  for (const [key, message] of Object.entries(REVERT_REASON_MAP)) {
    if (reason.includes(key)) {
      return message;
    }
  }

  return reason;
}

/**
 * Generate user-friendly message for contract errors.
 */
export function getContractErrorMessage(
  subcategory: ContractSubcategory,
  revertReason?: string
): string {
  const baseMessage = ERROR_MESSAGES[`error.contract.${subcategory}`];

  if (revertReason && subcategory === 'revert_with_reason') {
    const friendlyReason = mapRevertReason(revertReason);
    return `${baseMessage}: ${friendlyReason}`;
  }

  return baseMessage;
}
