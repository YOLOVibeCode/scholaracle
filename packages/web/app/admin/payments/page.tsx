'use client';

import { useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useAsyncData } from '@/lib/hooks';
import { ErrorDisplay, LoadingSkeleton } from '@/components/common';
import { adminPaymentsApi, type IPayment } from '@/lib/api/admin/payments';
import { PaymentRefundPanel } from '@/components/admin';

export default function AdminPaymentsPage() {
  const [toast, setToast] = useState<string | null>(null);
  const [refundPaymentId, setRefundPaymentId] = useState<string | null>(null);
  const [refundAmount, setRefundAmount] = useState('10.00');
  const [refundReason, setRefundReason] = useState('');
  const [isRefunding, setIsRefunding] = useState(false);

  const { data: paymentsData, isLoading, error, retry, refresh } = useAsyncData<readonly IPayment[]>(
    async () => {
      const res = await adminPaymentsApi.list();
      if (!res.success || !res.data) throw new Error(res.error ?? 'Failed to load payments');
      return res.data;
    },
    { retryCount: 2, retryDelay: 1000 }
  );

  const payments = paymentsData ?? [];
  const hasLoadedOnce = paymentsData !== null;
  const showFullLoading = isLoading && !hasLoadedOnce;

  const refundMaxAmount = useMemo(() => {
    const p = payments.find((x) => x.id === refundPaymentId);
    if (!p) return 0;
    const alreadyRefunded = p.amountRefunded ?? 0;
    return Math.max(0, p.amount - alreadyRefunded);
  }, [payments, refundPaymentId]);

  const openRefund = (payment: IPayment) => {
    setToast(null);
    setRefundPaymentId(payment.id);
    setRefundReason('');
    // Default to full remaining amount
    const alreadyRefunded = payment.amountRefunded ?? 0;
    const remaining = Math.max(0, payment.amount - alreadyRefunded);
    setRefundAmount(remaining.toFixed(2));
  };

  const closeRefund = () => {
    setRefundPaymentId(null);
    setRefundReason('');
  };

  const confirmRefund = async () => {
    if (!refundPaymentId) return;
    const amt = Number(refundAmount);
    if (!Number.isFinite(amt) || amt <= 0) {
      setToast('Enter a valid refund amount.');
      return;
    }
    if (amt > refundMaxAmount + 1e-6) {
      setToast(`Refund amount exceeds remaining refundable amount (${refundMaxAmount.toFixed(2)}).`);
      return;
    }
    if (!refundReason.trim()) {
      setToast('Refund reason is required.');
      return;
    }

    setIsRefunding(true);
    setToast(null);
    try {
      const res = await adminPaymentsApi.refund(refundPaymentId, { amount: amt, reason: refundReason.trim() });
      if (!res.success) {
        setToast(res.error ?? 'Refund failed.');
        return;
      }
      setToast('Refund processed');
      closeRefund();
      refresh();
    } finally {
      setIsRefunding(false);
    }
  };

  const retryPayment = async (paymentId: string) => {
    setToast(null);
    const res = await adminPaymentsApi.retry(paymentId);
    if (res.success) {
      setToast('Payment retry initiated');
      refresh();
    } else {
      setToast(res.error ?? 'Failed to retry payment');
    }
  };

  return (
    <div className="space-y-4" data-testid="admin-payments-page">
      <h1 className="text-3xl font-bold tracking-tight">Payments</h1>
      <p className="text-gray-600 dark:text-gray-400">Payment management</p>

      {toast && (
        <div role="alert" data-testid="toast" className="rounded-md border p-3 text-sm">
          {toast}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>All Payments</CardTitle>
          <CardDescription>Latest payments across all customers.</CardDescription>
        </CardHeader>
        <CardContent>
          {showFullLoading && <LoadingSkeleton variant="list" count={5} />}

          {/* If we have no data yet, show a blocking error. If we have stale data, keep it visible and show inline error. */}
          {error && !hasLoadedOnce && !showFullLoading && (
            <ErrorDisplay error={error} title="Failed to load payments" onRetry={retry} />
          )}
          {error && hasLoadedOnce && (
            <div
              role="alert"
              data-testid="payments-error-inline"
              className="mb-3 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-200"
            >
              Failed to refresh payments: {error}
            </div>
          )}

          {/* Keep table mounted even while refreshing to avoid DOM detaches during user clicks. */}
          {(hasLoadedOnce || (!showFullLoading && !error)) && (
            <Table data-testid="payments-table">
              <TableHeader>
                <TableRow>
                  <TableHead>Payment</TableHead>
                  <TableHead>User</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payments.map((p) => (
                  <TableRow key={p.id} data-testid="payment-row">
                    <TableCell>
                      <div className="font-medium">
                        {p.currency.toUpperCase()} {p.amount.toFixed(2)}
                      </div>
                      <div className="text-xs text-gray-600 dark:text-gray-400">{p.paymentMethod}</div>
                    </TableCell>
                    <TableCell className="text-xs text-gray-600 dark:text-gray-400">{p.userId}</TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          p.status === 'succeeded'
                            ? 'default'
                            : p.status === 'failed'
                              ? 'destructive'
                              : 'secondary'
                        }
                      >
                        {p.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-gray-600 dark:text-gray-400">
                      {p.createdAt ? new Date(p.createdAt).toLocaleString() : ''}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        {(p.status === 'succeeded' || p.status === 'partially_refunded') && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openRefund(p)}
                            data-testid="button-refund"
                          >
                            Refund
                          </Button>
                        )}
                        {p.status === 'failed' && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => retryPayment(p.id)}
                            data-testid="button-retry"
                          >
                            Retry
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {payments.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-sm text-gray-600 dark:text-gray-400">
                      No payments found.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <PaymentRefundPanel
        isOpen={refundPaymentId !== null}
        paymentId={refundPaymentId}
        maxAmount={refundMaxAmount}
        amount={refundAmount}
        reason={refundReason}
        isSubmitting={isRefunding}
        onAmountChange={setRefundAmount}
        onReasonChange={setRefundReason}
        onConfirm={confirmRefund}
        onCancel={closeRefund}
      />
    </div>
  );
}


