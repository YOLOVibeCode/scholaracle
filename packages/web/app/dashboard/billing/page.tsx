'use client';

import { Suspense, useEffect, useState, useMemo, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { CreditCard, ExternalLink, FileText, Gift } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { billingApi, type ISubscriptionInfo, type IInvoice } from '@/lib/api/billing';
import { TrialCountdownBanner } from '@/components/billing/TrialCountdownBanner';
import { PlanIncludesCard } from '@/components/billing/PlanIncludesCard';
import { UpgradePlanPicker } from '@/components/billing/UpgradePlanPicker';
import { ChangePlanConfirmDialog } from '@/components/billing/ChangePlanConfirmDialog';
import { InvoiceHistoryList } from '@/components/billing/InvoiceHistoryList';
import type { BillingCycle } from '@/lib/billing/planCatalog';
import { isPlanChangeUpgrade } from '@/lib/billing/classifyPlanChange';
import { ApiClientError } from '@/lib/api/client';

const PLAN_LABELS: Record<string, string> = {
  free: 'Free',
  starter: 'Starter',
  premium: 'Premium',
  family: 'Family',
  enterprise: 'Enterprise',
};

const STATUS_VARIANTS: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  active: 'default',
  trialing: 'secondary',
  past_due: 'destructive',
  cancelled: 'outline',
};

