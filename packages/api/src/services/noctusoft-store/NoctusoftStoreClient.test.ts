import { ExternalServiceError } from '@scholaracle/contracts';
import { NoctusoftStoreClient } from './NoctusoftStoreClient';

describe('NoctusoftStoreClient', () => {
  const config = {
    baseUrl: 'https://store.noctusoft.com',
    apiKey: 'nsk_test_billing',
    webhookSecret: 'whsec',
    storeAlias: 'scholarmancy',
    storeMode: 'test' as const,
  };

  function jsonResponse(status: number, body: unknown): Response {
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    });
  }

  function lastCall(fetchMock: jest.Mock): { url: string; init: RequestInit } {
    const [url, init] = fetchMock.mock.calls[fetchMock.mock.calls.length - 1] as [
      string,
      RequestInit,
    ];
    return { url, init };
  }

  it('mints a signed /buy/:store/:code URL for the plan SKU', async () => {
    const fetchMock = jest.fn();
    const client = new NoctusoftStoreClient(config, fetchMock);
    const result = await client.createCheckout({
      userId: 'user-1',
      email: 'parent@example.com',
      plan: 'starter',
      billingCycle: 'monthly',
      successUrl: 'https://app/success',
      cancelUrl: 'https://app/cancel',
    });

    expect(result.url).toMatch(
      /^https:\/\/store\.noctusoft\.com\/buy\/scholarmancy\/NOCTU-SCHOLARMANCY-STARTER-MONTHLY\?/
    );
    expect(result.url).toContain('user=user-1');
    expect(result.url).toContain('sig=');
    expect(result.sessionId).toMatch(/^buy:/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('cancels a subscription at period end with the product key and store headers', async () => {
    const fetchMock = jest.fn().mockResolvedValue(
      jsonResponse(200, {
        subscriptionRef: 'ns_sub_1',
        status: 'active',
        cancelAtPeriodEnd: true,
        currentPeriodEnd: '2026-10-28T03:45:34.000Z',
      })
    );
    const client = new NoctusoftStoreClient(config, fetchMock);

    const result = await client.cancelSubscription('ns_sub_1');

    const { url, init } = lastCall(fetchMock);
    expect(url).toBe('https://store.noctusoft.com/subscriptions/ns_sub_1/cancel');
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual(
      expect.objectContaining({
        'X-Api-Key': 'nsk_test_billing',
        'X-Test-Store': 'scholarmancy',
        'X-Store-Mode': 'test',
      })
    );
    expect(JSON.parse(String(init.body))).toEqual({ atPeriodEnd: true });
    expect(result).toEqual({
      cancelAtPeriodEnd: true,
      currentPeriodEnd: '2026-10-28T03:45:34.000Z',
    });
  });

  it('returns the store page where the buyer updates their card', async () => {
    const fetchMock = jest.fn().mockResolvedValue(
      jsonResponse(200, {
        subscriptionRef: 'ns_sub_1',
        step: { kind: 'redirect', url: 'https://billing.stripe.com/p/session/test_1' },
      })
    );
    const client = new NoctusoftStoreClient(config, fetchMock);

    const url = await client.updatePaymentMethod('ns_sub_1', 'https://app/dashboard/billing');

    const call = lastCall(fetchMock);
    expect(call.url).toBe(
      'https://store.noctusoft.com/subscriptions/ns_sub_1/update-payment-method'
    );
    expect(JSON.parse(String(call.init.body))).toEqual({
      returnUrl: 'https://app/dashboard/billing',
    });
    expect(url).toBe('https://billing.stripe.com/p/session/test_1');
  });

  it('refunds a payment by its store ref', async () => {
    const fetchMock = jest.fn().mockResolvedValue(
      jsonResponse(200, {
        refundRef: 'ns_ref_1',
        paymentRef: 'ns_pay_1',
        status: 'succeeded',
        amountCents: 500,
      })
    );
    const client = new NoctusoftStoreClient(config, fetchMock);

    const result = await client.refundPayment('ns_pay_1', {
      amountCents: 500,
      reason: 'Customer request',
      idempotencyKey: 'refund-1',
    });

    const call = lastCall(fetchMock);
    expect(call.url).toBe('https://store.noctusoft.com/payments/ns_pay_1/refund');
    expect(JSON.parse(String(call.init.body))).toEqual({
      amountCents: 500,
      reason: 'Customer request',
      idempotencyKey: 'refund-1',
    });
    expect(result).toEqual({ refundRef: 'ns_ref_1', status: 'succeeded', amountCents: 500 });
  });

  it('turns a store error into an ExternalServiceError that names the store code', async () => {
    const fetchMock = jest
      .fn()
      .mockImplementation(() =>
        Promise.resolve(jsonResponse(404, { error: 'No such payment.', code: 'NOT_FOUND' }))
      );
    const client = new NoctusoftStoreClient(config, fetchMock);

    await expect(
      client.refundPayment('ns_pay_missing', { idempotencyKey: 'refund-2' })
    ).rejects.toThrow(ExternalServiceError);
    await expect(
      client.refundPayment('ns_pay_missing', { idempotencyKey: 'refund-2' })
    ).rejects.toThrow(/NOT_FOUND/);
  });
});
