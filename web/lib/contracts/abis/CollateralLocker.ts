export const CollateralLockerAbi = [
  {
    name: 'lock',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'amount', type: 'uint256' },
      { name: 'validUntil', type: 'uint64' },
      { name: 'vcHash', type: 'bytes32' },
    ],
    outputs: [{ name: 'lockId', type: 'bytes32' }],
  },
  {
    name: 'getUserLockedBalance',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'user', type: 'address' }],
    outputs: [{ type: 'uint256' }],
  },
  {
    name: 'getTotalLocked',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint256' }],
  },
  {
    name: 'unlock',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'recipient', type: 'address' },
      { name: 'amount', type: 'uint256' },
      { name: 'lockId', type: 'bytes32' },
    ],
    outputs: [],
  },
  {
    type: 'event',
    name: 'Locked',
    inputs: [
      { name: 'borrower', type: 'address', indexed: true },
      { name: 'lockId', type: 'bytes32', indexed: true },
      { name: 'amount', type: 'uint256', indexed: false },
      { name: 'sourceChainId', type: 'uint256', indexed: false },
      { name: 'validUntil', type: 'uint64', indexed: false },
      { name: 'vcHash', type: 'bytes32', indexed: false },
    ],
  },
] as const;
