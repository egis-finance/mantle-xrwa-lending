'use client';

/**
 * Admin Release Queue Page
 *
 * Displays borrowers with locked USDY who have zero debt (ready for release).
 * Admin can execute unlock transactions; non-admins see read-only view.
 */

import React from 'react';
import { Navbar } from '@/components/Navbar';
import { Footer } from '@/components/Footer';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ConfirmUnlockModal } from '@/components/ConfirmUnlockModal';
import { Shield, Users, CheckCircle, Loader2, AlertCircle, RefreshCw, Eye } from 'lucide-react';
import { useReleaseQueue, type ReleaseRequest } from '@/hooks/useReleaseQueue';
import { useCollateralLockerAdmin } from '@/hooks/useCollateralLockerAdmin';
import { useUnlockCollateral } from '@/hooks/useUnlockCollateral';
import { useDynamicWallet } from '@/hooks/useDynamicWallet';
import { cn } from '@/lib/utils';

const DEFAULT_PAGE_SIZE = 10;

// Zero hash indicates missing/uninitialized lockId from useReleaseQueue
const ZERO_LOCK_ID = '0x0000000000000000000000000000000000000000000000000000000000000000' as const;

export default function AdminReleaseQueuePage() {
  const { isConnected } = useDynamicWallet();
  const { adminAddress, isAdmin, isLoading: isAdminLoading } = useCollateralLockerAdmin();
  const { requests, isLoading, isError, refetch } = useReleaseQueue();

  // Wrap refetch to match onSuccess callback signature (ignore return value)
  const handleRefetch = React.useCallback(async () => {
    await refetch();
  }, [refetch]);

  const { unlock, status, statusMessage, error, reset } = useUnlockCollateral(isAdmin, handleRefetch);

  const [visibleCount, setVisibleCount] = React.useState(DEFAULT_PAGE_SIZE);
  const [pendingUnlock, setPendingUnlock] = React.useState<ReleaseRequest | null>(null);

  // Deterministic sort: ready before waiting, then by lockId for stable pagination
  const sortedRequests = React.useMemo(() => {
    return [...requests].sort((a, b) => {
      // Primary: ready before waiting
      if (a.status !== b.status) {
        return a.status === 'ready' ? -1 : 1;
      }
      // Secondary: stable sort by lockId
      const aLockId = a.lastLockId ?? '';
      const bLockId = b.lastLockId ?? '';
      return aLockId.localeCompare(bLockId);
    });
  }, [requests]);

  const visibleRequests = sortedRequests.slice(0, visibleCount);
  const hasMore = visibleCount < sortedRequests.length;

  // Summary stats
  const totalInQueue = requests.length;
  const readyCount = requests.filter((r) => r.status === 'ready').length;

  const handleUnlockClick = (request: ReleaseRequest) => {
    reset();
    setPendingUnlock(request);
  };

  const handleConfirmUnlock = async () => {
    if (!pendingUnlock) return;

    try {
      await unlock(
        pendingUnlock.borrower,
        pendingUnlock.lockedAmountRaw,
        pendingUnlock.lastLockId
      );
      setPendingUnlock(null);
    } catch {
      // Error handled by hook, modal stays open to show error
    }
  };

  const handleCloseModal = () => {
    if (status !== 'unlocking' && status !== 'confirming') {
      setPendingUnlock(null);
      reset();
    }
  };

  return (
    <div className="min-h-screen bg-slate-50/50 flex flex-col relative overflow-hidden">
      {/* Decorative background */}
      <div className="absolute top-0 left-0 w-full h-96 bg-gradient-to-b from-amber-50/50 to-transparent pointer-events-none z-0"></div>
      <div className="absolute -top-24 -right-24 w-96 h-96 bg-orange-100/40 rounded-full blur-3xl pointer-events-none z-0"></div>

      <Navbar />

      <main className="flex-1 container max-w-screen-xl py-8 space-y-6 relative z-10">
        {/* Admin Banner */}
        <div className="bg-gradient-to-r from-amber-50 to-orange-50 border-l-4 border-amber-500 p-4 rounded-r-lg">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Shield className="h-6 w-6 text-amber-600" />
              <div>
                <h2 className="font-semibold text-amber-800">Admin Control Panel</h2>
                <p className="text-sm text-amber-600">
                  Release Queue Management - Privileged administrative functions
                </p>
              </div>
            </div>
            {isConnected && !isAdminLoading && (
              <div className="flex items-center gap-2">
                {isAdmin ? (
                  <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">
                    <CheckCircle className="h-3 w-3" />
                    Admin
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                    <Eye className="h-3 w-3" />
                    Read-Only
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="border-t-4 border-t-amber-500">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-amber-100">
                  <Users className="h-5 w-5 text-amber-600" />
                </div>
                <div>
                  <p className="text-xs text-gray-500 uppercase font-medium">Total in Queue</p>
                  <p className="text-2xl font-bold text-gray-900">{totalInQueue}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-t-4 border-t-green-500">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-green-100">
                  <CheckCircle className="h-5 w-5 text-green-600" />
                </div>
                <div>
                  <p className="text-xs text-gray-500 uppercase font-medium">Ready for Release</p>
                  <p className="text-2xl font-bold text-gray-900">{readyCount}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-t-4 border-t-blue-500">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-blue-100">
                  <Shield className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-xs text-gray-500 uppercase font-medium">Admin Address</p>
                  <p className="text-sm font-mono text-gray-700 truncate">
                    {adminAddress ? `${adminAddress.slice(0, 6)}...${adminAddress.slice(-4)}` : '--'}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Release Queue Table */}
        <Card className="overflow-hidden border-t-4 border-t-amber-400 shadow-md">
          <CardHeader className="flex flex-row items-center justify-between border-b border-gray-100 bg-white/50">
            <CardTitle className="text-lg flex items-center gap-2 text-amber-900">
              <Users className="h-5 w-5" />
              Release Queue
            </CardTitle>
            <div className="flex items-center gap-2">
              {isLoading && <Loader2 className="h-4 w-4 animate-spin text-amber-600" />}
              <Button
                variant="outline"
                size="sm"
                onClick={() => refetch()}
                className="hover:bg-amber-50 border-amber-200"
              >
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {/* Loading State */}
            {isLoading && requests.length === 0 && (
              <div className="text-center py-8">
                <Loader2 className="h-8 w-8 animate-spin mx-auto text-amber-600" />
                <p className="mt-2 text-sm text-gray-500">Loading release queue...</p>
              </div>
            )}

            {/* Error State */}
            {isError && (
              <div className="text-center py-8">
                <AlertCircle className="h-8 w-8 text-red-500 mx-auto" />
                <p className="mt-2 text-sm text-red-600">Failed to load release queue</p>
                <Button variant="ghost" size="sm" onClick={() => refetch()} className="mt-2">
                  Retry
                </Button>
              </div>
            )}

            {/* Empty State */}
            {!isLoading && !isError && requests.length === 0 && (
              <p className="text-center py-8 text-gray-500">No borrowers in queue</p>
            )}

            {/* Table */}
            {requests.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-gray-500 font-medium uppercase text-xs border-b">
                    <tr>
                      <th className="p-4 text-left">Borrower</th>
                      <th className="p-4 text-left">Locked Amount</th>
                      <th className="p-4 text-left">Status</th>
                      {isAdmin && <th className="p-4 text-right">Action</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {visibleRequests.map((request) => (
                      <tr key={request.borrower} className="bg-white hover:bg-amber-50/30 transition-colors">
                        <td className="p-4 font-mono text-gray-900">
                          {request.borrower.slice(0, 6)}...{request.borrower.slice(-4)}
                        </td>
                        <td className="p-4 font-bold text-gray-900">
                          {request.lockedAmount} USDY
                        </td>
                        <td className="p-4">
                          <span
                            className={cn(
                              'inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium',
                              request.status === 'ready'
                                ? 'bg-green-100 text-green-700'
                                : 'bg-yellow-100 text-yellow-700'
                            )}
                          >
                            {request.status === 'ready' ? (
                              <>
                                <CheckCircle className="h-3 w-3" />
                                Ready
                              </>
                            ) : (
                              <>
                                <AlertCircle className="h-3 w-3" />
                                Waiting
                              </>
                            )}
                          </span>
                        </td>
                        {isAdmin && (
                          <td className="p-4 text-right">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleUnlockClick(request)}
                              disabled={
                                request.status !== 'ready' ||
                                !request.lastLockId ||
                                request.lastLockId === ZERO_LOCK_ID ||
                                status === 'unlocking' ||
                                status === 'confirming'
                              }
                              className={cn(
                                'transition-all',
                                request.status === 'ready'
                                  ? 'text-amber-700 border-amber-300 hover:bg-amber-50'
                                  : 'opacity-50'
                              )}
                            >
                              Unlock
                            </Button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>

                {/* Show More Button */}
                {hasMore && (
                  <div className="p-4 border-t border-gray-100 text-center">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setVisibleCount((c) => c + DEFAULT_PAGE_SIZE)}
                      className="text-amber-700 hover:text-amber-800"
                    >
                      Show More ({sortedRequests.length - visibleCount} remaining)
                    </Button>
                  </div>
                )}
              </div>
            )}

            {/* Inline Status/Error Display */}
            {(status !== 'idle' || error) && (
              <div
                className={cn(
                  'p-3 m-4 rounded-lg flex items-center gap-2 text-xs',
                  status === 'success'
                    ? 'bg-green-50 border border-green-100 text-green-700'
                    : status === 'error'
                    ? 'bg-red-50 border border-red-100 text-red-700'
                    : 'bg-amber-50 border border-amber-100 text-amber-700'
                )}
              >
                {status === 'unlocking' || status === 'confirming' ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : status === 'success' ? (
                  <CheckCircle className="h-3 w-3" />
                ) : (
                  <AlertCircle className="h-3 w-3" />
                )}
                <span>{error?.message ?? statusMessage}</span>
                {(status === 'success' || status === 'error') && (
                  <button onClick={reset} className="ml-auto underline">
                    Dismiss
                  </button>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </main>

      <Footer />

      {/* Confirmation Modal */}
      {pendingUnlock && (
        <ConfirmUnlockModal
          borrower={pendingUnlock.borrower}
          lockedAmount={pendingUnlock.lockedAmount}
          lockId={pendingUnlock.lastLockId}
          isLoading={status === 'unlocking' || status === 'confirming'}
          error={error}
          onConfirm={handleConfirmUnlock}
          onClose={handleCloseModal}
        />
      )}
    </div>
  );
}
