import type { SubscriptionPlan } from '@scholaracle/database';

export type RelayCheckoutPlan = 'starter' | 'solo' | 'pro' | 'team' | 'business' | 'single-org';

export interface IRelaySku {
  readonly sku: string;
  readonly plan?: string;
  readonly interval?: string;
}

const APP_TO_RELAY: Record<Exclude<SubscriptionPlan, 'free'>, RelayCheckoutPlan> = {
  starter: 'starter',
  premium: 'solo',
  family: 'team',
  enterprise: 'business',
};

const RELAY_TO_APP: Record<RelayCheckoutPlan, SubscriptionPlan> = {
  starter: 'starter',
  solo: 'premium',
  pro: 'premium',
  team: 'family',
  business: 'enterprise',
  'single-org': 'enterprise',
};

/** Map dashboard plan slug to relay checkout plan id. */
export function mapAppPlanToRelayCheckoutPlan(plan: SubscriptionPlan): RelayCheckoutPlan {
  if (plan === 'free') {
    return 'starter';
  }
  return APP_TO_RELAY[plan];
}

/** Map relay plan metadata back to local subscription plan. */
export function mapRelayPlanToAppPlan(relayPlan: string): SubscriptionPlan {
  const normalized = relayPlan.toLowerCase() as RelayCheckoutPlan;
  if (normalized in RELAY_TO_APP) {
    return RELAY_TO_APP[normalized];
  }
  const asApp = relayPlan.toLowerCase() as SubscriptionPlan;
  if (['starter', 'premium', 'family', 'enterprise'].includes(asApp)) {
    return asApp;
  }
  return 'starter';
}

/** Pick annual SKU for an app plan from relay catalog (never sends price). */
export function resolveAnnualOrderSku(plan: SubscriptionPlan, skus: readonly IRelaySku[]): string {
  const relayPlan = mapAppPlanToRelayCheckoutPlan(plan);
  const byPlan = skus.find(
    (s) =>
      s.plan?.toLowerCase() === relayPlan &&
      (s.interval?.toLowerCase() === 'annual' || s.interval?.toLowerCase() === 'year')
  );
  if (byPlan) {
    return byPlan.sku;
  }
  const bySkuName = skus.find((s) => {
    const hay = s.sku.toLowerCase();
    return hay.includes(relayPlan) && (hay.includes('annual') || hay.includes('year'));
  });
  if (!bySkuName) {
    throw new Error(`No annual SKU found for plan ${plan}`);
  }
  return bySkuName.sku;
}
