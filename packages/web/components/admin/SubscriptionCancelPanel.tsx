/**
 * SubscriptionCancelPanel (ISP)
 */

'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export interface ISubscriptionCancelPanelProps {
  readonly isOpen: boolean;
  readonly userId: string | null;
  readonly reason: string;
  readonly isSubmitting?: boolean;
  readonly onReasonChange: (value: string) => void;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}

export function SubscriptionCancelPanel({
  isOpen,
  userId,
  reason,
  isSubmitting = false,
  onReasonChange,
  onConfirm,
  onCancel,
}: ISubscriptionCancelPanelProps) {
  if (!isOpen || !userId) return null;

  return (
    <Card data-testid="cancel-subscription-panel">
      <CardHeader>
        <CardTitle>Cancel Subscription</CardTitle>
        <CardDescription>Provide a reason for cancellation.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="cancel-subscription-reason">Reason</Label>
          <Input
            id="cancel-subscription-reason"
            value={reason}
            onChange={(e) => onReasonChange(e.target.value)}
            disabled={isSubmitting}
            data-testid="cancel-subscription-reason"
          />
        </div>
        <div className="flex gap-2">
          <Button
            variant="destructive"
            onClick={onConfirm}
            disabled={isSubmitting || reason.trim().length === 0}
            data-testid="confirm-cancel-subscription-button"
          >
            Confirm
          </Button>
          <Button variant="outline" onClick={onCancel} disabled={isSubmitting} data-testid="cancel-cancel-subscription-button">
            Cancel
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}