function BillingPageContent() {
  const searchParams = useSearchParams();
  const upgradePlan = useMemo(() => searchParams.get('upgrade') ?? null, [searchParams]);
  const cycleParam = useMemo(
    () => (searchParams.get('cycle') === 'annual' ? 'annual' : 'monthly') as BillingCycle,
    [searchParams]
  );

  const couponParam = useMemo(() => searchParams.get('coupon') ?? null, [searchParams]);

  const [subscription, setSubscription] = useState<ISubscriptionInfo | null>(null);
  const [invoices, setInvoices] = useState<IInvoice[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isPortalLoading, setIsPortalLoading] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [toastType, setToastType] = useState<'error' | 'success'>('error');

  const [couponCode, setCouponCode] = useState(couponParam ?? '');
  const [isRedeeming, setIsRedeeming] = useState(false);
  const [switchTarget, setSwitchTarget] = useState<{
    plan: string;
    cycle: BillingCycle;
  } | null>(null);
  const [isSwitching, setIsSwitching] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const [sub, inv] = await Promise.all([
          billingApi.getSubscription(),
          billingApi.getInvoices(),
        ]);
        setSubscription(sub);
        setInvoices(inv);
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  const showToast = useCallback((message: string, type: 'error' | 'success') => {
    setToastType(type);
    setToast(message);
  }, []);

  const handleManageBilling = async () => {
    setIsPortalLoading(true);
    setToast(null);
    const url = await billingApi.createPortal();
    setIsPortalLoading(false);
    if (url) {
      window.location.href = url;
    } else {
      setToast('Failed to open billing portal');
    }
  };

  const handleCancel = async (): Promise<void> => {
    setIsCancelling(true);
    setToast(null);
    const updated = await billingApi.cancelSubscription();
    setIsCancelling(false);
    setShowCancelConfirm(false);
    if (updated) {
      setSubscription(updated);
      showToast('Your subscription will end at the close of this billing period.', 'success');
    } else {
      showToast('Failed to cancel subscription', 'error');
    }
  };

  const handleSwitchRequest = (plan: string, billingCycle: BillingCycle) => {
    setSwitchTarget({ plan, cycle: billingCycle });
  };

  const handleConfirmSwitch = async () => {
    if (!switchTarget) return;
    setIsSwitching(true);
    setToast(null);
    try {
      const updated = await billingApi.changePlan(switchTarget.plan, switchTarget.cycle);
      setSwitchTarget(null);
      if (updated) {
        setSubscription(updated);
        showToast('Your plan change has been submitted.', 'success');
      }
    } catch (error) {
      const message =
        error instanceof ApiClientError
          ? error.message
          : 'Failed to change plan. Try again or contact support.';
      showToast(message, 'error');
    } finally {
      setIsSwitching(false);
    }
  };

  const handleUpgrade = async (plan: string, billingCycle: BillingCycle = 'monthly') => {
    setToast(null);
    const url = await billingApi.createCheckout(plan, billingCycle);
    if (url) {
      window.location.href = url;
    } else {
      showToast('Failed to start checkout', 'error');
    }
  };

  const handleRedeemCoupon = async () => {
    if (!couponCode.trim()) return;
    setIsRedeeming(true);
    setToast(null);
    const result = await billingApi.redeemCoupon(couponCode.trim(), upgradePlan ?? undefined);
    setIsRedeeming(false);
    if (result.success && result.subscription) {
      showToast(
        result.message
          ? `Coupon applied: ${result.message}. Enjoy your free trial!`
          : 'Coupon redeemed! Your trial is active.',
        'success'
      );
      setSubscription({
        plan: result.subscription.plan,
        status: result.subscription.status,
        currentPeriodEnd: result.subscription.trialEnd,
      });
      setCouponCode('');
    } else {
      showToast(result.error ?? 'Failed to redeem coupon', 'error');
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6" data-testid="billing-page">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Billing</h1>
          <p className="text-gray-600 dark:text-gray-400">Loading...</p>
        </div>
      </div>
    );
  }

  const isFreePlan = (subscription?.effectivePlan ?? subscription?.plan) === 'free';
  const paidPlan = subscription?.plan ?? 'starter';
  const paidCycle = (
    subscription?.billingCycle === 'annual' ? 'annual' : 'monthly'
  ) as BillingCycle;
  const switchDisabled = Boolean(subscription?.cancelAtPeriodEnd);

  return (
    <div className="space-y-6" data-testid="billing-page">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Billing</h1>
        <p className="text-gray-600 dark:text-gray-400">Manage your subscription and billing</p>
      </div>

      {subscription?.status === 'trialing' &&
        (subscription.trialEnd ?? subscription.currentPeriodEnd) && (
          <TrialCountdownBanner
            trialEndIso={subscription.trialEnd ?? subscription.currentPeriodEnd ?? ''}
          />
        )}

      {toast && (
        <div
          role="alert"
          data-testid="billing-toast"
          className={`rounded-md border p-3 text-sm ${
            toastType === 'success'
              ? 'border-green-200 bg-green-50 text-green-800 dark:border-green-800 dark:bg-green-950 dark:text-green-200'
              : 'border-red-200 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200'
          }`}
        >
          {toast}
        </div>
      )}

      <div className="grid gap-6 md:grid-cols-2 md:items-start" data-testid="billing-plan-overview">
        <Card data-testid="current-plan-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5" />
              Current Plan
            </CardTitle>
            <CardDescription>Your active subscription details</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-3">
              <span className="text-2xl font-bold" data-testid="current-plan">
                {PLAN_LABELS[subscription?.plan ?? 'free'] ?? subscription?.plan}
              </span>
              <Badge
                variant={STATUS_VARIANTS[subscription?.status ?? 'active'] ?? 'outline'}
                data-testid="plan-status"
              >
                {subscription?.status ?? 'active'}
              </Badge>
            </div>

            {subscription?.billingCycle && (
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Billed {subscription.billingCycle}
              </p>
            )}

            {subscription?.currentPeriodEnd && (
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {subscription.cancelAtPeriodEnd
                  ? `Cancels on ${new Date(subscription.currentPeriodEnd).toLocaleDateString()}`
                  : `Renews on ${new Date(subscription.currentPeriodEnd).toLocaleDateString()}`}
              </p>
            )}
          </CardContent>
          {!isFreePlan && (
            <CardFooter className="flex flex-wrap items-center gap-3">
              <Button
                variant="outline"
                onClick={() => void handleManageBilling()}
                disabled={isPortalLoading}
                data-testid="button-manage-billing"
              >
                <ExternalLink className="mr-2 h-4 w-4" />
                {isPortalLoading ? 'Opening...' : 'Update card'}
              </Button>
              {subscription?.status === 'active' && !subscription.cancelAtPeriodEnd && (
                <Button
                  variant="ghost"
                  onClick={() => setShowCancelConfirm(true)}
                  disabled={isCancelling}
                  data-testid="button-cancel-subscription"
                >
                  Cancel subscription
                </Button>
              )}
            </CardFooter>
          )}
        </Card>

        <PlanIncludesCard subscription={subscription} />
      </div>

      <UpgradePlanPicker
        mode={isFreePlan ? 'checkout' : 'switch'}
        initialPlan={isFreePlan ? upgradePlan : paidPlan}
        initialCycle={isFreePlan ? cycleParam : paidCycle}
        currentPlan={isFreePlan ? undefined : paidPlan}
        currentCycle={isFreePlan ? undefined : paidCycle}
        switchDisabled={!isFreePlan && switchDisabled}
        onCheckout={(plan, cycle) => void handleUpgrade(plan, cycle)}
        onSwitchRequest={handleSwitchRequest}
      />

      {isFreePlan && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Gift className="h-5 w-5" />
              Have a coupon code?
            </CardTitle>
            <CardDescription>Enter a coupon code to start a free trial</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2">
              <Input
                data-testid="input-redeem-coupon"
                placeholder="e.g. TRYME30"
                value={couponCode}
                onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void handleRedeemCoupon();
                }}
              />
              <Button
                onClick={() => void handleRedeemCoupon()}
                disabled={isRedeeming || !couponCode.trim()}
                data-testid="button-redeem-coupon"
              >
                {isRedeeming ? 'Redeeming...' : 'Redeem'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Invoice History
          </CardTitle>
          <CardDescription>Your recent invoices</CardDescription>
        </CardHeader>
        <CardContent>
          <InvoiceHistoryList invoices={invoices} />
        </CardContent>
      </Card>

      {switchTarget && !isFreePlan && (
        <ChangePlanConfirmDialog
          open={Boolean(switchTarget)}
          onOpenChange={(open) => {
            if (!open) setSwitchTarget(null);
          }}
          currentPlan={paidPlan}
          currentCycle={paidCycle}
          targetPlan={switchTarget.plan}
          targetCycle={switchTarget.cycle}
          isUpgrade={isPlanChangeUpgrade({
            currentPlan: paidPlan,
            currentCycle: paidCycle,
            targetPlan: switchTarget.plan,
            targetCycle: switchTarget.cycle,
          })}
          isSubmitting={isSwitching}
          onConfirm={() => void handleConfirmSwitch()}
        />
      )}

      <Dialog open={showCancelConfirm} onOpenChange={setShowCancelConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel your subscription?</DialogTitle>
            <DialogDescription>
              You keep {PLAN_LABELS[subscription?.plan ?? 'free'] ?? 'your plan'} until
              {subscription?.currentPeriodEnd
                ? ` ${new Date(subscription.currentPeriodEnd).toLocaleDateString()}`
                : ' the end of this billing period'}
              . After that the account moves to the free plan and you are not charged again.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 pt-4">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowCancelConfirm(false)}
              disabled={isCancelling}
            >
              Keep subscription
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => void handleCancel()}
              disabled={isCancelling}
              data-testid="button-confirm-cancel"
            >
              {isCancelling ? 'Cancelling...' : 'Cancel subscription'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function BillingPage() {
  return (
    <Suspense
      fallback={
        <div className="space-y-6" data-testid="billing-page">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Billing</h1>
            <p className="text-gray-600 dark:text-gray-400">Loading...</p>
          </div>
        </div>
      }
    >
      <BillingPageContent />
    </Suspense>
  );
}
