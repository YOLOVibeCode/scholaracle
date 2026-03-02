import { SquareClient, SquareEnvironment, WebhooksHelper } from 'square';
import { PLAN_PRICING, type SubscriptionPlan } from '@scholaracle/database';

export interface ISquareServiceConfig {
  readonly accessToken: string;
  readonly environment: 'sandbox' | 'production';
  readonly locationId: string;
  readonly webhookSignatureKey?: string;
  readonly webhookNotificationUrl?: string;
}

export interface ICreatePaymentLinkParams {
  readonly userId: string;
  readonly email: string;
  readonly plan: SubscriptionPlan;
  readonly billingCycle: 'monthly' | 'annual';
  readonly successUrl: string;
  readonly cancelUrl: string;
}

/**
 * Square API wrapper service.
 * Provides methods for checkout (payment links), customers, and payment handling.
 */
export class SquareService {
  private readonly _client: SquareClient;
  private readonly _locationId: string;
  private readonly _webhookSignatureKey?: string;
  private readonly _webhookNotificationUrl?: string;

  constructor(config: ISquareServiceConfig) {
    this._client = new SquareClient({
      token: config.accessToken,
      environment:
        config.environment === 'production'
          ? SquareEnvironment.Production
          : SquareEnvironment.Sandbox,
    });
    this._locationId = config.locationId;
    this._webhookSignatureKey = config.webhookSignatureKey;
    this._webhookNotificationUrl = config.webhookNotificationUrl;
  }

  public async createOrGetCustomer(userId: string, email: string): Promise<{ id: string }> {
    const searchResponse = await this._client.customers.search({
      query: {
        filter: {
          emailAddress: {
            exact: email,
          },
        },
      },
    });

    const searchData =
      (searchResponse as unknown as { result?: { customers?: { id?: string }[] } }).result ??
      (searchResponse as unknown as { customers?: { id?: string }[] });
    const customers = (searchData as { customers?: { id?: string }[] }).customers ?? [];
    if (customers.length > 0) {
      return { id: customers[0]!.id! };
    }

    const createResponse = await this._client.customers.create({
      idempotencyKey: `scholaracle-${userId}-${Date.now()}`,
      givenName: 'Customer',
      emailAddress: email,
      note: `Scholaracle user: ${userId}`,
      referenceId: userId,
    });

    const createData =
      (createResponse as unknown as { result?: { customer?: { id?: string } } }).result ??
      (createResponse as unknown as { customer?: { id?: string } });
    return { id: (createData as { customer?: { id?: string } }).customer!.id! };
  }

  public async createPaymentLink(
    params: ICreatePaymentLinkParams
  ): Promise<{ url: string; orderId: string }> {
    const pricing = PLAN_PRICING[params.plan];
    const amountDollars = params.billingCycle === 'annual' ? pricing.annual : pricing.monthly;
    const amountCents = Math.round(amountDollars * 100);

    const planLabel = `${params.plan.charAt(0).toUpperCase() + params.plan.slice(1)} Plan`;
    const cycleLabel = params.billingCycle === 'annual' ? 'Annual' : 'Monthly';
    const name = `Scholaracle ${planLabel} (${cycleLabel})`;

    const createResponse = await this._client.checkout.paymentLinks.create({
      idempotencyKey: `scholaracle-${params.userId}-${params.plan}-${params.billingCycle}-${Date.now()}`,
      description: `Scholaracle subscription: ${planLabel}`,
      quickPay: {
        name,
        priceMoney: {
          amount: BigInt(amountCents),
          currency: 'USD',
        },
        locationId: this._locationId,
      },
      checkoutOptions: {
        redirectUrl: params.successUrl,
        merchantSupportEmail: params.email,
        allowTipping: false,
      },
      paymentNote: `User ID: ${params.userId}`,
      prePopulatedData: {
        buyerEmail: params.email,
      },
    });

    const createData =
      (
        createResponse as unknown as {
          result?: { paymentLink?: { url?: string; orderId?: string } };
        }
      ).result ??
      (createResponse as unknown as { paymentLink?: { url?: string; orderId?: string } });
    const paymentLink = (createData as { paymentLink?: { url?: string; orderId?: string } })
      .paymentLink;
    if (!paymentLink?.url || !paymentLink.orderId) {
      throw new Error('Failed to create Square payment link');
    }

    return {
      url: paymentLink.url,
      orderId: paymentLink.orderId,
    };
  }

  public async getPayment(paymentId: string): Promise<unknown> {
    const response = await this._client.payments.get({
      paymentId,
    });
    const data =
      (response as unknown as { result?: { payment?: unknown } }).result ??
      (response as unknown as { payment?: unknown });
    return (data as { payment?: unknown }).payment;
  }

  public async listPaymentsByOrderId(orderId: string): Promise<{ orderId?: string }[]> {
    const page = await this._client.payments.list({
      limit: 10,
      sortOrder: 'DESC',
    });
    const payments: { orderId?: string }[] = [];
    for await (const p of page) {
      payments.push(p);
    }
    return payments.filter((p) => p.orderId === orderId);
  }

  public async verifyWebhookSignature(body: string, signature: string): Promise<boolean> {
    if (!this._webhookSignatureKey || !this._webhookNotificationUrl) {
      return false;
    }
    return WebhooksHelper.verifySignature({
      requestBody: body,
      signatureHeader: signature,
      signatureKey: this._webhookSignatureKey,
      notificationUrl: this._webhookNotificationUrl,
    });
  }
}
