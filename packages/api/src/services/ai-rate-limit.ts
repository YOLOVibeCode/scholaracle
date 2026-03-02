import type { Db } from 'mongodb';
import { UserRepository, AiUsageRepository, type AiFeature } from '@scholaracle/database';

/** Plan identifier for rate limit lookup (matches User subscription.plan and Subscription plan). */
export type PlanForRateLimit = 'free' | 'starter' | 'premium' | 'family' | 'enterprise';

/** Per-plan, per-feature limits. -1 = unlimited. */
export const AI_RATE_LIMITS: Record<
  PlanForRateLimit,
  { scraper_generation: number; grade_risk: number; agenda: number }
> = {
  free: { scraper_generation: 0, grade_risk: 0, agenda: 0 },
  starter: { scraper_generation: 2, grade_risk: 1, agenda: 5 },
  premium: { scraper_generation: 5, grade_risk: 2, agenda: 20 },
  family: { scraper_generation: 10, grade_risk: 5, agenda: 50 },
  enterprise: { scraper_generation: -1, grade_risk: -1, agenda: -1 },
};

export interface ICheckAiRateLimitResult {
  readonly allowed: boolean;
  readonly limit: number;
  readonly used: number;
}

/**
 * Check if user can use an AI feature and record usage if allowed.
 * Returns { allowed, limit, used }. If allowed is false, do not call recordUsage.
 */
export async function checkAiRateLimit(
  database: Db,
  userId: string,
  feature: AiFeature
): Promise<ICheckAiRateLimitResult> {
  const userRepo = new UserRepository(database);
  const usageRepo = new AiUsageRepository(database);
  const user = await userRepo.findById(userId);
  const rawPlan = user?.subscription?.plan as PlanForRateLimit | undefined;
  const plan = rawPlan && rawPlan in AI_RATE_LIMITS ? rawPlan : ('free' as PlanForRateLimit);
  const limit = AI_RATE_LIMITS[plan][feature];
  if (limit < 0) {
    return { allowed: true, limit: -1, used: 0 };
  }
  const windowStart =
    feature === 'grade_risk' ? startOfDayUtc(new Date()) : startOfMonthUtc(new Date());
  const used = await usageRepo.countInWindow(userId, feature, windowStart);
  const allowed = used < limit;
  return { allowed, limit, used };
}

/** Record one AI usage for the user/feature (call after the AI call succeeds). */
export async function recordAiUsage(
  database: Db,
  userId: string,
  feature: AiFeature,
  at: Date = new Date()
): Promise<void> {
  const usageRepo = new AiUsageRepository(database);
  await usageRepo.record(userId, feature, at);
}

function startOfDayUtc(d: Date): Date {
  const u = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  return u;
}

function startOfMonthUtc(d: Date): Date {
  const u = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
  return u;
}
