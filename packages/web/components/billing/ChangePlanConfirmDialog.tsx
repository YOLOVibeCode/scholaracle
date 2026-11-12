'use client';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { BillingCycle } from '@/lib/billing/planCatalog';
import { PURCHASABLE_PLANS } from '@/lib/billing/planCatalog';

const PLAN_LABELS: Record<string, string> = {
  starter: 'Starter',
  premium: 'Premium',
  family: 'Family',
};

function formatPrice(plan: string, cycle: BillingCycle): string {
  const entry = PURCHASABLE_PLANS.find((p) => p.plan === plan);
  if (!entry) return '';
  const amount = cycle === 'annual' ? entry.annualPrice : entry.monthlyPrice;
  const period = cycle === 'annual' ? '/year' : '/month';
  return `$${amount}${period}`;
}

export interface ChangePlanConfirmDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly currentPlan: string;
  readonly currentCycle: BillingCycle;
  readonly targetPlan: string;
  readonly targetCycle: BillingCycle;
  readonly isUpgrade: boolean;
  readonly isSubmitting: boolean;
  readonly onConfirm: () => void;
}

export function ChangePlanConfirmDialog({
  open,
  onOpenChange,
  currentPlan,
  currentCycle,
  targetPlan,
  targetCycle,
  isUpgrade,
  isSubmitting,
  onConfirm,
}: ChangePlanConfirmDialogProps) {
  const currentLabel = PLAN_LABELS[currentPlan] ?? currentPlan;
  const targetLabel = PLAN_LABELS[targetPlan] ?? targetPlan;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="modal-change-plan-confirm">
        <DialogHeader>
          <DialogTitle>Confirm plan switch</DialogTitle>
          <DialogDescription>
            Review your new plan before confirming. Only &quot;Confirm switch&quot; will change your
            subscription.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <p data-testid="change-plan-current">
            <span className="font-medium">Current:</span> {currentLabel} —{' '}
            {formatPrice(currentPlan, currentCycle)} ({currentCycle})
          </p>
          <p data-testid="change-plan-target">
            <span className="font-medium">New:</span> {targetLabel} —{' '}
            {formatPrice(targetPlan, targetCycle)} ({targetCycle})
          </p>
          <p className="text-muted-foreground" data-testid="change-plan-terms">
            {isUpgrade
              ? 'Upgrades are prorated and charged to the card on file now.'
              : 'Downgrades take effect at your next renewal date; you keep your current plan until then.'}
          </p>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
            data-testid="button-keep-current-plan"
          >
            Keep current plan
          </Button>
          <Button
            type="button"
            onClick={onConfirm}
            disabled={isSubmitting}
            data-testid="button-confirm-plan-switch"
          >
            {isSubmitting ? 'Switching...' : 'Confirm switch'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
