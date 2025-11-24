'use client'

import { useEffect } from 'react'
import { useConnect, useAccount } from 'wagmi'
import { useSafeAppsSDK } from '@safe-global/safe-apps-react-sdk'

export function useSafeAutoConnect() {
  const { safe, connected } = useSafeAppsSDK()
  const { connect, connectors } = useConnect()
  const { isConnected } = useAccount()

  useEffect(() => {
    if (connected && safe && !isConnected) {
      const safeConnector = connectors.find(c => c.id === 'safe')
      if (safeConnector) {
        connect({ connector: safeConnector })
      }
    }
  }, [connected, safe, isConnected, connect, connectors])
}
