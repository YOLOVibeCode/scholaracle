import type { ObjectId } from 'mongodb';

/**
 * Subscription plan types.
 */
export type SubscriptionPlan = 'free' | 'starter' | 'premium' | 'family' | 'enterprise';

/**
 * Subscription status types.
 */
export type SubscriptionStatus = 'active' | 'past_due' | 'cancelled' | 'expired' | 'trialing';

/**
 * Billing cycle types.
 */
export type BillingCycle = 'monthly' | 'annual';

/**
 * Plan pricing configuration.
 */
export const PLAN_PRICING: Record<SubscriptionPlan, { monthly: number; annual: number }> = {
  free: { monthly: 0, annual: 0 },
  starter: { monthly: 9, annual: 90 },
  premium: { monthly: 19, annual: 190 },
  family: { monthly: 29, annual: 290 },
  enterprise: { monthly: 99, annual: 990 },
} as const;

/**
 * Plan feature limits.
 */
export const PLAN_FEATURES: Record<
  SubscriptionPlan,
  {
    maxStudents: number;
    emailNotifications: boolean;
    smsNotifications: boolean;
    prioritySupport: boolean;
    advancedAnalytics: boolean;
  }
> = {
  free: {
    maxStudents: 1,
    emailNotifications: true,
    smsNotifications: false,
    prioritySupport: false,
    advancedAnalytics: false,
  },
  starter: {
    maxStudents: 2,
    emailNotifications: true,
    smsNotifications: true,
    prioritySupport: false,
    advancedAnalytics: false,
  },
  premium: {
    maxStudents: 5,
    emailNotifications: true,
    smsNotifications: true,
    prioritySupport: true,
    advancedAnalytics: true,
  },
  family: {
    maxStudents: 10,
    emailNotifications: true,
    smsNotifications: true,
    prioritySupport: true,
    advancedAnalytics: true,
  },
  enterprise: {
    maxStudents: -1, // Unlimited
    emailNotifications: true,
    smsNotifications: true,
    prioritySupport: true,
    advancedAnalytics: true,
  },
} as const;

/**
 * Subscription event types.
 */
export type SubscriptionEventType =
  | 'created'
  | 'upgraded'
  | 'downgraded'
  | 'renewed'
  | 'cancelled'
  | 'expired'
  | 'reactivated'
  | 'trial_started'
  | 'trial_ended';

/**
 * Subscription event interface.
 */
export interface ISubscriptionEvent {
  readonly type: SubscriptionEventType;
  readonly fromPlan?: SubscriptionPlan;
  readonly toPlan?: SubscriptionPlan;
  readonly reason?: string;
  readonly performedBy?: string;
  readonly metadata?: Record<string, unknown>;
  readonly timestamp: Date;
}

/**
 * Subscription data interface.
 */
export interface ISubscriptionData {
  readonly userId: string;
  readonly plan: SubscriptionPlan;
  readonly status: SubscriptionStatus;
  readonly priceId?: string;

  // Billing Cycle
  readonly currentPeriodStart: Date;
  readonly currentPeriodEnd: Date;
  readonly billingCycle: BillingCycle;

  // Trial
  readonly trialStart?: Date;
  readonly trialEnd?: Date;

  // Cancellation
  readonly cancelAtPeriodEnd?: boolean;
  readonly cancelledAt?: Date;
  readonly cancellationReason?: string;

  // Payment
  readonly lastPaymentDate?: Date;
  readonly lastPaymentAmount?: number;
  readonly nextPaymentDate?: Date;
  readonly nextPaymentAmount?: number;

  // Stripe Integration (deprecated - use Square)
  readonly stripeSubscriptionId?: string;
  readonly stripeCustomerId?: string;

  // Square Integration
  readonly squareSubscriptionId?: string;
  readonly squareCustomerId?: string;

  // History
  readonly events?: readonly ISubscriptionEvent[];

  readonly createdAt?: Date;
  readonly updatedAt?: Date;
}

/**
 * Subscription model for customer billing.
 */
export class Subscription {
  public readonly _id?: ObjectId;
  public readonly userId: string;
  public readonly plan: SubscriptionPlan;
  public readonly status: SubscriptionStatus;
  public readonly priceId?: string;
  public readonly currentPeriodStart: Date;
  public readonly currentPeriodEnd: Date;
  public readonly billingCycle: BillingCycle;
  public readonly trialStart?: Date;
  public readonly trialEnd?: Date;
  public readonly cancelAtPeriodEnd: boolean;
  public readonly cancelledAt?: Date;
  public readonly cancellationReason?: string;
  public readonly lastPaymentDate?: Date;
  public readonly lastPaymentAmount?: number;
  public readonly nextPaymentDate?: Date;
  public readonly nextPaymentAmount?: number;
  public readonly stripeSubscriptionId?: string;
  public readonly stripeCustomerId?: string;
  public readonly squareSubscriptionId?: string;
  public readonly squareCustomerId?: string;
  public readonly events: readonly ISubscriptionEvent[];
  public readonly createdAt: Date;
  public readonly updatedAt: Date;

  constructor(data: ISubscriptionData, id?: ObjectId) {
    this._id = id;
    this.userId = data.userId;
    this.plan = data.plan;
    this.status = data.status;
    this.priceId = data.priceId;
    this.currentPeriodStart = data.currentPeriodStart;
    this.currentPeriodEnd = data.currentPeriodEnd;
    this.billingCycle = data.billingCycle;
    this.trialStart = data.trialStart;
    this.trialEnd = data.trialEnd;
    this.cancelAtPeriodEnd = data.cancelAtPeriodEnd ?? false;
    this.cancelledAt = data.cancelledAt;
    this.cancellationReason = data.cancellationReason;
    this.lastPaymentDate = data.lastPaymentDate;
    this.lastPaymentAmount = data.lastPaymentAmount;
    this.nextPaymentDate = data.nextPaymentDate;
    this.nextPaymentAmount = data.nextPaymentAmount;
    this.stripeSubscriptionId = data.stripeSubscriptionId;
    this.stripeCustomerId = data.stripeCustomerId;
    this.squareSubscriptionId = data.squareSubscriptionId;
    this.squareCustomerId = data.squareCustomerId;
    this.events = data.events ?? [];
    this.createdAt = data.createdAt ?? new Date();
    this.updatedAt = data.updatedAt ?? new Date();
  }

  /**
   * Check if subscription is active.
   */
  public isActive(): boolean {
    return this.status === 'active' || this.status === 'trialing';
  }

  /**
   * Check if subscription is in trial.
   */
  public isTrialing(): boolean {
    return this.status === 'trialing' && !!this.trialEnd && this.trialEnd > new Date();
  }

  /**
   * Get days until renewal.
   */
  public getDaysUntilRenewal(): number {
    const now = new Date();
    const diff = this.currentPeriodEnd.getTime() - now.getTime();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  }

  /**
   * Get monthly recurring revenue contribution.
   */
  public getMRR(): number {
    if (this.status !== 'active') return 0;
    const pricing = PLAN_PRICING[this.plan];
    return this.billingCycle === 'annual' ? pricing.annual / 12 : pricing.monthly;
  }

  /**
   * Get plan features.
   */
  public getFeatures(): (typeof PLAN_FEATURES)[SubscriptionPlan] {
    return PLAN_FEATURES[this.plan];
  }
}
