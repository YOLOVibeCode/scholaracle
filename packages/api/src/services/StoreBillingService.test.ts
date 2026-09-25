import { StoreBillingService } from './StoreBillingService';
import type { StoreClient } from '../store-client';

describe('StoreBillingService', () => {
  it('createCheckout maps plan to store SKU and returns url + orderId', async () => {
    const mockClient = {
      createCheckout: jest.fn().mockResolvedValue({
        url: 'https://store/checkout/abc',
        sessionId: 'ord_99',
      }),
      getEntitlements: jest.fn(),
      refundPayment: jest.fn(),
    } as unknown as StoreClient;

    const service = new StoreBillingService({
      baseUrl: 'https://store.example',
      productKey: 'scholarmancy',
      apiKey: 'key',
      webhookSecret: 'whsec',
      client: mockClient,
    });

    const result = await service.createCheckout({
      userId: 'user-1',
      email: 'parent@test.com',
      plan: 'premium',
      billingCycle: 'annual',
      successUrl: 'https://app/s',
      cancelUrl: 'https://app/c',
    });

    expect(result.url).toBe('https://store/checkout/abc');
    expect(result.orderId).toBe('ord_99');
    expect(mockClient.createCheckout).toHaveBeenCalledWith(
      expect.objectContaining({
        sku: 'NOCTU-SCHOLARMANCY-PREMIUM-ANNUAL',
        externalUserId: 'user-1',
      })
    );
  });

  it('verifyWebhookSignature delegates to store-client', () => {
    const service = new StoreBillingService({
      baseUrl: 'https://store.example',
      productKey: 'scholarmancy',
      apiKey: 'key',
      webhookSecret: 'whsec',
      client: {
        createCheckout: jest.fn(),
        getEntitlements: jest.fn(),
        refundPayment: jest.fn(),
      } as unknown as StoreClient,
    });

    expect(service.verifyWebhookSignature('{}', undefined)).toBe(false);
  });
});
