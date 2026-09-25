import { NoctusoftStoreClient } from './NoctusoftStoreClient';

describe('NoctusoftStoreClient', () => {
  const config = {
    baseUrl: 'https://store.noctusoft.com',
    apiKey: 'nsk_test_billing',
    webhookSecret: 'whsec',
    storeAlias: 'scholarmancy-dev',
    storeMode: 'test' as const,
  };

  it('POSTs /checkout with relay headers and metadata', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ url: 'https://store.noctusoft.com/pay/abc', sessionId: 'sess_1' }),
    });

    const client = new NoctusoftStoreClient(config, fetchMock);
    const result = await client.createCheckout({
      userId: 'user-1',
      email: 'parent@example.com',
      plan: 'starter',
      billingCycle: 'monthly',
      successUrl: 'https://app/success',
      cancelUrl: 'https://app/cancel',
    });

    expect(result.url).toBe('https://store.noctusoft.com/pay/abc');
    expect(result.sessionId).toBe('sess_1');
    expect(fetchMock).toHaveBeenCalledWith(
      'https://store.noctusoft.com/checkout',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'X-Api-Key': 'nsk_test_billing',
          'X-Test-Store': 'scholarmancy-dev',
          'X-Store-Mode': 'test',
        }),
      })
    );
    const body = JSON.parse((fetchMock.mock.calls[0] as [string, RequestInit])[1].body as string);
    expect(body.sku).toBe('NOCTU-SCHOLARMANCY-STARTER-MONTHLY');
    expect(body.metadata.userId).toBe('user-1');
  });
});
