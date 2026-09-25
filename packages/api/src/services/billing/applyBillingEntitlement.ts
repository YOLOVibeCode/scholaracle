import type { Db } from 'mongodb';
import {
  PaymentRepository,
  SubscriptionRepository,
  UserRepository,
  type BillingCycle,
  type SubscriptionPlan,
  type SubscriptionStatus,
} from '@scholaracle/database';

export interface IActivateSubscriptionParams {
  readonly userId: string;
  readonly plan: SubscriptionPlan;
  readonly billingCycle: BillingCycle;
  readonly amountCents: number;
  readonly currency: string;
  readonly paymentId?: string;
  readonly orderId?: string;
  readonly description: string;
}

export interface IBillingEntitlementDeps {
  readonly database: Db;
}

function addPeriodEnd(cycle: BillingCycle): Date {
  const periodEnd = new Date();
  if (cycle === 'annual') {
    periodEnd.setFullYear(periodEnd.getFullYear() + 1);
  } else {
    periodEnd.setMonth(periodEnd.getMonth() + 1);
  }
  return periodEnd;
}

/** Grants or renews paid subscription and records payment when applicable. */
export async function activateOrRenewSubscription(
  deps: IBillingEntitlementDeps,
  params: IActivateSubscriptionParams
): Promise<void> {
  const subscriptionRepo = new SubscriptionRepository(deps.database);
  const paymentRepo = new PaymentRepository(deps.database);
  const userRepo = new UserRepository(deps.database);

  if (params.paymentId) {
    const existing = await paymentRepo.findByStorePaymentId(params.paymentId);
    if (existing) return;
  }

  const periodEnd = addPeriodEnd(params.billingCycle);

  if (params.paymentId && params.amountCents > 0) {
    await paymentRepo.create({
      userId: params.userId,
      amount: params.amountCents,
      currency: params.currency,
      status: 'succeeded',
      paymentMethod: 'card',
      storePaymentId: params.paymentId,
      storeOrderId: params.orderId,
      description: params.description,
    });
  }

  const subscription = await subscriptionRepo.findByUserId(params.userId);
  const baseUpdate = {
    plan: params.plan,
    status: 'active' as SubscriptionStatus,
    billingCycle: params.billingCycle,
    currentPeriodStart: new Date(),
    currentPeriodEnd: periodEnd,
    lastPaymentDate: params.amountCents > 0 ? new Date() : undefined,
    lastPaymentAmount: params.amountCents > 0 ? params.amountCents : undefined,
  };

  if (subscription) {
    await subscriptionRepo.update(params.userId, baseUpdate);
  } else {
    await subscriptionRepo.create({
      userId: params.userId,
      plan: params.plan,
      status: 'active',
      currentPeriodStart: new Date(),
      currentPeriodEnd: periodEnd,
      billingCycle: params.billingCycle,
      lastPaymentDate: params.amountCents > 0 ? new Date() : undefined,
      lastPaymentAmount: params.amountCents > 0 ? params.amountCents : undefined,
    });
  }

  try {
    await userRepo.updateSubscription(params.userId, { plan: params.plan, status: 'active' });
  } catch {
    // Best-effort: subscription collection is authoritative
  }
}

/** Revokes or marks subscription inactive after cancel / failed payment. */
export async function revokeOrMarkPastDue(
  deps: IBillingEntitlementDeps,
  userId: string,
  status: 'cancelled' | 'past_due',
  plan: SubscriptionPlan = 'free'
): Promise<void> {
  const subscriptionRepo = new SubscriptionRepository(deps.database);
  const userRepo = new UserRepository(deps.database);

  const subscription = await subscriptionRepo.findByUserId(userId);
  if (subscription) {
    await subscriptionRepo.update(userId, {
      status,
      ...(status === 'cancelled' ? { cancelledAt: new Date(), cancelAtPeriodEnd: false } : {}),
    });
  }

  const userPlan = status === 'cancelled' ? plan : (subscription?.plan ?? plan);
  const userStatus = status === 'cancelled' ? 'cancelled' : 'past_due';
  try {
    await userRepo.updateSubscription(userId, { plan: userPlan, status: userStatus });
  } catch {
    // Best-effort
  }
}
