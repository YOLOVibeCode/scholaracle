import { PLAN_PRICING, type BillingCycle, type SubscriptionPlan } from '@scholaracle/database';
import type {
  INoctusoftStoreWebhookData,
  INoctusoftStoreWebhookEventV1,
} from '../noctusoft-store/types';
import { planFromStoreSku } from '../noctusoft-store/planStoreSkus';

export interface IResolvedWebhookBilling {
  readonly userId: string;
  readonly plan: SubscriptionPlan;
  readonly billingCycle: BillingCycle;
  readonly amountCents: number;
  readonly currency: string;
  readonly paymentId?: string;
  readonly orderId?: string;
}

const VALID_PLANS: SubscriptionPlan[] = ['free', 'starter', 'premium', 'family', 'enterprise'];

function parsePlan(value: string | undefined): SubscriptionPlan | null {
  if (!value) return null;
  const plan = value.toLowerCase() as SubscriptionPlan;
  return VALID_PLANS.includes(plan) ? plan : null;
}

function resolvePlanFromAmount(amountCents: number): {
  plan: SubscriptionPlan;
  cycle: BillingCycle;
} {
  for (const [plan, pricing] of Object.entries(PLAN_PRICING) as [
    SubscriptionPlan,
    { monthly: number; annual: number },
  ][]) {
    if (plan === 'free') continue;
    if (Math.round(pricing.monthly * 100) === amountCents) return { plan, cycle: 'monthly' };
    if (Math.round(pricing.annual * 100) === amountCents) return { plan, cycle: 'annual' };
  }
  return { plan: 'starter', cycle: 'monthly' };
}

/**
 * Normalizes a store webhook into subscription update fields. Event v1 carries
 * the buyer, item, money, and refs at the top level; the plan comes from the
 * item's store SKU. Pre-v1 bodies put everything under `data`.
 */
export function resolveWebhookBillingContext(
  event: INoctusoftStoreWebhookEventV1
): IResolvedWebhookBilling | null {
  const data: INoctusoftStoreWebhookData = event.data ?? {};
  const userId = event.buyer?.userId ?? data.userId ?? data.metadata?.['userId'];
  if (!userId) return null;

  const fromSku =
    planFromStoreSku(event.item?.code) ??
    planFromStoreSku(event.item?.key) ??
    planFromStoreSku(event.subscription?.planKey);
  const metaPlan = parsePlan(data.plan ?? data.metadata?.['plan']);
  const metaCycle =
    (data.billingCycle ?? data.metadata?.['billingCycle'])?.toLowerCase() === 'annual'
      ? 'annual'
      : 'monthly';

  const amountCents = event.money?.amountCents ?? data.amountCents ?? 0;
  const amountResolved = resolvePlanFromAmount(amountCents);
  const plan = fromSku?.plan ?? metaPlan ?? amountResolved.plan;
  const billingCycle = fromSku?.billingCycle ?? (metaPlan ? metaCycle : amountResolved.cycle);

  const currency = (event.money?.currency ?? data.currency ?? 'usd').toLowerCase();

  return {
    userId,
    plan,
    billingCycle,
    amountCents,
    currency,
    paymentId: event.refs?.paymentId ?? data.paymentId,
    orderId: event.refs?.orderId ?? data.orderId,
  };
}
