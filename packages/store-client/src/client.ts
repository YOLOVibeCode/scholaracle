import type {
  ICheckoutResult,
  ICreateCheckoutParams,
  IEntitlementsResponse,
  IRefundParams,
  IRefundResult,
  IStoreClientConfig,
} from './types';

function trimTrailingSlash(url: string): string {
  return url.endsWith('/') ? url.slice(0, -1) : url;
}

function pickString(record: Record<string, unknown>, keys: readonly string[]): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.length > 0) {
      return value;
    }
  }
  return undefined;
}

export class StoreClient {
  private readonly _baseUrl: string;
  private readonly _productKey: string;
  private readonly _apiKey: string;
  private readonly _testStoreAlias?: string;
  private readonly _fetch: typeof fetch;

  public constructor(config: IStoreClientConfig) {
    this._baseUrl = trimTrailingSlash(config.baseUrl);
    this._productKey = config.productKey;
    this._apiKey = config.apiKey;
    this._testStoreAlias = config.testStoreAlias;
    this._fetch = config.fetchImpl ?? fetch;
  }

  public async createCheckout(params: ICreateCheckoutParams): Promise<ICheckoutResult> {
    const response = await this._request('POST', '/checkout', {
      sku: params.sku,
      customer: {
        externalId: params.externalUserId,
        email: params.email,
      },
      successUrl: params.successUrl,
      cancelUrl: params.cancelUrl,
      metadata: params.metadata,
    });

    const url = pickString(response, ['url', 'checkoutUrl', 'checkout_url']);
    if (!url) {
      throw new Error('Store checkout response missing url');
    }
    const sessionId = pickString(response, ['sessionId', 'orderId', 'order_id', 'id']);
    if (!sessionId) {
      throw new Error('Store checkout response missing session id');
    }

    return { url, sessionId };
  }

  public async getEntitlements(externalUserId: string): Promise<IEntitlementsResponse> {
    const path = `/entitlements?externalUserId=${encodeURIComponent(externalUserId)}`;
    const response = await this._request('GET', path);
    const raw = response['entitlements'];
    const entitlements = Array.isArray(raw) ? raw : [];
    return { entitlements: entitlements as IEntitlementsResponse['entitlements'] };
  }

  public async refundPayment(params: IRefundParams): Promise<IRefundResult> {
    const response = await this._request('POST', '/refund', {
      paymentId: params.paymentId,
      amountCents: params.amountCents,
      reason: params.reason,
    });
    const refundId = pickString(response, ['refundId', 'id']);
    if (!refundId) {
      throw new Error('Store refund response missing refund id');
    }
    return { refundId };
  }

  private async _request(
    method: 'GET' | 'POST',
    path: string,
    body?: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this._apiKey}`,
      'X-Product-Key': this._productKey,
      Accept: 'application/json',
    };
    if (this._testStoreAlias) {
      headers['X-Test-Store'] = this._testStoreAlias;
    }

    const init: RequestInit = { method, headers };
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(body);
    }

    const response = await this._fetch(`${this._baseUrl}${path}`, init);
    const text = await response.text();
    let parsed: unknown = {};
    if (text.length > 0) {
      try {
        parsed = JSON.parse(text) as unknown;
      } catch {
        throw new Error(`Store API returned non-JSON (${response.status})`);
      }
    }

    if (!response.ok) {
      const message =
        typeof parsed === 'object' &&
        parsed !== null &&
        'error' in parsed &&
        typeof (parsed as { error?: unknown }).error === 'string'
          ? (parsed as { error: string }).error
          : `Store API error ${response.status}`;
      throw new Error(message);
    }

    return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : {};
  }
}

export function createStoreClient(config: IStoreClientConfig): StoreClient {
  return new StoreClient(config);
}
