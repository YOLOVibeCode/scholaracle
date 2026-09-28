import type { BillingCycle, SubscriptionPlan } from '@scholaracle/database';
import type { INoctusoftStoreWebhookEventV1 } from '../noctusoft-store/types';
import { planFromStoreSku } from '../noctusoft-store/planStoreSkus';

export interface IResolvedWebhookBilling {
  readonly userId: string;
  /** Null when the item is not one of the plans in `planStoreSkus`. */
  readonly plan: SubscriptionPlan | null;
  readonly billingCycle: BillingCycle | null;
  readonly amountCents: number;
  readonly currency: string;
  readonly paymentId?: string;
  readonly orderId?: string;
  readonly subscriptionId?: string;
}

/**
 * Reads the buyer, item, money, and refs from a Noctusoft event v1 body. The
 * plan comes only from the item's store SKU, so an event for any other item
 * names no plan.
 */
export function resolveWebhookBillingContext(
  event: INoctusoftStoreWebhookEventV1
): IResolvedWebhookBilling | null {
  const userId = event.buyer?.userId;
  if (!userId) return null;

  const fromSku =
    planFromStoreSku(event.item?.code) ??
    planFromStoreSku(event.item?.key) ??
    planFromStoreSku(event.subscription?.planKey);

  return {
    userId,
    plan: fromSku?.plan ?? null,
    billingCycle: fromSku?.billingCycle ?? null,
    amountCents: event.money?.amountCents ?? 0,
    currency: (event.money?.currency ?? 'usd').toLowerCase(),
    paymentId: event.refs?.paymentId ?? undefined,
    orderId: event.refs?.orderId ?? undefined,
    subscriptionId: event.refs?.subscriptionId ?? undefined,
  };
}
