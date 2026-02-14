/**
 * SubscriptionExtendTrialPanel (ISP)
 */

'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export interface ISubscriptionExtendTrialPanelProps {
  readonly isOpen: boolean;
  readonly userId: string | null;
  readonly days: string;
  readonly reason: string;
  readonly isSubmitting?: boolean;
  readonly onDaysChange: (value: string) => void;
  readonly onReasonChange: (value: string) => void;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}

export function SubscriptionExtendTrialPanel({
  isOpen,
  userId,
  days,
  reason,
  isSubmitting = false,
  onDaysChange,
  onReasonChange,
  onConfirm,
  onCancel,
}: ISubscriptionExtendTrialPanelProps) {
  if (!isOpen || !userId) return null;

  return (
    <Card data-testid="extend-trial-panel">
      <CardHeader>
        <CardTitle>Extend Trial</CardTitle>
        <CardDescription>Add days to the current trial period end date.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="extend-trial-days">Days</Label>
          <Input
            id="extend-trial-days"
            inputMode="numeric"
            value={days}
            onChange={(e) => onDaysChange(e.target.value)}
            disabled={isSubmitting}
            data-testid="extend-trial-days"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="extend-trial-reason">Reason</Label>
          <Input
            id="extend-trial-reason"
            value={reason}
            onChange={(e) => onReasonChange(e.target.value)}
            disabled={isSubmitting}
            placeholder="e.g., support extension"
            data-testid="extend-trial-reason"
          />
        </div>
        <div className="flex gap-2">
          <Button
            variant="default"
            onClick={onConfirm}
            disabled={isSubmitting || reason.trim().length === 0}
            data-testid="button-confirm-extend-trial"
          >
            Confirm
          </Button>
          <Button variant="outline" onClick={onCancel} disabled={isSubmitting} data-testid="button-cancel-extend-trial">
            Cancel
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}


