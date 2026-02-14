/**
 * PaymentRefundPanel (ISP)
 *
 * Focused UI for issuing a refund against a specific payment.
 */

'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export interface IPaymentRefundPanelProps {
  readonly isOpen: boolean;
  readonly paymentId: string | null;
  readonly maxAmount: number;
  readonly amount: string;
  readonly reason: string;
  readonly isSubmitting?: boolean;
  readonly onAmountChange: (value: string) => void;
  readonly onReasonChange: (value: string) => void;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}

export function PaymentRefundPanel({
  isOpen,
  paymentId,
  maxAmount,
  amount,
  reason,
  isSubmitting = false,
  onAmountChange,
  onReasonChange,
  onConfirm,
  onCancel,
}: IPaymentRefundPanelProps) {
  if (!isOpen || !paymentId) return null;

  return (
    <Card data-testid="refund-panel">
      <CardHeader>
        <CardTitle>Issue Refund</CardTitle>
        <CardDescription>Refund amount up to {maxAmount.toFixed(2)}.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="refund-amount">Amount</Label>
          <Input
            id="refund-amount"
            inputMode="decimal"
            value={amount}
            onChange={(e) => onAmountChange(e.target.value)}
            disabled={isSubmitting}
            data-testid="refund-amount"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="refund-reason">Reason</Label>
          <Input
            id="refund-reason"
            value={reason}
            onChange={(e) => onReasonChange(e.target.value)}
            disabled={isSubmitting}
            placeholder="e.g., customer request"
            data-testid="refund-reason"
          />
        </div>
        <div className="flex gap-2">
          <Button
            variant="destructive"
            onClick={onConfirm}
            disabled={isSubmitting || reason.trim().length === 0}
            data-testid="button-confirm-refund"
          >
            Confirm
          </Button>
          <Button variant="outline" onClick={onCancel} disabled={isSubmitting} data-testid="button-cancel-refund">
            Cancel
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}


