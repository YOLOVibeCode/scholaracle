import type { BillingCycle, SubscriptionPlan } from '@scholaracle/database';

const SKU_PREFIX = 'NOCTU-SCHOLARMANCY';

const PLAN_SKUS: Record<Exclude<SubscriptionPlan, 'free'>, { monthly: string; annual: string }> = {
  starter: {
    monthly: `${SKU_PREFIX}-STARTER-MONTHLY`,
    annual: `${SKU_PREFIX}-STARTER-ANNUAL`,
  },
  premium: {
    monthly: `${SKU_PREFIX}-PREMIUM-MONTHLY`,
    annual: `${SKU_PREFIX}-PREMIUM-ANNUAL`,
  },
  family: {
    monthly: `${SKU_PREFIX}-FAMILY-MONTHLY`,
    annual: `${SKU_PREFIX}-FAMILY-ANNUAL`,
  },
  enterprise: {
    monthly: `${SKU_PREFIX}-ENTERPRISE-MONTHLY`,
    annual: `${SKU_PREFIX}-ENTERPRISE-ANNUAL`,
  },
};

/** Maps Scholarmancy plan + cycle to Noctusoft store SKU codes. */
export function resolveStoreSku(plan: SubscriptionPlan, billingCycle: BillingCycle): string {
  if (plan === 'free') {
    throw new Error('Free plan has no store SKU');
  }
  const entry = PLAN_SKUS[plan];
  return billingCycle === 'annual' ? entry.annual : entry.monthly;
}
