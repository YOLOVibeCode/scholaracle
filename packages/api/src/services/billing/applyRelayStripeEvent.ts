import type { Db } from 'mongodb';
import {
  PaymentRepository,
  SubscriptionRepository,
  type SubscriptionPlan,
  type SubscriptionStatus,
  type BillingCycle,
} from '@scholaracle/database';
import { mapRelayPlanToAppPlan } from './relayPlanMapping';

export interface IStripeEventEnvelope {
  readonly id: string;
  readonly type: string;
  readonly data?: {
    readonly object?: Record<string, unknown>;
  };
}

function readMetadata(obj: Record<string, unknown>): {
  userId?: string;
  plan?: string;
} {
  const meta = obj['metadata'];
  if (!meta || typeof meta !== 'object') {
    return {};
  }
  const m = meta as Record<string, unknown>;
  const userId = typeof m['user_id'] === 'string' ? m['user_id'] : undefined;
  const plan = typeof m['plan'] === 'string' ? m['plan'] : undefined;
  return { userId, plan };
}

function subscriptionStatusFromStripe(status: string | undefined): SubscriptionStatus {
  const s = (status ?? '').toLowerCase();
  if (s === 'canceled' || s === 'cancelled') return 'cancelled';
  if (s === 'past_due' || s === 'unpaid') return 'past_due';
  if (s === 'trialing') return 'trialing';
  return 'active';
}

/** Upsert local subscription/payment from a Stripe event delivered by relay. */
export async function applyRelayStripeEvent(
  database: Db,
  event: IStripeEventEnvelope
): Promise<void> {
  const subscriptionRepo = new SubscriptionRepository(database);
  const paymentRepo = new PaymentRepository(database);
  const obj = event.data?.object ?? {};
  const { userId, plan: metaPlan } = readMetadata(obj);
  if (!userId) {
    return;
  }

  const type = event.type;

  if (
    type === 'customer.subscription.created' ||
    type === 'customer.subscription.updated' ||
    type === 'checkout.session.completed'
  ) {
    const stripeSubId =
      typeof obj['subscription'] === 'string'
        ? obj['subscription']
        : typeof obj['id'] === 'string' && type.startsWith('customer.subscription')
          ? obj['id']
          : undefined;
    const customerId = typeof obj['customer'] === 'string' ? obj['customer'] : undefined;
    const status = subscriptionStatusFromStripe(
      typeof obj['status'] === 'string' ? obj['status'] : 'active'
    );
    const relayPlan = metaPlan ?? (typeof obj['plan'] === 'string' ? obj['plan'] : undefined);
    const appPlan: SubscriptionPlan = relayPlan
      ? mapRelayPlanToAppPlan(relayPlan)
      : ((await subscriptionRepo.findByUserId(userId))?.plan ?? 'starter');

    const periodStart =
      typeof obj['current_period_start'] === 'number'
        ? new Date(obj['current_period_start'] * 1000)
        : new Date();
    const periodEnd =
      typeof obj['current_period_end'] === 'number'
        ? new Date(obj['current_period_end'] * 1000)
        : new Date();

    const existing = await subscriptionRepo.findByUserId(userId);
    const billingCycle: BillingCycle = 'monthly';
    const updates = {
      plan: appPlan,
      status,
      billingCycle,
      currentPeriodStart: periodStart,
      currentPeriodEnd: periodEnd,
      stripeCustomerId: customerId,
      stripeSubscriptionId: stripeSubId,
    };

    if (existing) {
      await subscriptionRepo.update(userId, updates);
    } else {
      await subscriptionRepo.create({ userId, ...updates });
    }
    return;
  }

  if (type === 'customer.subscription.deleted') {
    await subscriptionRepo.update(userId, { status: 'cancelled' });
    return;
  }

  if (type === 'payment_intent.succeeded' || type === 'invoice.paid') {
    const paymentIntentId =
      typeof obj['payment_intent'] === 'string'
        ? obj['payment_intent']
        : typeof obj['id'] === 'string' && type === 'payment_intent.succeeded'
          ? obj['id']
          : undefined;
    if (paymentIntentId) {
      const existingPay = await paymentRepo.findByStripeId(paymentIntentId);
      if (existingPay) {
        return;
      }
    }
    const amount =
      typeof obj['amount_received'] === 'number'
        ? obj['amount_received']
        : typeof obj['amount_paid'] === 'number'
          ? obj['amount_paid']
          : typeof obj['amount'] === 'number'
            ? obj['amount']
            : 0;
    await paymentRepo.create({
      userId,
      amount,
      currency: (typeof obj['currency'] === 'string' ? obj['currency'] : 'usd').toLowerCase(),
      status: 'succeeded',
      paymentMethod: 'card',
      stripePaymentIntentId: paymentIntentId,
      stripeInvoiceId:
        typeof obj['id'] === 'string' && type === 'invoice.paid' ? obj['id'] : undefined,
      description: `Relay Stripe ${type}`,
    });
    return;
  }

  if (type === 'invoice.payment_failed') {
    await subscriptionRepo.update(userId, { status: 'past_due' });
    return;
  }

  if (type === 'charge.refunded') {
    const paymentIntentId =
      typeof obj['payment_intent'] === 'string' ? obj['payment_intent'] : undefined;
    if (paymentIntentId) {
      const pay = await paymentRepo.findByStripeId(paymentIntentId);
      if (pay?._id) {
        await paymentRepo.recordRefund(
          pay._id.toString(),
          Number(obj['amount_refunded'] ?? pay.amount),
          'relay-webhook',
          'charge.refunded'
        );
      }
    }
    return;
  }

  if (type === 'charge.dispute.created') {
    const paymentIntentId =
      typeof obj['payment_intent'] === 'string' ? obj['payment_intent'] : undefined;
    if (paymentIntentId) {
      const pay = await paymentRepo.findByStripeId(paymentIntentId);
      if (pay?._id) {
        await paymentRepo.updateStatus(pay._id.toString(), 'disputed');
      }
    }
    return;
  }

  if (type === 'charge.dispute.closed') {
    const paymentIntentId =
      typeof obj['payment_intent'] === 'string' ? obj['payment_intent'] : undefined;
    if (paymentIntentId) {
      const pay = await paymentRepo.findByStripeId(paymentIntentId);
      if (pay?._id) {
        const disputeStatus = typeof obj['status'] === 'string' ? obj['status'].toLowerCase() : '';
        const nextStatus = disputeStatus === 'lost' ? 'refunded' : 'succeeded';
        await paymentRepo.updateStatus(pay._id.toString(), nextStatus);
      }
    }
  }
}
