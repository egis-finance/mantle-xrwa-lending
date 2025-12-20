import {
  getErrorMessage,
  getActionMessage,
  mapRevertReason,
  getContractErrorMessage,
} from '../messages';

describe('getErrorMessage', () => {
  it('returns message for known error key', () => {
    expect(getErrorMessage('error.network.timeout')).toBe(
      'Request timed out. The network may be congested.'
    );
  });

  it('returns message for wallet error', () => {
    expect(getErrorMessage('error.wallet.insufficient_funds')).toBe(
      'Insufficient funds for this transaction.'
    );
  });

  it('returns message for contract error', () => {
    expect(getErrorMessage('error.contract.out_of_gas')).toBe(
      'Transaction ran out of gas.'
    );
  });

  it('returns fallback for unknown key', () => {
    expect(getErrorMessage('error.nonexistent.key')).toBe(
      'Something went wrong. Please try again.'
    );
  });
});

describe('getActionMessage', () => {
  it('returns connect wallet action', () => {
    expect(getActionMessage('connect_wallet')).toBe('Connect Wallet');
  });

  it('returns switch network action', () => {
    expect(getActionMessage('switch_network')).toBe('Switch Network');
  });

  it('returns add funds action', () => {
    expect(getActionMessage('add_funds')).toBe('Add Funds');
  });

  it('returns unlock wallet action', () => {
    expect(getActionMessage('unlock_wallet')).toBe('Unlock Wallet');
  });

  it('returns retry transaction action', () => {
    expect(getActionMessage('retry_transaction')).toBe('Try Again');
  });
});

describe('mapRevertReason', () => {
  describe('exact matches', () => {
    it('maps InsufficientBalance', () => {
      expect(mapRevertReason('InsufficientBalance')).toBe(
        'Your balance is too low for this operation.'
      );
    });

    it('maps AmountZero', () => {
      expect(mapRevertReason('AmountZero')).toBe(
        'Amount must be greater than zero.'
      );
    });

    it('maps TransferNotAllowed', () => {
      expect(mapRevertReason('TransferNotAllowed')).toBe(
        'AcUSDY transfers are restricted.'
      );
    });

    it('maps ERC20InsufficientAllowance', () => {
      expect(mapRevertReason('ERC20InsufficientAllowance')).toBe(
        'Approve token spending first.'
      );
    });

    it('maps InsufficientCollateral', () => {
      expect(mapRevertReason('InsufficientCollateral')).toBe(
        'Not enough collateral to borrow.'
      );
    });

    it('maps UnhealthyPosition', () => {
      expect(mapRevertReason('UnhealthyPosition')).toBe(
        'This would make your position unhealthy.'
      );
    });

    it('maps InvalidSignature', () => {
      expect(mapRevertReason('InvalidSignature')).toBe(
        'Attestation signature is invalid.'
      );
    });

    it('maps SignatureExpired', () => {
      expect(mapRevertReason('SignatureExpired')).toBe(
        'Attestation has expired.'
      );
    });
  });

  describe('partial matches', () => {
    it('matches custom error with parameters', () => {
      // Custom errors often include parameters like "InsufficientBalance(100, 50)"
      expect(mapRevertReason('InsufficientBalance(100, 50)')).toBe(
        'Your balance is too low for this operation.'
      );
    });

    it('matches error name in larger string', () => {
      expect(mapRevertReason('Error: ERC20InsufficientAllowance: needed 100')).toBe(
        'Approve token spending first.'
      );
    });
  });

  describe('fallback behavior', () => {
    it('returns original reason when no mapping exists', () => {
      expect(mapRevertReason('SomeUnknownError')).toBe('SomeUnknownError');
    });

    it('returns original reason for empty string', () => {
      expect(mapRevertReason('')).toBe('');
    });
  });
});

describe('getContractErrorMessage', () => {
  it('returns base message for revert_unknown', () => {
    expect(getContractErrorMessage('revert_unknown')).toBe(
      'Transaction would fail. Check your inputs.'
    );
  });

  it('returns base message for out_of_gas', () => {
    expect(getContractErrorMessage('out_of_gas')).toBe(
      'Transaction ran out of gas.'
    );
  });

  it('returns base message for execution_reverted', () => {
    expect(getContractErrorMessage('execution_reverted')).toBe(
      'Transaction would fail.'
    );
  });

  it('appends friendly reason for revert_with_reason', () => {
    const message = getContractErrorMessage('revert_with_reason', 'InsufficientBalance');

    expect(message).toBe(
      'Transaction would fail: Your balance is too low for this operation.'
    );
  });

  it('appends original reason if no mapping found', () => {
    const message = getContractErrorMessage('revert_with_reason', 'SomeCustomError');

    expect(message).toBe('Transaction would fail: SomeCustomError');
  });

  it('returns base message when subcategory is revert_with_reason but no reason provided', () => {
    const message = getContractErrorMessage('revert_with_reason');

    expect(message).toBe('Transaction would fail');
  });
});
