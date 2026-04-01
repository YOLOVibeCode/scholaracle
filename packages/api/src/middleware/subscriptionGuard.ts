import type { Request, Response, NextFunction } from 'express';
import type { Db } from 'mongodb';
import { SubscriptionRepository, type SubscriptionPlan } from '@scholaracle/database';
import type { IAuthenticatedRequest } from './auth';

const PLAN_TIER: Record<SubscriptionPlan, number> = {
  free: 0,
  starter: 1,
  premium: 2,
  family: 3,
  enterprise: 4,
};

export interface ISubscriptionGuardConfig {
  readonly database: Db;
}

/**
 * Factory that returns Express middleware enforcing a minimum subscription plan.
 * Reads from the subscriptions collection (authoritative source).
 */
// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types, @typescript-eslint/explicit-function-return-type
export function requirePlan(minPlan: SubscriptionPlan, config: ISubscriptionGuardConfig) {
  const subscriptionRepo = new SubscriptionRepository(config.database);

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const userId = (req as IAuthenticatedRequest).userId;
    if (!userId) {
      res.status(401).json({ success: false, error: 'Authentication required' });
      return;
    }

    const subscription = await subscriptionRepo.findByUserId(userId);
    const userPlan: SubscriptionPlan = subscription?.isActive() ? subscription.plan : 'free';

    const userTier = PLAN_TIER[userPlan] ?? 0;
    const requiredTier = PLAN_TIER[minPlan] ?? 0;

    if (userTier < requiredTier) {
      res.status(403).json({
        success: false,
        error: 'Upgrade required',
        requiredPlan: minPlan,
        currentPlan: userPlan,
        message: `This feature requires the ${minPlan} plan or higher. Please upgrade your subscription.`,
      });
      return;
    }

    next();
  };
}
