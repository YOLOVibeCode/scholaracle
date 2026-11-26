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
  /** 'trialing' when the store reports a free trial; defaults to 'active'. */
  readonly status?: 'active' | 'trialing';
  /** The store's paid-through date. Falls back to one billing cycle from now. */
  readonly currentPeriodEnd?: Date;
  readonly trialEnd?: Date;
  /**
   * The store never forwards a subscription's first invoice, so its charge
   * arrives on subscription.started with no payment ref. The webhook's event-id
   * dedupe is what keeps it from being recorded twice.
   */
  readonly recordChargeWithoutPaymentRef?: boolean;
  readonly description: string;
  readonly receiptUrl?: string;
}

export interface IBillingEntitlementDeps {
  readonly database: Db;
}

/** Result of an activation attempt, so the webhook can log what it did. */
export type ActivationOutcome = 'activated' | 'duplicate-payment' | 'revival-refused';

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
): Promise<ActivationOutcome> {
  const subscriptionRepo = new SubscriptionRepository(deps.database);
  const paymentRepo = new PaymentRepository(deps.database);
  const userRepo = new UserRepository(deps.database);

  // A payment already on record (a replay, or a retry after a failed write) is not
  // recorded twice, but the plan grant below still runs: the earlier attempt may
  // have failed between the two writes.
  const isPaymentRecorded = params.paymentId
    ? (await paymentRepo.findByStorePaymentId(params.paymentId)) !== null
    : false;

  const subscription = await subscriptionRepo.findByUserId(params.userId);

  // A store subscription that was already cancelled here is never revived by a
  // late or replayed start event; a new purchase arrives with a new ref.
  if (
    subscription &&
    subscription.status === 'cancelled' &&
    params.storeSubscriptionId &&
    subscription.storeSubscriptionId === params.storeSubscriptionId
  ) {
    return 'revival-refused';
  }

  const status: SubscriptionStatus = params.status ?? 'active';
  const periodEnd = params.currentPeriodEnd ?? addPeriodEnd(params.billingCycle);

  if (
    !isPaymentRecorded &&
    (params.paymentId || params.recordChargeWithoutPaymentRef) &&
    params.amountCents > 0
  ) {
    await paymentRepo.create({
      userId: params.userId,
      amount: params.amountCents,
      currency: params.currency,
      status: 'succeeded',
      paymentMethod: 'card',
      ...(params.paymentId ? { storePaymentId: params.paymentId } : {}),
      ...(params.orderId ? { storeOrderId: params.orderId } : {}),
      ...(params.storeSubscriptionId ? { storeSubscriptionId: params.storeSubscriptionId } : {}),
      ...(params.receiptUrl ? { receiptUrl: params.receiptUrl } : {}),
      description: params.description,
    });
  } else if (params.paymentId && params.receiptUrl) {
    await paymentRepo.setReceiptUrlIfMissing(params.paymentId, params.receiptUrl);
  }

  const baseUpdate = {
    plan: params.plan,
    status,
    billingCycle: params.billingCycle,
    currentPeriodStart: new Date(),
    currentPeriodEnd: periodEnd,
    ...(params.trialEnd ? { trialEnd: params.trialEnd } : {}),
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
      status,
      currentPeriodStart: new Date(),
      currentPeriodEnd: periodEnd,
      billingCycle: params.billingCycle,
      ...(params.trialEnd ? { trialStart: new Date(), trialEnd: params.trialEnd } : {}),
      lastPaymentDate: params.amountCents > 0 ? new Date() : undefined,
      lastPaymentAmount: params.amountCents > 0 ? params.amountCents : undefined,
      ...(params.storeSubscriptionId ? { storeSubscriptionId: params.storeSubscriptionId } : {}),
    });
  }

  try {
    await userRepo.updateSubscription(params.userId, { plan: params.plan, status });
  } catch {
    // Best-effort: subscription collection is authoritative
  }
  return isPaymentRecorded ? 'duplicate-payment' : 'activated';
}

/**
 * Revokes or marks the subscription inactive after a cancel, a failed payment,
 * a pause or a lost dispute. When the store cancels a subscription this app has
 * no row for yet (events out of order), a cancelled row keyed by the store ref
 * is written, so the late start event cannot grant the plan.
 */
