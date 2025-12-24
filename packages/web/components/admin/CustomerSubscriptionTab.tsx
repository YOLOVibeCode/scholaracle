/**
 * CustomerSubscriptionTab Component (ISP)
 * 
 * Small, focused component for displaying subscription information.
 * Follows Interface Segregation Principle - single responsibility.
 */

'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Calendar, CreditCard } from 'lucide-react';
import { adminSubscriptionsApi, type ISubscription } from '@/lib/api/admin/subscriptions';
import { useAsyncData } from '@/lib/hooks';
import { ErrorDisplay, LoadingSkeleton } from '@/components/common';
import { SubscriptionCancelPanel, SubscriptionExtendTrialPanel, SubscriptionPlanChangePanel } from '@/components/admin';

export interface ICustomerSubscriptionTabProps {
  readonly customerId: string;
  readonly subscriptionId?: string;
}

export function CustomerSubscriptionTab({ customerId, subscriptionId }: ICustomerSubscriptionTabProps) {
  const [toast, setToast] = useState<string | null>(null);
  const [isCancelOpen, setIsCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [isExtendTrialOpen, setIsExtendTrialOpen] = useState(false);
  const [extendDays, setExtendDays] = useState('7');
  const [extendReason, setExtendReason] = useState('');
  const [isPlanOpen, setIsPlanOpen] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<ISubscription['plan']>('starter');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { data: subscription, isLoading, error, retry, refresh } = useAsyncData<ISubscription | null>(
    async () => {
      // If subscriptionId is provided, fetch by ID
      if (subscriptionId) {
        const response = await adminSubscriptionsApi.getById(subscriptionId);
        if (!response.success || !response.data) {
          throw new Error(response.error ?? 'Failed to load subscription');
        }
        return response.data;
      }
      // Otherwise, try to find subscription by userId
      const response = await adminSubscriptionsApi.getByUserId(customerId);
      if (!response.success || !response.data) {
        // No subscription found is not an error
        return null;
      }
      // Return the first subscription found (users typically have one active subscription)
      return response.data.length > 0 ? response.data[0] : null;
    },
    { retryCount: 2, retryDelay: 1000 }
  );

  if (isLoading) {
    return <LoadingSkeleton variant="card" />;
  }

  if (error) {
    return <ErrorDisplay error={error} title="Failed to load subscription" onRetry={retry} />;
  }

  if (!subscription) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-sm text-gray-600 dark:text-gray-400" data-testid="no-subscription-message">
            No active subscription found.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4" data-testid="customer-subscription-tab">
      <Card>
        <CardHeader>
          <CardTitle>Subscription Details</CardTitle>
          <CardDescription>Current plan and billing information</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {toast && (
            <div role="alert" data-testid="toast" className="rounded-md border p-3 text-sm">
              {toast}
            </div>
          )}

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="text-sm font-medium text-gray-600 dark:text-gray-400">Plan</label>
              <div className="mt-1">
                <Badge variant="outline" className="text-lg" data-testid="subscription-plan">
                  {subscription.plan}
                </Badge>
              </div>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-600 dark:text-gray-400">Status</label>
              <div className="mt-1">
                <Badge
                  variant={subscription.status === 'active' ? 'default' : 'secondary'}
                  data-testid="subscription-status"
                >
                  {subscription.status}
                </Badge>
              </div>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-600 dark:text-gray-400">Current Period Start</label>
              <div className="mt-1 flex items-center gap-2">
                <Calendar className="h-4 w-4 text-gray-500" />
                <p className="text-sm" data-testid="period-start">
                  {new Date(subscription.currentPeriodStart).toLocaleDateString()}
                </p>
              </div>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-600 dark:text-gray-400">Current Period End</label>
              <div className="mt-1 flex items-center gap-2">
                <Calendar className="h-4 w-4 text-gray-500" />
                <p className="text-sm" data-testid="period-end">
                  {new Date(subscription.currentPeriodEnd).toLocaleDateString()}
                </p>
              </div>
            </div>
          </div>

          {subscription.cancelAtPeriodEnd && (
            <div className="rounded-md border border-yellow-200 bg-yellow-50 p-3 dark:border-yellow-800 dark:bg-yellow-900/20">
              <p className="text-sm font-medium text-yellow-900 dark:text-yellow-100">
                Subscription will cancel at period end
              </p>
              {subscription.canceledAt && (
                <p className="mt-1 text-xs text-yellow-800 dark:text-yellow-200">
                  Canceled on: {new Date(subscription.canceledAt).toLocaleDateString()}
                </p>
              )}
            </div>
          )}

          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setSelectedPlan(subscription.plan);
                setIsPlanOpen(true);
              }}
              data-testid="change-plan-button"
            >
              Change Plan
            </Button>

            {subscription.status === 'trialing' && (
              <Button
                variant="outline"
                onClick={() => {
                  setExtendDays('7');
                  setExtendReason('');
                  setIsExtendTrialOpen(true);
                }}
                data-testid="extend-trial-button"
              >
                Extend Trial
              </Button>
            )}

            {(subscription.status === 'active' || subscription.status === 'trialing') && !subscription.cancelAtPeriodEnd && (
              <Button
                variant="destructive"
                onClick={() => {
                  setCancelReason('');
                  setIsCancelOpen(true);
                }}
                data-testid="cancel-subscription-button"
              >
                Cancel Subscription
              </Button>
            )}
            {subscription.status === 'cancelled' && (
              <Button
                variant="default"
                onClick={async () => {
                  setIsSubmitting(true);
                  setToast(null);
                  try {
                    const res = await adminSubscriptionsApi.reactivate(customerId);
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
                Reactivate Subscription
              </Button>
            )}
          </div>

          <SubscriptionPlanChangePanel
            isOpen={isPlanOpen}
            userId={customerId}
            selectedPlan={selectedPlan}
            isSubmitting={isSubmitting}
            onPlanChange={setSelectedPlan}
            onConfirm={async () => {
              setIsSubmitting(true);
              setToast(null);
              try {
                const res = await adminSubscriptionsApi.changePlan(customerId, selectedPlan);
                if (res.success) {
                  setToast('Plan updated');
                  setIsPlanOpen(false);
                  refresh();
                } else {
                  setToast(res.error ?? 'Failed to update plan');
                }
              } finally {
                setIsSubmitting(false);
              }
            }}
            onCancel={() => setIsPlanOpen(false)}
          />

          <SubscriptionExtendTrialPanel
            isOpen={isExtendTrialOpen}
            userId={customerId}
            days={extendDays}
            reason={extendReason}
            isSubmitting={isSubmitting}
            onDaysChange={setExtendDays}
            onReasonChange={setExtendReason}
            onConfirm={async () => {
              const daysNum = Number(extendDays);
              if (!Number.isFinite(daysNum) || daysNum <= 0) {
                setToast('Enter a valid number of days.');
                return;
              }
              setIsSubmitting(true);
              setToast(null);
              try {
                const res = await adminSubscriptionsApi.extendTrial(customerId, { days: daysNum, reason: extendReason });
                if (res.success) {
                  setToast('Trial extended');
                  setIsExtendTrialOpen(false);
                  refresh();
                } else {
                  setToast(res.error ?? 'Failed to extend trial');
                }
              } finally {
                setIsSubmitting(false);
              }
            }}
            onCancel={() => setIsExtendTrialOpen(false)}
          />

          <SubscriptionCancelPanel
            isOpen={isCancelOpen}
            userId={customerId}
            reason={cancelReason}
            isSubmitting={isSubmitting}
            onReasonChange={setCancelReason}
            onConfirm={async () => {
              setIsSubmitting(true);
              setToast(null);
              try {
                const res = await adminSubscriptionsApi.cancel(customerId, cancelReason);
                if (res.success) {
                  setToast('Subscription cancelled');
                  setIsCancelOpen(false);
                  refresh();
                } else {
                  setToast(res.error ?? 'Failed to cancel');
                }
              } finally {
                setIsSubmitting(false);
              }
            }}
            onCancel={() => setIsCancelOpen(false)}
          />
        </CardContent>
      </Card>
    </div>
  );
}

