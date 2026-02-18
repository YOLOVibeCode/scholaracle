'use client';

import { useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { DataTable } from '@/components/ui/data-table';
import { useAsyncData } from '@/lib/hooks';
import { ErrorDisplay, LoadingSkeleton } from '@/components/common';
import { adminSubscriptionsApi, type ISubscription } from '@/lib/api/admin/subscriptions';
import { SubscriptionCancelPanel, SubscriptionExtendTrialPanel, SubscriptionPlanChangePanel } from '@/components/admin';

export default function AdminSubscriptionsPage() {
  const [toast, setToast] = useState<string | null>(null);
  const [cancelUserId, setCancelUserId] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [extendUserId, setExtendUserId] = useState<string | null>(null);
  const [extendDays, setExtendDays] = useState('7');
  const [extendReason, setExtendReason] = useState('');
  const [planUserId, setPlanUserId] = useState<string | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<ISubscription['plan']>('starter');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { data: subsData, isLoading, error, retry, refresh } = useAsyncData<readonly ISubscription[]>(
    async () => {
      const res = await adminSubscriptionsApi.list();
      if (!res.success || !res.data) throw new Error(res.error ?? 'Failed to load subscriptions');
      return res.data;
    },
    { retryCount: 2, retryDelay: 1000 }
  );

  const subs = subsData ?? [];
  const hasLoadedOnce = subsData !== null;
  const showFullLoading = isLoading && !hasLoadedOnce;

  const openCancel = (s: ISubscription) => {
    setToast(null);
    setCancelUserId(s.userId);
    setCancelReason('');
  };

  const openExtend = (s: ISubscription) => {
    setToast(null);
    setExtendUserId(s.userId);
    setExtendDays('7');
    setExtendReason('');
  };

  const openPlan = (s: ISubscription) => {
    setToast(null);
    setPlanUserId(s.userId);
    setSelectedPlan(s.plan);
  };

  const closePanels = () => {
    setCancelUserId(null);
    setExtendUserId(null);
    setPlanUserId(null);
  };

  const statusBadgeVariant = useMemo(() => {
    return (status: ISubscription['status']) => {
      if (status === 'active') return 'default';
      if (status === 'past_due') return 'destructive';
      return 'secondary';
    };
  }, []);

  const subscriptionColumns: ColumnDef<ISubscription, unknown>[] = useMemo(
    () => [
      { accessorKey: 'userId', header: 'User', cell: ({ row }) => <span className="text-xs text-gray-600 dark:text-gray-400">{row.original.userId}</span> },
      {
        accessorKey: 'plan',
        header: 'Plan',
        cell: ({ row }) => (
          <Badge variant="outline" data-testid="subscription-plan-badge">
            {row.original.plan}
          </Badge>
        ),
      },
      {
        accessorKey: 'status',
        header: 'Status',
        cell: ({ row }) => (
          <Badge variant={statusBadgeVariant(row.original.status)} data-testid="subscription-status-badge">
            {row.original.status}
          </Badge>
        ),
      },
      {
        accessorKey: 'currentPeriodEnd',
        header: 'Period End',
        cell: ({ row }) => (
          <span className="text-xs text-gray-600 dark:text-gray-400">
            {new Date(row.original.currentPeriodEnd).toLocaleDateString()}
          </span>
        ),
      },
      {
        id: 'actions',
        header: 'Actions',
        cell: ({ row }) => {
          const s = row.original;
          return (
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => openPlan(s)} data-testid="button-change-plan">
                Change Plan
              </Button>
              {s.status === 'trialing' && (
                <Button variant="outline" size="sm" onClick={() => openExtend(s)} data-testid="button-extend-trial">
                  Extend Trial
                </Button>
              )}
              {(s.status === 'active' || s.status === 'trialing') && (
                <Button variant="destructive" size="sm" onClick={() => openCancel(s)} data-testid="button-cancel-subscription">
                  Cancel
                </Button>
              )}
              {s.status === 'cancelled' && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    setIsSubmitting(true);
                    setToast(null);
                    try {
                      const res = await adminSubscriptionsApi.reactivate(s.userId);
                      if (res.success) {
                        setToast('Subscription reactivated');
                        refresh();
                      } else {
                        setToast(res.error ?? 'Failed to reactivate');
                      }
                    } finally {
                      setIsSubmitting(false);
                    }
                  }}
                  disabled={isSubmitting}
                  data-testid="button-reactivate-subscription"
                >
                  Reactivate
                </Button>
              )}
            </div>
          );
        },
      },
    ],
    [statusBadgeVariant, openPlan, openExtend, openCancel, isSubmitting, refresh]
  );

  return (
    <div className="space-y-4" data-testid="admin-subscriptions-page">
      <h1 className="text-3xl font-bold tracking-tight">Subscriptions</h1>
      <p className="text-gray-600 dark:text-gray-400">Subscription management</p>

      {toast && (
        <div role="alert" data-testid="toast" className="rounded-md border p-3 text-sm">
          {toast}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>All Subscriptions</CardTitle>
          <CardDescription>Latest subscriptions across all customers.</CardDescription>
        </CardHeader>
        <CardContent>
          {showFullLoading && <LoadingSkeleton variant="list" count={5} />}
          {error && !hasLoadedOnce && !showFullLoading && (
            <ErrorDisplay error={error} title="Failed to load subscriptions" onRetry={retry} />
          )}
          {error && hasLoadedOnce && (
            <div
              role="alert"
              data-testid="subscriptions-error-inline"
              className="mb-3 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-200"
            >
              Failed to refresh subscriptions: {error}
            </div>
          )}

          {(hasLoadedOnce || (!showFullLoading && !error)) && (
            <div data-testid="subscriptions-table">
              <DataTable
                columns={subscriptionColumns}
                data={subs}
                pagination
                sorting
                pageSize={25}
                getRowProps={() => ({ 'data-testid': 'subscription-row' })}
              />
            </div>
          )}
        </CardContent>
      </Card>

      <SubscriptionPlanChangePanel
        isOpen={planUserId !== null}
        userId={planUserId}
        selectedPlan={selectedPlan}
        isSubmitting={isSubmitting}
        onPlanChange={setSelectedPlan}
        onConfirm={async () => {
          if (!planUserId) return;
          setIsSubmitting(true);
          setToast(null);
          try {
            const res = await adminSubscriptionsApi.changePlan(planUserId, selectedPlan);
            if (res.success) {
              setToast('Plan updated');
              closePanels();
              refresh();
            } else {
              setToast(res.error ?? 'Failed to update plan');
            }
          } finally {
            setIsSubmitting(false);
          }
        }}
        onCancel={closePanels}
      />

      <SubscriptionExtendTrialPanel
        isOpen={extendUserId !== null}
        userId={extendUserId}
        days={extendDays}
        reason={extendReason}
        isSubmitting={isSubmitting}
        onDaysChange={setExtendDays}
        onReasonChange={setExtendReason}
        onConfirm={async () => {
          if (!extendUserId) return;
          const daysNum = Number(extendDays);
          if (!Number.isFinite(daysNum) || daysNum <= 0) {
            setToast('Enter a valid number of days.');
            return;
          }
          setIsSubmitting(true);
          setToast(null);
          try {
            const res = await adminSubscriptionsApi.extendTrial(extendUserId, { days: daysNum, reason: extendReason });
            if (res.success) {
              setToast('Trial extended');
              closePanels();
              refresh();
            } else {
              setToast(res.error ?? 'Failed to extend trial');
            }
          } finally {
            setIsSubmitting(false);
          }
        }}
        onCancel={closePanels}
      />

      <SubscriptionCancelPanel
        isOpen={cancelUserId !== null}
        userId={cancelUserId}
        reason={cancelReason}
        isSubmitting={isSubmitting}
        onReasonChange={setCancelReason}
        onConfirm={async () => {
          if (!cancelUserId) return;
          setIsSubmitting(true);
          setToast(null);
          try {
            const res = await adminSubscriptionsApi.cancel(cancelUserId, cancelReason);
            if (res.success) {
              setToast('Subscription cancelled');
              closePanels();
              refresh();
            } else {
              setToast(res.error ?? 'Failed to cancel subscription');
            }
          } finally {
            setIsSubmitting(false);
          }
        }}
        onCancel={closePanels}
      />
    </div>
  );
}