export async function revokeOrMarkPastDue(
  deps: IBillingEntitlementDeps,
  userId: string,
  status: 'cancelled' | 'past_due' | 'paused',
  plan: SubscriptionPlan = 'free',
  storeSubscriptionId?: string
): Promise<void> {
  const subscriptionRepo = new SubscriptionRepository(deps.database);
  const userRepo = new UserRepository(deps.database);

  const subscription = await subscriptionRepo.findByUserId(userId);
  if (subscription) {
    // A cancel for an older store subscription must not end a newer one.
    if (
      status === 'cancelled' &&
      storeSubscriptionId &&
      subscription.storeSubscriptionId &&
      subscription.storeSubscriptionId !== storeSubscriptionId &&
      subscription.status !== 'cancelled'
    ) {
      return;
    }
    await subscriptionRepo.update(userId, {
      status,
      ...(status === 'cancelled' ? { cancelledAt: new Date(), cancelAtPeriodEnd: false } : {}),
    });
  } else if (status === 'cancelled' && storeSubscriptionId) {
    const now = new Date();
    await subscriptionRepo.create({
      userId,
      plan: 'free',
      status: 'cancelled',
      currentPeriodStart: now,
      currentPeriodEnd: now,
      billingCycle: 'monthly',
      cancelledAt: now,
      storeSubscriptionId,
    });
  }

  const userPlan = status === 'past_due' ? (subscription?.plan ?? plan) : plan;
  try {
    await userRepo.updateSubscription(userId, { plan: userPlan, status });
  } catch {
    // Best-effort
  }
}

/**
 * Mirrors the store's view of a subscription that is still running: status,
 * paid-through date, trial end and a scheduled cancel. Only touches the row for
 * the same store subscription.
 */
export async function syncStoreSubscriptionState(
  deps: IBillingEntitlementDeps,
  userId: string,
  state: {
    readonly storeSubscriptionId?: string;
    readonly status?: 'active' | 'trialing' | 'past_due' | 'paused';
    readonly currentPeriodEnd?: Date;
    readonly trialEnd?: Date;
    readonly cancelAtPeriodEnd?: boolean;
    readonly plan?: SubscriptionPlan;
    readonly billingCycle?: BillingCycle;
  }
): Promise<boolean> {
  const subscriptionRepo = new SubscriptionRepository(deps.database);
  const subscription = await subscriptionRepo.findByUserId(userId);
  if (!subscription) return false;
  if (
    state.storeSubscriptionId &&
    subscription.storeSubscriptionId &&
    subscription.storeSubscriptionId !== state.storeSubscriptionId
  ) {
    return false;
  }
  if (subscription.status === 'cancelled') return false;
  await subscriptionRepo.update(userId, {
    ...(state.status ? { status: state.status } : {}),
    ...(state.currentPeriodEnd ? { currentPeriodEnd: state.currentPeriodEnd } : {}),
    ...(state.trialEnd ? { trialEnd: state.trialEnd } : {}),
    ...(typeof state.cancelAtPeriodEnd === 'boolean'
      ? { cancelAtPeriodEnd: state.cancelAtPeriodEnd }
      : {}),
    ...(state.plan ? { plan: state.plan } : {}),
    ...(state.billingCycle ? { billingCycle: state.billingCycle } : {}),
  });
  if (state.status || state.plan) {
    try {
      await new UserRepository(deps.database).updateSubscription(userId, {
        plan: state.plan ?? subscription.plan,
        status: state.status ?? subscription.status,
      });
    } catch {
      // Best-effort
    }
  }
  return true;
}

/**
 * Applies a store refund to the payment it names. A refund the admin route
 * already recorded carries the same refund ref and is skipped. Returns false
 * when no payment matches, so the caller can report it.
 */
export async function recordStoreRefund(
  deps: IBillingEntitlementDeps,
  refund: {
    readonly paymentId: string | null;
    readonly refundId: string | null;
    readonly refundedCents: number;
  }
): Promise<boolean> {
  if (!refund.paymentId || refund.refundedCents <= 0) return false;
  const paymentRepo = new PaymentRepository(deps.database);
  const payment = await paymentRepo.findByStorePaymentId(refund.paymentId);
  if (!payment?._id) return false;
  if (refund.refundId && payment.refundId === refund.refundId) return true;
  await paymentRepo.recordRefund(
    payment._id.toString(),
    refund.refundedCents,
    'noctusoft-store',
    'Refunded in the store',
    refund.refundId ?? undefined
  );
  return true;
}

/** Mirrors a cancel scheduled (or withdrawn) at the store onto the local subscription. */
export async function syncCancelAtPeriodEnd(
  deps: IBillingEntitlementDeps,
  userId: string,
  cancelAtPeriodEnd: boolean
): Promise<void> {
  await syncStoreSubscriptionState(deps, userId, { cancelAtPeriodEnd });
}
