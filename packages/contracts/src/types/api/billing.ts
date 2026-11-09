/**
 * GET /api/billing/subscription wire shape.
 * Dates are ISO strings on the wire (JSON), unlike the database model.
 */

export type SubscriptionPlanWire = 'free' | 'starter' | 'premium' | 'family' | 'enterprise';

export type SubscriptionStatusWire =
  'active' | 'past_due' | 'cancelled' | 'expired' | 'trialing' | 'paused';

export interface ISubscriptionWire {
  readonly plan: SubscriptionPlanWire;
  readonly status: SubscriptionStatusWire;
  /** The plan whose limits apply now (free once cancelled, paused or lapsed). */
  readonly effectivePlan: SubscriptionPlanWire;
  /** Student cap of effectivePlan; -1 means unlimited. Absent on older servers. */
  readonly maxStudents?: number;
  readonly currentPeriodStart?: string;
  readonly currentPeriodEnd?: string;
  readonly billingCycle?: 'monthly' | 'annual';
  readonly cancelAtPeriodEnd?: boolean;
  readonly trialEnd?: string;
}

export interface ISubscriptionResponse {
  readonly success: boolean;
  readonly subscription: ISubscriptionWire;
}
