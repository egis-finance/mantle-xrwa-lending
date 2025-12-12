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
  morpho: {
    address: (process.env.NEXT_PUBLIC_ETH_MORPHO ?? '0x0') as `0x${string}`,
    chainId: ETHEREUM_VTE_CHAIN_ID,
  },
  navOracle: {
    address: (process.env.NEXT_PUBLIC_ETH_ORACLE ?? '0x0') as `0x${string}`,
    chainId: ETHEREUM_VTE_CHAIN_ID,
  },
  usdc: {
    address: (process.env.NEXT_PUBLIC_ETH_USDC ?? '0x0') as `0x${string}`,
    chainId: ETHEREUM_VTE_CHAIN_ID,
  },
  irm: {
    address: (process.env.NEXT_PUBLIC_ETH_IRM ?? '0x0') as `0x${string}`,
    chainId: ETHEREUM_VTE_CHAIN_ID,
  },
  adapter: {
    address: (process.env.NEXT_PUBLIC_ETH_ADAPTER ?? '0x0') as `0x${string}`,
    chainId: ETHEREUM_VTE_CHAIN_ID,
  },
} as const
