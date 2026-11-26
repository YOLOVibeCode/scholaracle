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

function describePlan(plan: string, cycle: BillingCycle): string {
  const entry = PURCHASABLE_PLANS.find((p) => p.plan === plan);
  if (!entry) return `${plan} (${cycle})`;
  const amount = cycle === 'annual' ? entry.annualPrice : entry.monthlyPrice;
  const period = cycle === 'annual' ? '/year' : '/month';
  return `${entry.name} — $${amount}${period} (${cycle})`;
}

export interface ChangePlanConfirmDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly currentPlan: string;
  readonly currentCycle: BillingCycle;
  readonly targetPlan: string;
  readonly targetCycle: BillingCycle;
  readonly isSubmitting: boolean;
  /** Why the last attempt failed; shown here, inside the dialog, where the buyer is looking. */
  readonly error?: string | null;
  readonly onConfirm: () => void;
}

export function ChangePlanConfirmDialog({
  open,
  onOpenChange,
  currentPlan,
  currentCycle,
  targetPlan,
  targetCycle,
  isSubmitting,
  error,
  onConfirm,
}: ChangePlanConfirmDialogProps) {
  return (
    // Esc or a click outside must not close the dialog while the store call (and a
    // possible charge) is in flight: the buyer would think they had cancelled.
    <Dialog open={open} onOpenChange={(next) => !isSubmitting && onOpenChange(next)}>
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
            <span className="font-medium">Current:</span> {describePlan(currentPlan, currentCycle)}
          </p>
          <p data-testid="change-plan-target">
            <span className="font-medium">New:</span> {describePlan(targetPlan, targetCycle)}
          </p>
          <p className="text-muted-foreground" data-testid="change-plan-terms">
            The store works out any prorated charge or credit. Depending on your payment provider,
            the new plan starts right away or at your next renewal date, and we will tell you which
            once it is done.
          </p>
          {error && (
            <p role="alert" className="text-destructive" data-testid="change-plan-error">
              {error}
            </p>
          )}
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
