import type { BillingCycle, SubscriptionPlan } from '@scholaracle/database';

/** Store webhook event v1 types delivered to product apps. */
export type NoctusoftStoreEventType =
  | 'purchase.paid'
  | 'subscription.started'
  | 'subscription.renewed'
  | 'subscription.canceled'
  | 'subscription.cancelled'
  | 'subscription.payment_failed';

export interface INoctusoftStoreWebhookEventV1 {
  readonly version: 1;
  readonly id: string;
  readonly type: NoctusoftStoreEventType;
  readonly createdAt?: string;
  readonly data: INoctusoftStoreWebhookData;
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
