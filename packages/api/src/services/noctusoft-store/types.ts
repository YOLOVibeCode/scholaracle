import type { BillingCycle, SubscriptionPlan } from '@scholaracle/database';

/** Store webhook event v1 types delivered to product apps. */
export type NoctusoftStoreEventType =
  | 'purchase.paid'
  | 'subscription.started'
  | 'subscription.renewed'
  | 'subscription.canceled'
  | 'subscription.cancelled'
  | 'subscription.payment_failed';

/** Noctusoft event v1 delivery body (noctusoft-relay docs/api/store/README.md). */
export interface INoctusoftStoreWebhookEventV1 {
  readonly version: 1;
  readonly id: string;
  readonly type: NoctusoftStoreEventType;
  readonly store?: string;
  readonly occurredAt?: string;
  readonly buyer?: { readonly userId: string | null; readonly email: string | null } | null;
  readonly item?: {
    readonly code?: string | null;
    readonly key?: string | null;
    readonly kind?: string | null;
  } | null;
  readonly money?: {
    readonly amountCents?: number | null;
    readonly currency?: string | null;
  } | null;
  readonly refs?: {
    readonly orderId?: string | null;
    readonly paymentId?: string | null;
    readonly subscriptionId?: string | null;
  } | null;
  readonly subscription?: { readonly planKey?: string | null } | null;
  /** Pre-v1 bodies carried the fields here; still read until the store row is on v1. */
  readonly data?: INoctusoftStoreWebhookData;
}

export interface INoctusoftStoreWebhookData {
  readonly userId?: string;
  readonly plan?: SubscriptionPlan;
  readonly billingCycle?: BillingCycle;
  readonly amountCents?: number;
  readonly currency?: string;
  readonly paymentId?: string;
  readonly orderId?: string;
  readonly subscriptionId?: string;
  readonly metadata?: Readonly<Record<string, string>>;
}

export interface INoctusoftStoreCheckoutResult {
  readonly url: string;
  readonly sessionId: string;
}
