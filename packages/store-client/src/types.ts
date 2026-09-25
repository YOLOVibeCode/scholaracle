export interface IStoreClientConfig {
  readonly baseUrl: string;
  readonly productKey: string;
  readonly apiKey: string;
  /** Sent as X-Test-Store on non-production store aliases (Railway dev / UAT). */
  readonly testStoreAlias?: string;
  readonly fetchImpl?: typeof fetch;
}

export interface ICreateCheckoutParams {
  readonly sku: string;
  readonly externalUserId: string;
  readonly email: string;
  readonly successUrl: string;
  readonly cancelUrl: string;
  readonly metadata?: Readonly<Record<string, string>>;
}

export interface ICheckoutResult {
  readonly url: string;
  readonly sessionId: string;
}

export interface IStoreEntitlement {
  readonly sku?: string;
  readonly plan?: string;
  readonly status?: string;
  readonly billingCycle?: 'monthly' | 'annual';
  readonly currentPeriodEnd?: string;
}

export interface IEntitlementsResponse {
  readonly entitlements: readonly IStoreEntitlement[];
}

export interface IRefundParams {
  readonly paymentId: string;
  readonly amountCents: number;
  readonly reason?: string;
}

export interface IRefundResult {
  readonly refundId: string;
}

/** Inbound store webhook envelope (event v1). */
export interface IStoreEventV1 {
  readonly version: 1;
  readonly id: string;
  readonly type: string;
  readonly data?: {
    readonly payment?: {
      readonly id?: string;
      readonly orderId?: string;
      readonly amountCents?: number;
      readonly currency?: string;
      readonly status?: string;
      readonly note?: string;
      readonly metadata?: Readonly<Record<string, string>>;
    };
    readonly refund?: {
      readonly id?: string;
      readonly paymentId?: string;
      readonly amountCents?: number;
      readonly reason?: string;
    };
  };
}
