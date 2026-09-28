import { ExternalServiceError } from '@scholaracle/contracts';
import type { BillingCycle, SubscriptionPlan } from '@scholaracle/database';
import { createHmac, randomBytes } from 'node:crypto';
import type { INoctusoftStoreConfig } from './resolveNoctusoftStoreConfig';
import { resolveStoreSku } from './planStoreSkus';
import type { INoctusoftStoreCheckoutResult } from './types';

export interface ICreateNoctusoftCheckoutParams {
  readonly userId: string;
  readonly email: string;
  readonly plan: SubscriptionPlan;
  readonly billingCycle: BillingCycle;
  readonly successUrl: string;
  readonly cancelUrl: string;
}

export interface IStoreCancelResult {
  readonly cancelAtPeriodEnd: boolean;
  readonly currentPeriodEnd: string | null;
}

export interface IStoreRefundParams {
  readonly amountCents?: number;
  readonly reason?: string;
  readonly idempotencyKey: string;
}

export interface IStoreRefundResult {
  readonly refundRef: string;
  readonly status: string;
  readonly amountCents: number;
}

export interface INoctusoftStoreClient {
  createCheckout(params: ICreateNoctusoftCheckoutParams): Promise<INoctusoftStoreCheckoutResult>;
  /** Cancels at the end of the paid period; the store sends subscription.canceled then. */
  cancelSubscription(subscriptionRef: string): Promise<IStoreCancelResult>;
  /** The store-hosted page where the buyer replaces their card. */
  updatePaymentMethod(subscriptionRef: string, returnUrl: string): Promise<string>;
  refundPayment(paymentRef: string, params: IStoreRefundParams): Promise<IStoreRefundResult>;
}

function signBuyLink(args: {
  secret: string;
  store: string;
  code: string;
  user: string;
  email: string;
  returnUrl: string;
  baseUrl: string;
}): { url: string; sessionId: string } {
  const exp = Math.floor(Date.now() / 1000) + 86400;
  const nonce = randomBytes(12).toString('hex');
  const qty = 1;
  const mac = [
    'buy-link-v1',
    args.store,
    args.code,
    args.user,
    args.email,
    args.returnUrl,
    qty,
    exp,
    nonce,
  ]
    .map((p) => (p == null ? '' : String(p)))
    .join('|');
  const sig = createHmac('sha256', args.secret).update(mac).digest('hex');
  const q = new URLSearchParams({
    user: args.user,
    email: args.email,
    return: args.returnUrl,
    qty: String(qty),
    exp: String(exp),
    nonce,
    sig,
  });
  const base = args.baseUrl.replace(/\/$/, '');
  return {
    url: `${base}/buy/${encodeURIComponent(args.store)}/${encodeURIComponent(args.code)}?${q}`,
    sessionId: `buy:${nonce}`,
  };
}

/**
 * Talks to the Noctusoft store (noctusoft-relay docs/api/store/README.md).
 * Checkout is a signed buy link; subscription and refund calls use the
 * product's relay key. Every ref is the store's opaque ref.
 */
export class NoctusoftStoreClient implements INoctusoftStoreClient {
  private readonly _config: INoctusoftStoreConfig;
  private readonly _fetch: typeof fetch;

  public constructor(config: INoctusoftStoreConfig, fetchImpl: typeof fetch = globalThis.fetch) {
    this._config = config;
    this._fetch = fetchImpl;
  }

  public async createCheckout(
    params: ICreateNoctusoftCheckoutParams
  ): Promise<INoctusoftStoreCheckoutResult> {
    const sku = resolveStoreSku(params.plan, params.billingCycle);
    if (!this._config.webhookSecret) {
      throw new ExternalServiceError('RELAY_WEBHOOK_SECRET is required to mint store buy links');
    }
    try {
      const link = signBuyLink({
        secret: this._config.webhookSecret,
        store: this._config.storeAlias,
        code: sku,
        user: params.userId,
        email: params.email,
        returnUrl: params.successUrl,
        baseUrl: this._config.baseUrl,
      });
      return { url: link.url, sessionId: link.sessionId };
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      throw new ExternalServiceError(`Store checkout failed: ${detail}`);
    }
  }

  public async cancelSubscription(subscriptionRef: string): Promise<IStoreCancelResult> {
    const body = await this._post<{
      cancelAtPeriodEnd?: boolean;
      currentPeriodEnd?: string | null;
    }>(`/subscriptions/${encodeURIComponent(subscriptionRef)}/cancel`, { atPeriodEnd: true });
    return {
      cancelAtPeriodEnd: body.cancelAtPeriodEnd === true,
      currentPeriodEnd: body.currentPeriodEnd ?? null,
    };
  }

  public async updatePaymentMethod(subscriptionRef: string, returnUrl: string): Promise<string> {
    const body = await this._post<{ step?: { kind?: string; url?: string } }>(
      `/subscriptions/${encodeURIComponent(subscriptionRef)}/update-payment-method`,
      { returnUrl }
    );
    if (body.step?.kind !== 'redirect' || !body.step.url) {
      throw new ExternalServiceError('Store did not return a card update page');
    }
    return body.step.url;
  }

  public async refundPayment(
    paymentRef: string,
    params: IStoreRefundParams
  ): Promise<IStoreRefundResult> {
    const body = await this._post<{ refundRef: string; status: string; amountCents: number }>(
      `/payments/${encodeURIComponent(paymentRef)}/refund`,
      {
        ...(params.amountCents !== undefined ? { amountCents: params.amountCents } : {}),
        ...(params.reason !== undefined ? { reason: params.reason } : {}),
        idempotencyKey: params.idempotencyKey,
      }
    );
    return { refundRef: body.refundRef, status: body.status, amountCents: body.amountCents };
  }

  private async _post<T>(path: string, payload: Record<string, unknown>): Promise<T> {
    const url = `${this._config.baseUrl.replace(/\/$/, '')}${path}`;
    let res: Response;
    try {
      res = await this._fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Api-Key': this._config.apiKey,
          'X-Test-Store': this._config.storeAlias,
          'X-Store-Mode': this._config.storeMode,
        },
        body: JSON.stringify(payload),
      });
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      throw new ExternalServiceError(`Store request failed: ${detail}`);
    }
    const text = await res.text();
    let parsed: unknown = null;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = null;
    }
    if (!res.ok) {
      const err = (parsed ?? {}) as { error?: string; code?: string };
      throw new ExternalServiceError(
        `Store ${res.status} ${err.code ?? 'ERROR'}: ${err.error ?? 'request failed'}`,
        { status: res.status, code: err.code ?? null }
      );
    }
    return (parsed ?? {}) as T;
  }
}
