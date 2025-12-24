/**
 * CustomerSuspendPanel Component (ISP)
 *
 * Focused UI surface for collecting a suspension reason and confirming/cancelling.
 */
 
'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export interface ICustomerSuspendPanelProps {
  readonly isOpen: boolean;
  readonly reason: string;
  readonly isSubmitting?: boolean;
  readonly onReasonChange: (value: string) => void;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}

export function CustomerSuspendPanel({
  isOpen,
  reason,
  isSubmitting = false,
  onReasonChange,
  onConfirm,
  onCancel,
}: ICustomerSuspendPanelProps) {
  if (!isOpen) return null;

  return (
    <Card data-testid="suspend-panel">
      <CardHeader>
        <CardTitle>Suspend Customer</CardTitle>
        <CardDescription>Provide a reason. This will restrict the customer from accessing the app.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="suspend-reason">Reason</Label>
          <Input
            id="suspend-reason"
            value={reason}
            onChange={(e) => onReasonChange(e.target.value)}
            placeholder="e.g., Chargeback, abuse, account review"
            disabled={isSubmitting}
            data-testid="suspend-reason-input"
          />
        </div>
        <div className="flex gap-2">
          <Button
            variant="destructive"
            onClick={onConfirm}
            disabled={isSubmitting || reason.trim().length === 0}
            data-testid="confirm-suspend-button"
          >
            Confirm
          </Button>
          <Button variant="outline" onClick={onCancel} disabled={isSubmitting} data-testid="cancel-suspend-button">
            Cancel
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}


