export const XRWAReceiverAbi = [
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
] as const;

