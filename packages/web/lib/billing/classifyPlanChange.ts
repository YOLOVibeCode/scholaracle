import type { BillingCycle } from './planCatalog';
import { PURCHASABLE_PLANS } from './planCatalog';

function studentCap(plan: string): number {
  const entry = PURCHASABLE_PLANS.find((p) => p.plan === plan);
  return entry?.students ?? 0;
}

/** Mirrors API classifyPlanChange for confirm-dialog copy. */
export function isPlanChangeUpgrade(params: {
  readonly currentPlan: string;
  readonly currentCycle: BillingCycle;
  readonly targetPlan: string;
  readonly targetCycle: BillingCycle;
}): boolean {
  const currentCap = studentCap(params.currentPlan);
  const targetCap = studentCap(params.targetPlan);
  if (targetCap > currentCap) return true;
  if (targetCap < currentCap) return false;
  if (params.currentCycle === 'monthly' && params.targetCycle === 'annual') return true;
  if (params.currentCycle === 'annual' && params.targetCycle === 'monthly') return false;
  return true;
}
