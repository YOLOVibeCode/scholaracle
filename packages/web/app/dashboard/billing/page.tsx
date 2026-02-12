'use client';

import { useEffect, useState } from 'react';
import { CreditCard, ExternalLink, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
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

export default function BillingPage() {
  const [subscription, setSubscription] = useState<ISubscriptionInfo | null>(null);
  const [invoices, setInvoices] = useState<IInvoice[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isPortalLoading, setIsPortalLoading] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

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
      setToast('Failed to start checkout');
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

  const isFreePlan = subscription?.plan === 'free';

  return (
    <div className="space-y-6" data-testid="billing-page">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Billing</h1>
        <p className="text-gray-600 dark:text-gray-400">Manage your subscription and billing</p>
      </div>

      {toast && (
        <div role="alert" data-testid="billing-toast" className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200">
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
        <CardFooter className="flex gap-3">
          {isFreePlan ? (
            <Button
              onClick={() => handleUpgrade('starter', 'monthly')}
              data-testid="upgrade-button"
            >
              Upgrade to Starter
            </Button>
          ) : (
            <Button
              variant="outline"
              onClick={handleManageBilling}
              disabled={isPortalLoading}
              data-testid="manage-billing-button"
            >
              <ExternalLink className="mr-2 h-4 w-4" />
              {isPortalLoading ? 'Opening...' : 'Manage Billing'}
            </Button>
          )}
        </CardFooter>
      </Card>

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
