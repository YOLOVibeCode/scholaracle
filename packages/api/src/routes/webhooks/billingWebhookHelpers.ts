import { PLAN_PRICING, type BillingCycle, type SubscriptionPlan } from '@scholaracle/database';

export function extractUserIdFromNote(note: string | undefined): string | null {
  if (!note) return null;
  const match = note.match(/User ID:\s*([^\s|]+)/);
  return match ? match[1]! : null;
}

export function extractPlanFromNote(
  note: string | undefined
): { plan: SubscriptionPlan; cycle: BillingCycle } | null {
  if (!note) return null;
  const planMatch = note.match(/Plan:\s*(\w+)/);
  const cycleMatch = note.match(/Cycle:\s*(\w+)/);
  if (!planMatch) return null;
  const plan = planMatch[1]!.toLowerCase() as SubscriptionPlan;
  const validPlans: SubscriptionPlan[] = ['free', 'starter', 'premium', 'family', 'enterprise'];
  if (!validPlans.includes(plan)) return null;
  const cycle = (
    cycleMatch?.[1]?.toLowerCase() === 'annual' ? 'annual' : 'monthly'
  ) as BillingCycle;
  return { plan, cycle };
}

export function resolvePlanFromAmount(amountCents: number): {
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

export function parsePlanFromMetadata(
  metadata: Readonly<Record<string, string>> | undefined
): { plan: SubscriptionPlan; cycle: BillingCycle } | null {
  if (!metadata) return null;
  const planRaw = metadata['plan']?.toLowerCase();
  const cycleRaw = metadata['billingCycle']?.toLowerCase() ?? metadata['cycle']?.toLowerCase();
  const validPlans: SubscriptionPlan[] = ['free', 'starter', 'premium', 'family', 'enterprise'];
  if (!planRaw || !validPlans.includes(planRaw as SubscriptionPlan)) {
    return null;
  }
  const cycle: BillingCycle = cycleRaw === 'annual' ? 'annual' : 'monthly';
  return { plan: planRaw as SubscriptionPlan, cycle };
}

export function resolveUserId(
  metadata: Readonly<Record<string, string>> | undefined,
  note: string | undefined
): string {
  const fromMeta = metadata?.['userId'] ?? metadata?.['externalUserId'];
  if (fromMeta) return fromMeta;
  return extractUserIdFromNote(note) ?? 'unknown';
}
