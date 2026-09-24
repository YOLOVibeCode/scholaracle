import type { SubscriptionPlan, SubscriptionStatus, BillingCycle } from '@scholaracle/database';
import type { IRelayEntitlementGrant } from './RelayBillingClient';
import { mapRelayPlanToAppPlan } from './relayPlanMapping';

export interface ISyncEntitlementsDeps {
  findSubscription(userId: string): Promise<{
    plan: SubscriptionPlan;
    status: SubscriptionStatus;
  } | null>;
  createSubscription(data: {
    userId: string;
    plan: SubscriptionPlan;
    status: SubscriptionStatus;
    billingCycle: BillingCycle;
    currentPeriodStart: Date;
    currentPeriodEnd: Date;
    stripeCustomerId?: string;
    stripeSubscriptionId?: string;
  }): Promise<void>;
  updateSubscription(
    userId: string,
    updates: {
      plan?: SubscriptionPlan;
      status?: SubscriptionStatus;
      billingCycle?: BillingCycle;
      currentPeriodStart?: Date;
      currentPeriodEnd?: Date;
      stripeCustomerId?: string;
      stripeSubscriptionId?: string;
    }
  ): Promise<void>;
}

function normalizeStatus(status: string | undefined): SubscriptionStatus {
  const s = (status ?? 'active').toLowerCase();
  if (s === 'canceled' || s === 'cancelled') return 'cancelled';
  if (s === 'past_due') return 'past_due';
  if (s === 'trialing') return 'trialing';
  if (s === 'expired') return 'expired';
  return 'active';
}

function pickGrant(grants: readonly IRelayEntitlementGrant[]): IRelayEntitlementGrant | null {
  if (grants.length === 0) return null;
  const active = grants.find((g) => (g.status ?? 'active').toLowerCase() === 'active');
  return active ?? grants[0] ?? null;
}

/** Apply relay entitlements ledger to local subscription row. */
export async function syncEntitlementsFromRelay(
  userId: string,
  grants: readonly IRelayEntitlementGrant[],
  deps: ISyncEntitlementsDeps
): Promise<{ plan: SubscriptionPlan; status: SubscriptionStatus } | null> {
  const grant = pickGrant(grants);
  if (!grant?.plan) {
    return null;
  }

  const plan = mapRelayPlanToAppPlan(grant.plan);
  const status = normalizeStatus(grant.status);
  const billingCycle: BillingCycle = grant.billingCycle === 'annual' ? 'annual' : 'monthly';
  const periodStart = grant.currentPeriodStart ? new Date(grant.currentPeriodStart) : new Date();
  const periodEnd = grant.currentPeriodEnd
    ? new Date(grant.currentPeriodEnd)
    : new Date(periodStart.getTime());

  if (!grant.currentPeriodEnd) {
    if (billingCycle === 'annual') {
      periodEnd.setFullYear(periodEnd.getFullYear() + 1);
    } else {
      periodEnd.setMonth(periodEnd.getMonth() + 1);
    }
  }

  const existing = await deps.findSubscription(userId);
  const payload = {
    plan,
    status,
    billingCycle,
    currentPeriodStart: periodStart,
    currentPeriodEnd: periodEnd,
    stripeCustomerId: grant.stripeCustomerId,
    stripeSubscriptionId: grant.stripeSubscriptionId,
  };

  if (existing) {
    await deps.updateSubscription(userId, payload);
  } else {
    await deps.createSubscription({ userId, ...payload });
  }

  return { plan, status };
}
