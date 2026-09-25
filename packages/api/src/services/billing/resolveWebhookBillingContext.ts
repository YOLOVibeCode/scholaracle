import { PLAN_PRICING, type BillingCycle, type SubscriptionPlan } from '@scholaracle/database';
import type { INoctusoftStoreWebhookData } from '../noctusoft-store/types';

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

/** Normalizes store webhook payload into subscription update fields. */
export function resolveWebhookBillingContext(
  data: INoctusoftStoreWebhookData
): IResolvedWebhookBilling | null {
  const userId = data.userId ?? data.metadata?.['userId'];
  if (!userId) return null;

  const metaPlan = parsePlan(data.plan ?? data.metadata?.['plan']);
  const metaCycle =
    (data.billingCycle ?? data.metadata?.['billingCycle'])?.toLowerCase() === 'annual'
      ? 'annual'
      : 'monthly';

  const amountCents = data.amountCents ?? 0;
  const amountResolved = resolvePlanFromAmount(amountCents);
  const plan = metaPlan ?? amountResolved.plan;
  const billingCycle = metaPlan ? metaCycle : amountResolved.cycle;

  const currency = (data.currency ?? 'usd').toLowerCase();

  return {
    userId,
    plan,
    billingCycle,
    amountCents,
    currency,
    paymentId: data.paymentId,
    orderId: data.orderId,
  };
}
