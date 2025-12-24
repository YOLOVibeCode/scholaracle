'use client';

import { useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
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
            <Table data-testid="subscriptions-table">
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Plan</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Period End</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {subs.map((s) => (
                  <TableRow key={s.id} data-testid="subscription-row">
                    <TableCell className="text-xs text-gray-600 dark:text-gray-400">{s.userId}</TableCell>
                    <TableCell>
                      <Badge variant="outline" data-testid="subscription-plan-badge">
                        {s.plan}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusBadgeVariant(s.status)} data-testid="subscription-status-badge">
                        {s.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-gray-600 dark:text-gray-400">
                      {new Date(s.currentPeriodEnd).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openPlan(s)}
                          data-testid="change-plan-button"
                        >
                          Change Plan
                        </Button>

                        {s.status === 'trialing' && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openExtend(s)}
                            data-testid="extend-trial-button"
                          >
                            Extend Trial
                          </Button>
                        )}

                        {(s.status === 'active' || s.status === 'trialing') && (
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => openCancel(s)}
                            data-testid="cancel-subscription-button"
                          >
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
                            data-testid="reactivate-subscription-button"
                          >
                            Reactivate
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {subs.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-sm text-gray-600 dark:text-gray-400">
                      No subscriptions found.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
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


