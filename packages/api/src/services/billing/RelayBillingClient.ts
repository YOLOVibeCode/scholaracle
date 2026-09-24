import type { IRelayBillingConfig } from './resolveRelayBillingConfig';
import { mapAppPlanToRelayCheckoutPlan } from './relayPlanMapping';
import type { SubscriptionPlan } from '@scholaracle/database';
import type { IRelaySku } from './relayPlanMapping';

export interface ICheckoutResult {
  readonly url: string;
  readonly sessionId: string;
}

export interface IOrderResult {
  readonly url: string;
  readonly sessionId: string;
  readonly amountCents: number;
}

export interface IRelayEntitlementGrant {
  readonly plan?: string;
  readonly status?: string;
  readonly billingCycle?: 'monthly' | 'annual';
  readonly stripeCustomerId?: string;
  readonly stripeSubscriptionId?: string;
  readonly currentPeriodStart?: string;
  readonly currentPeriodEnd?: string;
}

export interface IRelayEntitlementsResponse {
  readonly entitlements?: readonly IRelayEntitlementGrant[];
  readonly grants?: readonly IRelayEntitlementGrant[];
}

export class RelayBillingClient {
  constructor(private readonly _config: IRelayBillingConfig) {}

  private _headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this._config.apiKey}`,
      'Content-Type': 'application/json',
      'X-Test-Store': this._config.storeAlias,
    };
  }

  private async _request<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`${this._config.baseUrl}${path}`, {
      ...init,
      headers: { ...this._headers(), ...(init?.headers as Record<string, string>) },
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Relay billing ${path} failed: ${res.status} ${text}`);
    }
    return (await res.json()) as T;
  }

  async createCheckout(params: {
    userId: string;
    email: string;
    plan: SubscriptionPlan;
    redirectUrl: string;
    idempotencyKey: string;
    phone?: string;
  }): Promise<ICheckoutResult> {
    const relayPlan = mapAppPlanToRelayCheckoutPlan(params.plan);
    const body = {
      userId: params.userId,
      email: params.email,
      plan: relayPlan,
      redirectUrl: params.redirectUrl,
      idempotencyKey: params.idempotencyKey,
      ...(params.phone ? { phone: params.phone } : {}),
    };
    const data = await this._request<{ url: string; sessionId: string }>('/checkout', {
      method: 'POST',
      body: JSON.stringify(body),
    });
    return { url: data.url, sessionId: data.sessionId };
  }

  async createOrder(params: {
    userId: string;
    email: string;
    items: readonly { sku: string; quantity: number }[];
    redirectUrl: string;
    idempotencyKey: string;
  }): Promise<IOrderResult> {
    const data = await this._request<{
      url: string;
      sessionId?: string;
      amountCents: number;
    }>('/order', {
      method: 'POST',
      body: JSON.stringify(params),
    });
    return {
      url: data.url,
      sessionId: data.sessionId ?? data.url,
      amountCents: data.amountCents,
    };
  }

  async getSkus(): Promise<readonly IRelaySku[]> {
    const data = await this._request<{ skus?: IRelaySku[] } | IRelaySku[]>('/skus');
    if (Array.isArray(data)) {
      return data;
    }
    return data.skus ?? [];
  }

  async getEntitlements(userId: string): Promise<IRelayEntitlementsResponse> {
    return this._request<IRelayEntitlementsResponse>(
      `/entitlements?userId=${encodeURIComponent(userId)}`
    );
  }

  async createBillingPortalSession(params: {
    email: string;
    customerId?: string;
    redirectUrl: string;
  }): Promise<{ url: string }> {
    const body = params.customerId
      ? { customerId: params.customerId, redirectUrl: params.redirectUrl }
      : { email: params.email, redirectUrl: params.redirectUrl };
    return this._request<{ url: string }>('/update-card', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }
}
