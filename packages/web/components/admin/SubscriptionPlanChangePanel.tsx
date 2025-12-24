/**
 * SubscriptionPlanChangePanel (ISP)
 */

'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import type { ISubscription } from '@/lib/api/admin/subscriptions';

export interface ISubscriptionPlanChangePanelProps {
  readonly isOpen: boolean;
  readonly userId: string | null;
  readonly selectedPlan: ISubscription['plan'];
  readonly isSubmitting?: boolean;
  readonly onPlanChange: (plan: ISubscription['plan']) => void;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}

export function SubscriptionPlanChangePanel({
  isOpen,
  userId,
  selectedPlan,
  isSubmitting = false,
  onPlanChange,
  onConfirm,
  onCancel,
}: ISubscriptionPlanChangePanelProps) {
  if (!isOpen || !userId) return null;

  return (
    <Card data-testid="change-plan-panel">
      <CardHeader>
        <CardTitle>Change Plan</CardTitle>
        <CardDescription>Update the customer’s subscription plan.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="change-plan-select">Plan</Label>
          <select
            id="change-plan-select"
            className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            value={selectedPlan}
            onChange={(e) => onPlanChange(e.target.value as ISubscription['plan'])}
            disabled={isSubmitting}
            data-testid="change-plan-select"
          >
            <option value="free">free</option>
            <option value="starter">starter</option>
            <option value="premium">premium</option>
            <option value="family">family</option>
            <option value="enterprise">enterprise</option>
          </select>
        </div>
        <div className="flex gap-2">
          <Button variant="default" onClick={onConfirm} disabled={isSubmitting} data-testid="confirm-change-plan-button">
            Confirm
          </Button>
          <Button variant="outline" onClick={onCancel} disabled={isSubmitting} data-testid="cancel-change-plan-button">
            Cancel
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}


