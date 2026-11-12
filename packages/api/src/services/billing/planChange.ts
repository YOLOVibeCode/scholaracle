import type { Db } from 'mongodb';
import {
  PLAN_FEATURES,
  StudentRepository,
  type BillingCycle,
  type SubscriptionPlan,
} from '@scholaracle/database';

export type PlanChangeEffective = 'now' | 'next_period';

export interface IPlanChangeClassification {
  readonly effective: PlanChangeEffective;
  readonly isUpgrade: boolean;
}

const PURCHASABLE_PLANS = new Set<SubscriptionPlan>(['starter', 'premium', 'family']);

export function isSelfServePurchasablePlan(plan: string | undefined): plan is SubscriptionPlan {
  return typeof plan === 'string' && PURCHASABLE_PLANS.has(plan as SubscriptionPlan);
}

/** Upgrade vs downgrade for store change-plan `effective`. */
export function classifyPlanChange(params: {
  readonly currentPlan: SubscriptionPlan;
  readonly currentCycle: BillingCycle;
  readonly targetPlan: SubscriptionPlan;
  readonly targetCycle: BillingCycle;
}): IPlanChangeClassification {
  const currentCap = PLAN_FEATURES[params.currentPlan].maxStudents;
  const targetCap = PLAN_FEATURES[params.targetPlan].maxStudents;

  if (targetCap > currentCap) {
    return { effective: 'now', isUpgrade: true };
  }
  if (targetCap < currentCap) {
    return { effective: 'next_period', isUpgrade: false };
  }

  // Same student cap: cycle-only change.
  if (params.currentCycle === 'monthly' && params.targetCycle === 'annual') {
    return { effective: 'now', isUpgrade: true };
  }
  if (params.currentCycle === 'annual' && params.targetCycle === 'monthly') {
    return { effective: 'next_period', isUpgrade: false };
  }

  return { effective: 'now', isUpgrade: true };
}

export async function countOwnedStudents(database: Db, userId: string): Promise<number> {
  const students = await new StudentRepository(database).findOwnedByUserId(userId);
  return students.length;
}

export function planLimitBlocksDowngrade(
  targetPlan: SubscriptionPlan,
  ownedStudentCount: number
): boolean {
  const maxStudents = PLAN_FEATURES[targetPlan].maxStudents;
  if (maxStudents === -1) {
    return false;
  }
  return ownedStudentCount > maxStudents;
}
