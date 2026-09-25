import { ExternalServiceError } from '@scholaracle/contracts';
import type { BillingCycle, SubscriptionPlan } from '@scholaracle/database';
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

/**
 * HTTP client for Noctusoft store checkout (`POST /checkout`).
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
    const response = await this._fetch(`${this._config.baseUrl}/checkout`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': this._config.apiKey,
        'X-Test-Store': this._config.storeAlias,
        'X-Store-Mode': this._config.storeMode,
      },
      body: JSON.stringify({
        sku,
        quantity: 1,
        customer: {
          email: params.email,
          externalId: params.userId,
        },
        successUrl: params.successUrl,
        cancelUrl: params.cancelUrl,
        metadata: {
          userId: params.userId,
          plan: params.plan,
          billingCycle: params.billingCycle,
        },
      }),
    });

    const payload = (await response.json().catch(() => ({}))) as {
      url?: string;
      checkoutUrl?: string;
      sessionId?: string;
      orderId?: string;
      error?: string;
      message?: string;
    };

    if (!response.ok) {
      const detail = payload.message ?? payload.error ?? response.statusText;
      throw new ExternalServiceError(`Store checkout failed: ${detail}`);
    }

    const url = payload.url ?? payload.checkoutUrl;
    const sessionId = payload.sessionId ?? payload.orderId;
    if (!url || !sessionId) {
      throw new ExternalServiceError('Store checkout returned an incomplete response');
    }

    return { url, sessionId };
  }
}
