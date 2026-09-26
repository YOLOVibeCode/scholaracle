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

export interface INoctusoftStoreClient {
  createCheckout(params: ICreateNoctusoftCheckoutParams): Promise<INoctusoftStoreCheckoutResult>;
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
  const mac = ['buy-link-v1', args.store, args.code, args.user, args.email, args.returnUrl, qty, exp, nonce]
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
 * Mints a signed store buy link for a plan SKU. The product site redirects;
 * the store hosts checkout.
 */
export class NoctusoftStoreClient implements INoctusoftStoreClient {
  private readonly _config: INoctusoftStoreConfig;

  public constructor(config: INoctusoftStoreConfig, _fetchImpl: typeof fetch = globalThis.fetch) {
    this._config = config;
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
}
