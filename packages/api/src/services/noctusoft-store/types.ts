/**
 * Store webhook event v1 types delivered to product apps
 * (noctusoft-relay docs/api/store/README.md, "Event types"). The app acts on a
 * subset; the rest are acknowledged.
 */
export type NoctusoftStoreEventType =
  | 'checkout.completed'
  | 'checkout.expired'
  | 'purchase.paid'
  | 'purchase.failed'
  | 'purchase.refunded'
  | 'purchase.refund_failed'
  | 'purchase.disputed'
  | 'purchase.dispute_won'
  | 'purchase.dispute_lost'
  | 'purchase.fraud_warning'
  | 'subscription.started'
  | 'subscription.renewed'
  | 'subscription.payment_failed'
  | 'subscription.action_required'
  | 'subscription.changed'
  | 'subscription.paused'
  | 'subscription.resumed'
  | 'subscription.canceled'
  | 'subscription.trial_ending'
  | 'subscription.renewal_upcoming'
  | 'store.ping';

/** Subscription states the relay reports (ledger-held, provider-neutral). */
export type NoctusoftStoreSubscriptionStatus =
  'active' | 'trialing' | 'past_due' | 'canceled' | 'incomplete' | 'paused';

/** Noctusoft event v1 delivery body (noctusoft-relay store/event-v1.js). */
export interface INoctusoftStoreWebhookEventV1 {
  readonly version: 1;
  readonly id: string;
  readonly type: NoctusoftStoreEventType;
  /** The store row alias that sold it, e.g. 'scholarmancy' or 'scholarmancy-uat'. */
  readonly store?: string | null;
  readonly product?: string | null;
  /** 'test' for test-mode money (pinned rows and sandbox), 'live' for real money. */
  readonly mode?: 'test' | 'live' | null;
  readonly occurredAt?: string | null;
  readonly buyer?: { readonly userId: string | null; readonly email: string | null } | null;
  readonly item?: {
    readonly code?: string | null;
    readonly key?: string | null;
    readonly kind?: string | null;
  } | null;
  readonly money?: {
    readonly amountCents?: number | null;
    readonly currency?: string | null;
    /** On purchase.refunded: this refund's amount, not a running total. */
    readonly refundedCents?: number | null;
  } | null;
  readonly refs?: {
    readonly orderId?: string | null;
    readonly paymentId?: string | null;
    readonly subscriptionId?: string | null;
    readonly refundId?: string | null;
    readonly disputeId?: string | null;
  } | null;
  readonly subscription?: {
    readonly planKey?: string | null;
    readonly status?: NoctusoftStoreSubscriptionStatus | string | null;
    readonly currentPeriodEnd?: string | null;
    readonly trialEnd?: string | null;
    readonly cancelScheduled?: boolean | null;
    readonly canceledAt?: string | null;
  } | null;
  readonly action?: { readonly reason?: string | null; readonly url?: string | null } | null;
}

export interface INoctusoftStoreCheckoutResult {
  readonly url: string;
  readonly sessionId: string;
}
