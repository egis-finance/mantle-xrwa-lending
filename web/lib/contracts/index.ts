// Chain IDs for Tenderly VTE networks
export const MANTLE_VTE_CHAIN_ID = 15000
export const ETHEREUM_VTE_CHAIN_ID = 10001

export const contracts = {
  collateralLocker: {
    address: (process.env.NEXT_PUBLIC_MANTLE_LOCKER ?? '0x0') as `0x${string}`,
    chainId: MANTLE_VTE_CHAIN_ID,
  },
  acUSDY: {
    address: (process.env.NEXT_PUBLIC_ETH_ACUSDY ?? '0x0') as `0x${string}`,
    chainId: ETHEREUM_VTE_CHAIN_ID,
  },
} as const
