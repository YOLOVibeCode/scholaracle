import { SquareService } from './SquareService';

jest.mock('square', () => ({
  SquareClient: jest.fn().mockImplementation(() => ({
    refunds: {
      refundPayment: jest.fn().mockResolvedValue({
        result: {
          refund: { id: 'refund_123' },
        },
      }),
    },
    checkout: { paymentLinks: { create: jest.fn() } },
    customers: { search: jest.fn(), create: jest.fn() },
    payments: { get: jest.fn(), list: jest.fn() },
  })),
  SquareEnvironment: { Production: 'production', Sandbox: 'sandbox' },
  WebhooksHelper: { verifySignature: jest.fn() },
}));

describe('SquareService', () => {
  let service: SquareService;

  beforeAll(() => {
    service = new SquareService({
      accessToken: 'test-token',
      environment: 'sandbox',
      locationId: 'loc-123',
    });
  });

  describe('refundPayment', () => {
    it('should call Square refunds API and return refundId', async () => {
      const result = await service.refundPayment('pay_123', 999, 'Customer request');
      expect(result.refundId).toBe('refund_123');
    });

    it('should throw if Square returns no refund ID', async () => {
      const client = (service as any)._client;
      client.refunds.refundPayment.mockResolvedValueOnce({ result: { refund: {} } });
      await expect(service.refundPayment('pay_456', 500)).rejects.toThrow('no refund ID');
    });
  });
});
