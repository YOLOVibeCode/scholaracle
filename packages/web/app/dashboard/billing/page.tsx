'use client';

import { Suspense, useEffect, useState, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { CreditCard, ExternalLink, FileText, Gift } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { billingApi, type ISubscriptionInfo, type IInvoice } from '@/lib/api/billing';

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

type BillingCycle = 'monthly' | 'annual';

function BillingPageContent() {
  const searchParams = useSearchParams();
  const upgradePlan = useMemo(
    () => searchParams.get('upgrade') ?? null,
    [searchParams]
  );
  const cycleParam = useMemo(
    () => (searchParams.get('cycle') === 'annual' ? 'annual' : 'monthly') as BillingCycle,
    [searchParams]
  );

  const couponParam = useMemo(
    () => searchParams.get('coupon') ?? null,
    [searchParams]
  );

  const [subscription, setSubscription] = useState<ISubscriptionInfo | null>(null);
  const [invoices, setInvoices] = useState<IInvoice[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isPortalLoading, setIsPortalLoading] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [toastType, setToastType] = useState<'error' | 'success'>('error');
  const [billingCycle, setBillingCycle] = useState<BillingCycle>(cycleParam);

  const [couponCode, setCouponCode] = useState(couponParam ?? '');
  const [isRedeeming, setIsRedeeming] = useState(false);

  useEffect(() => {
    setBillingCycle(cycleParam);
  }, [cycleParam]);

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

  const handleUpgrade = async (plan: string, billingCycle: 'monthly' | 'annual' = 'monthly') => {
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

  const showToast = (message: string, type: 'error' | 'success') => {
    setToastType(type);
    setToast(message);
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

  const isFreePlan = subscription?.plan === 'free';

  return (
    <div className="space-y-6" data-testid="billing-page">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Billing</h1>
        <p className="text-gray-600 dark:text-gray-400">Manage your subscription and billing</p>
      </div>

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

      {/* Current Plan */}
      <Card>
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
        <CardFooter className="flex flex-wrap items-center gap-3">
          {isFreePlan ? (
            <>
              <div className="flex items-center gap-2" data-testid="billing-cycle-toggle">
                <span className={billingCycle === 'monthly' ? 'font-medium' : 'text-muted-foreground text-sm'}>
                  Monthly
                </span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={billingCycle === 'annual'}
                  onClick={() => setBillingCycle((c) => (c === 'monthly' ? 'annual' : 'monthly'))}
                  className="relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent bg-gray-200 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:bg-gray-700 aria-[checked=true]:bg-blue-600"
                  data-testid="toggle-annual-billing"
                >
                  <span
                    className="pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition-transform"
                    style={{ transform: billingCycle === 'annual' ? 'translateX(1.25rem)' : 'translateX(0)' }}
                  />
                </button>
                <span className={billingCycle === 'annual' ? 'font-medium text-sm' : 'text-muted-foreground text-sm'}>
                  Annual
                </span>
              </div>
              <Button
                onClick={() => handleUpgrade(upgradePlan ?? 'starter', billingCycle)}
                data-testid="button-upgrade"
              >
                Upgrade to {PLAN_LABELS[upgradePlan ?? 'starter'] ?? 'Starter'}
                {billingCycle === 'annual' ? ' (annual)' : ''}
              </Button>
            </>
          ) : (
            <Button
              variant="outline"
              onClick={handleManageBilling}
              disabled={isPortalLoading}
              data-testid="button-manage-billing"
            >
              <ExternalLink className="mr-2 h-4 w-4" />
              {isPortalLoading ? 'Opening...' : 'Manage Billing'}
            </Button>
          )}
        </CardFooter>
      </Card>

      {/* Coupon Redemption */}
      {isFreePlan && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Gift className="h-5 w-5" />
              Have a coupon code?
            </CardTitle>
            <CardDescription>
              Enter a coupon code to start a free trial
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2">
              <Input
                data-testid="input-redeem-coupon"
                placeholder="e.g. TRYME30"
                value={couponCode}
                onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                onKeyDown={(e) => { if (e.key === 'Enter') void handleRedeemCoupon(); }}
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

      {/* Invoice History */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Invoice History
          </CardTitle>
          <CardDescription>Your recent invoices</CardDescription>
        </CardHeader>
        <CardContent>
          {invoices.length === 0 ? (
            <p className="text-sm text-gray-500" data-testid="no-invoices">
              No invoices yet
            </p>
          ) : (
            <div className="space-y-3" data-testid="invoice-list">
              {invoices.map((invoice) => (
                <div
                  key={invoice.id}
                  className="flex items-center justify-between rounded-md border p-3"
                  data-testid="invoice-item"
                >
                  <div>
                    <p className="text-sm font-medium">
                      ${invoice.amount.toFixed(2)} {invoice.currency.toUpperCase()}
                    </p>
                    <p className="text-xs text-gray-500">
                      {new Date(invoice.date).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={invoice.status === 'succeeded' || invoice.status === 'paid' ? 'default' : 'outline'}>
                      {invoice.status}
                    </Badge>
                    {invoice.pdfUrl && (
                      <a
                        href={invoice.pdfUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-blue-600 hover:underline dark:text-blue-400"
                      >
                        PDF
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
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
