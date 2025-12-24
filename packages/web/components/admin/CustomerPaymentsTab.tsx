/**
 * CustomerPaymentsTab Component (ISP)
 * 
 * Small, focused component for displaying payment history.
 * Follows Interface Segregation Principle - single responsibility.
 */

'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { adminPaymentsApi, type IPayment } from '@/lib/api/admin/payments';
import { useAsyncData } from '@/lib/hooks';
import { ErrorDisplay, LoadingSkeleton } from '@/components/common';
import { CreditCard, Calendar } from 'lucide-react';

export interface ICustomerPaymentsTabProps {
  readonly customerId: string;
}

export function CustomerPaymentsTab({ customerId }: ICustomerPaymentsTabProps) {
  const { data: paymentsData, isLoading, error, retry } = useAsyncData<readonly IPayment[]>(
    async () => {
      const response = await adminPaymentsApi.getByUserId(customerId);
      if (!response.success || !response.data) {
        throw new Error(response.error ?? 'Failed to load payments');
      }
      return response.data;
    },
    { retryCount: 2, retryDelay: 1000 }
  );

  const payments = paymentsData ?? [];

  if (isLoading) {
    return <LoadingSkeleton variant="list" count={5} />;
  }

  if (error) {
    return <ErrorDisplay error={error} title="Failed to load payments" onRetry={retry} />;
  }

  return (
    <div className="space-y-4" data-testid="customer-payments-tab">
      <Card>
        <CardHeader>
          <CardTitle>Payment History</CardTitle>
          <CardDescription>All payments for this customer</CardDescription>
        </CardHeader>
        <CardContent>
          {payments.length === 0 ? (
            <p className="text-sm text-gray-600 dark:text-gray-400" data-testid="no-payments-message">
              No payment history found.
            </p>
          ) : (
            <div className="space-y-2">
              {payments.map((payment) => (
                <div
                  key={payment.id}
                  className="flex items-center justify-between rounded-md border p-3"
                  data-testid={`payment-${payment.id}`}
                >
                  <div className="flex items-center gap-3">
                    <CreditCard className="h-5 w-5 text-gray-500" />
                    <div>
                      <p className="font-medium">
                        {payment.currency.toUpperCase()} {payment.amount.toFixed(2)}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        <Calendar className="h-3 w-3 text-gray-400" />
                        <p className="text-xs text-gray-600 dark:text-gray-400">
                          {new Date(payment.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                  </div>
                  <Badge
                    variant={
                      payment.status === 'succeeded'
                        ? 'default'
                        : payment.status === 'failed'
                          ? 'destructive'
                          : 'secondary'
                    }
                    data-testid={`payment-status-${payment.id}`}
                  >
                    {payment.status}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

