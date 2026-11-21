import type { Db } from 'mongodb';
import {
  PLAN_FEATURES,
  StudentRepository,
  type BillingCycle,
  type SubscriptionPlan,
} from '@scholaracle/database';

const PURCHASABLE_PLANS = new Set<SubscriptionPlan>(['starter', 'premium', 'family']);

export function isSelfServePurchasablePlan(plan: string | undefined): plan is SubscriptionPlan {
  return typeof plan === 'string' && PURCHASABLE_PLANS.has(plan as SubscriptionPlan);
}

/**
 * Whether the buyer can switch plans from the billing page: a running paid
 * store subscription. Coupon trials and admin grants have no store subscription;
 * past-due and paused ones must fix the card first.
 */
export function canChangeStorePlan(
  subscription: { readonly storeSubscriptionId?: string; isActive(): boolean } | null | undefined
): boolean {
  return Boolean(subscription?.storeSubscriptionId) && subscription?.isActive() === true;
}

/**
 * The billing cycle a change request names. A missing one means "keep my
 * cycle"; anything else that is not monthly or annual is rejected, not guessed.
 */
export function parseBillingCycle(value: unknown, current: BillingCycle): BillingCycle | null {
  if (value === undefined || value === null) return current;
  return value === 'monthly' || value === 'annual' ? value : null;
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
