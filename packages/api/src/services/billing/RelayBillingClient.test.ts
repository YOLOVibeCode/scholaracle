import { RelayBillingClient } from './RelayBillingClient';

describe('RelayBillingClient', () => {
  const config = {
    apiKey: 'nsk_test_billing',
    baseUrl: 'https://store.relay.example',
    storeAlias: 'scholarmancy-dev',
  };

  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    fetchSpy = jest.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('POST /checkout with auth and X-Test-Store', async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      json: async () => ({
        url: 'https://checkout.stripe.com/c/pay/cs_test_abc',
        sessionId: 'cs_test_abc',
      }),
    });

    const client = new RelayBillingClient(config);
    const result = await client.createCheckout({
      userId: 'user-1',
      email: 'parent@example.com',
      plan: 'premium',
      redirectUrl: 'https://app.example/dashboard/billing?checkout=success',
      idempotencyKey: 'checkout-user-1-premium-monthly',
    });

    expect(result.url).toContain('checkout.stripe.com');
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://store.relay.example/checkout',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer nsk_test_billing',
          'X-Test-Store': 'scholarmancy-dev',
        }),
      })
    );
    const body = JSON.parse((fetchSpy.mock.calls[0][1] as RequestInit).body as string) as {
      plan: string;
    };
    expect(body.plan).toBe('solo');
  });

  it('GET /entitlements', async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      json: async () => ({ entitlements: [{ plan: 'solo', status: 'active' }] }),
    });

    const client = new RelayBillingClient(config);
    const data = await client.getEntitlements('user-1');

    expect(data.entitlements?.[0]?.plan).toBe('solo');
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://store.relay.example/entitlements?userId=user-1',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer nsk_test_billing' }),
      })
    );
  });
});
