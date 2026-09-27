import { NoctusoftStoreClient } from './NoctusoftStoreClient';

describe('NoctusoftStoreClient', () => {
  const config = {
    baseUrl: 'https://store.noctusoft.com',
    apiKey: 'nsk_test_billing',
    webhookSecret: 'whsec',
    storeAlias: 'scholarmancy-dev',
    storeMode: 'test' as const,
  };

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
      /^https:\/\/store\.noctusoft\.com\/buy\/scholarmancy-dev\/NOCTU-SCHOLARMANCY-STARTER-MONTHLY\?/
    );
    expect(result.url).toContain('user=user-1');
    expect(result.url).toContain('sig=');
    expect(result.sessionId).toMatch(/^buy:/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
