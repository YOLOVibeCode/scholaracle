import {
  createStoreClient,
  subscriptionSku,
  verifyStoreWebhookSignature,
  type IEntitlementsResponse,
  type StoreClient,
} from '../store-client';
import type { SubscriptionPlan } from '@scholaracle/database';

export interface IStoreBillingServiceConfig {
  readonly baseUrl: string;
  readonly productKey: string;
  readonly apiKey: string;
  readonly webhookSecret: string;
  readonly testStoreAlias?: string;
  readonly client?: StoreClient;
}

export interface ICreateStoreCheckoutParams {
  readonly userId: string;
  readonly email: string;
  readonly plan: SubscriptionPlan;
  readonly billingCycle: 'monthly' | 'annual';
  readonly successUrl: string;
  readonly cancelUrl: string;
}

/**
 * Scholarmancy billing via the Noctusoft product store (checkout, entitlements, refunds).
 */
export class StoreBillingService {
  private readonly _client: StoreClient;
  private readonly _productKey: string;
  private readonly _webhookSecret: string;

  public constructor(config: IStoreBillingServiceConfig) {
    this._productKey = config.productKey;
    this._webhookSecret = config.webhookSecret;
    this._client =
      config.client ??
      createStoreClient({
        baseUrl: config.baseUrl,
        productKey: config.productKey,
        apiKey: config.apiKey,
        testStoreAlias: config.testStoreAlias,
      });
  }

  public async createCheckout(
    params: ICreateStoreCheckoutParams
  ): Promise<{ url: string; orderId: string }> {
    const sku = subscriptionSku(this._productKey, params.plan, params.billingCycle);
    const metadata = {
      userId: params.userId,
      plan: params.plan,
      billingCycle: params.billingCycle,
    };
    const paymentNote = `User ID: ${params.userId} | Plan: ${params.plan} | Cycle: ${params.billingCycle}`;

    const result = await this._client.createCheckout({
      sku,
      externalUserId: params.userId,
      email: params.email,
      successUrl: params.successUrl,
      cancelUrl: params.cancelUrl,
      metadata: { ...metadata, note: paymentNote },
    });

    return { url: result.url, orderId: result.sessionId };
  }

  public async getEntitlements(externalUserId: string): Promise<IEntitlementsResponse> {
    return this._client.getEntitlements(externalUserId);
  }

  public async refundPayment(
    paymentId: string,
    amountCents: number,
    reason?: string
  ): Promise<{ refundId: string }> {
    return this._client.refundPayment({ paymentId, amountCents, reason });
  }

  public verifyWebhookSignature(body: string, signatureHeader: string | undefined): boolean {
    return verifyStoreWebhookSignature({
      body,
      signatureHeader,
      webhookSecret: this._webhookSecret,
    });
  }
}
