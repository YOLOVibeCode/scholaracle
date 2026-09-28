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
  readonly storeSubscriptionId?: string;
  /**
   * The store never forwards a subscription's first invoice, so its charge
   * arrives on subscription.started with no payment ref. The webhook's event-id
   * dedupe is what keeps it from being recorded twice.
   */
  readonly recordChargeWithoutPaymentRef?: boolean;
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

  if ((params.paymentId || params.recordChargeWithoutPaymentRef) && params.amountCents > 0) {
    await paymentRepo.create({
      userId: params.userId,
      amount: params.amountCents,
      currency: params.currency,
      status: 'succeeded',
      paymentMethod: 'card',
      ...(params.paymentId ? { storePaymentId: params.paymentId } : {}),
      ...(params.orderId ? { storeOrderId: params.orderId } : {}),
      ...(params.storeSubscriptionId ? { storeSubscriptionId: params.storeSubscriptionId } : {}),
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
    ...(params.storeSubscriptionId ? { storeSubscriptionId: params.storeSubscriptionId } : {}),
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
      ...(params.storeSubscriptionId ? { storeSubscriptionId: params.storeSubscriptionId } : {}),
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

/**
 * Applies a store refund to the payment it names. A refund the admin route
 * already recorded carries the same refund ref and is skipped.
 */
export async function recordStoreRefund(
  deps: IBillingEntitlementDeps,
  refund: {
    readonly paymentId: string | null;
    readonly refundId: string | null;
    readonly refundedCents: number;
  }
): Promise<void> {
  if (!refund.paymentId || refund.refundedCents <= 0) return;
  const paymentRepo = new PaymentRepository(deps.database);
  const payment = await paymentRepo.findByStorePaymentId(refund.paymentId);
  if (!payment?._id) return;
  if (refund.refundId && payment.refundId === refund.refundId) return;
  await paymentRepo.recordRefund(
    payment._id.toString(),
    refund.refundedCents,
    'noctusoft-store',
    'Refunded in the store',
    refund.refundId ?? undefined
  );
}

/** Mirrors a cancel scheduled (or withdrawn) at the store onto the local subscription. */
export async function syncCancelAtPeriodEnd(
  deps: IBillingEntitlementDeps,
  userId: string,
  cancelAtPeriodEnd: boolean
): Promise<void> {
  const subscriptionRepo = new SubscriptionRepository(deps.database);
  const subscription = await subscriptionRepo.findByUserId(userId);
  if (subscription) {
    await subscriptionRepo.update(userId, { cancelAtPeriodEnd });
  }
}
