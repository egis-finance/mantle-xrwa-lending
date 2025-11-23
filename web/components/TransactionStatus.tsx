import { useEffect, useState } from 'react'
import { useChainId } from 'wagmi'

const SAFE_SERVICE_URLS: Record<number, string> = {
    1: 'https://safe-transaction-mainnet.safe.global',
    5000: 'https://api.safe.global/tx-service/mantle',
}

const CHAIN_PREFIXES: Record<number, string> = {
    1: 'eth',
    5000: 'mantle',
    15000: 'mantle-vte', // Placeholder, Safe Service likely not available
    10001: 'eth-vte', // Placeholder
}

interface TransactionStatusProps {
    hash: string
    chainId?: number
    onExecuted?: () => void
}

export function TransactionStatus({ hash, chainId: propChainId, onExecuted }: TransactionStatusProps) {
    const currentChainId = useChainId()
    const chainId = propChainId || currentChainId
    const [status, setStatus] = useState<'pending' | 'proposed' | 'executed' | 'failed'>('pending')
    const [confirmations, setConfirmations] = useState<number>(0)
    const [requiredConfirmations, setRequiredConfirmations] = useState<number>(0)
    const [safeAddress, setSafeAddress] = useState<string>('')

    useEffect(() => {
        if (!hash || !chainId || !SAFE_SERVICE_URLS[chainId]) return

        const fetchStatus = async () => {
            try {
                const baseUrl = SAFE_SERVICE_URLS[chainId]
                const res = await fetch(`${baseUrl}/api/v1/multisig-transactions/${hash}/`)
                if (!res.ok) return

                const data = await res.json()
                setConfirmations(data.confirmations?.length || 0)
                setRequiredConfirmations(data.confirmationsRequired || 0)
                setSafeAddress(data.safe)

                if (data.isExecuted) {
                    setStatus('executed')
                    onExecuted?.()
                } else {
                    setStatus('proposed')
                }
            } catch (error) {
                console.error('Error fetching Safe tx status:', error)
            }
        }

        fetchStatus()
        const interval = setInterval(fetchStatus, 5000)
        return () => clearInterval(interval)
    }, [hash, chainId, onExecuted])

    if (!SAFE_SERVICE_URLS[chainId]) return null

    const getSafeLink = () => {
        if (!safeAddress || !CHAIN_PREFIXES[chainId]) return '#'
        return `https://app.safe.global/transactions/tx?safe=${CHAIN_PREFIXES[chainId]}:${safeAddress}&id=multisig_${safeAddress}_${hash}`
    }

    if (status === 'executed') {
        return (
            <div className="flex items-center gap-2 text-green-500">
                <span>Transaction Executed</span>
                <a
                    href={getSafeLink()}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm underline hover:text-green-600"
                >
                    View
                </a>
            </div>
        )
    }

    if (status === 'proposed') {
        return (
            <div className="flex flex-col gap-1 rounded bg-yellow-50 p-3 text-yellow-700">
                <div className="font-medium">Transaction Proposed</div>
                <div className="text-sm">
                    Waiting for confirmations: {confirmations}/{requiredConfirmations}
                </div>
                <a
                    href={getSafeLink()}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-1 text-sm underline hover:text-yellow-800"
                >
                    View in Safe App
                </a>
            </div>
        )
    }

    return <div className="animate-pulse text-gray-500">Loading transaction status...</div>
}
