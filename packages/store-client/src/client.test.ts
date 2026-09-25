import { subscriptionSku } from './sku';
import { verifyStoreWebhookSignature } from './webhookSignature';
import { StoreClient } from './client';
import crypto from 'crypto';

describe('subscriptionSku', () => {
  it('builds NOCTU product SKUs', () => {
    expect(subscriptionSku('scholarmancy', 'starter', 'monthly')).toBe(
      'NOCTU-SCHOLARMANCY-STARTER-MONTHLY'
    );
    expect(subscriptionSku('scholarmancy', 'premium', 'annual')).toBe(
      'NOCTU-SCHOLARMANCY-PREMIUM-ANNUAL'
    );
  });
});

describe('verifyStoreWebhookSignature', () => {
  const secret = 'whsec_test';
  const body = '{"version":1,"id":"evt_1"}';

  it('accepts hex HMAC', () => {
    const sig = crypto.createHmac('sha256', secret).update(body).digest('hex');
    expect(verifyStoreWebhookSignature({ body, signatureHeader: sig, webhookSecret: secret })).toBe(
      true
    );
  });

  it('rejects missing header', () => {
    expect(
      verifyStoreWebhookSignature({ body, signatureHeader: undefined, webhookSecret: secret })
    ).toBe(false);
  });
});

describe('StoreClient', () => {
  it('POST /checkout and parses url + sessionId', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: true,
      text: async () =>
        JSON.stringify({ url: 'https://pay.example/checkout', sessionId: 'sess_1' }),
    });

    const client = new StoreClient({
      baseUrl: 'https://store.example',
      productKey: 'scholarmancy',
      apiKey: 'key',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const result = await client.createCheckout({
      sku: 'NOCTU-SCHOLARMANCY-STARTER-MONTHLY',
      externalUserId: 'u1',
      email: 'a@test.com',
      successUrl: 'https://app/success',
      cancelUrl: 'https://app/cancel',
    });

    expect(result.url).toBe('https://pay.example/checkout');
    expect(result.sessionId).toBe('sess_1');
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://store.example/checkout',
      expect.objectContaining({ method: 'POST' })
    );
  });
});
