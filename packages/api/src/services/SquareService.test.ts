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

  describe('custom base URL (API relay support)', () => {
    it('passes baseUrl to SquareClient when provided', () => {
      const { SquareClient } = jest.requireMock('square') as { SquareClient: jest.Mock };

      new SquareService({
        accessToken: 'relay-key',
        environment: 'production',
        locationId: 'loc-123',
        baseUrl: 'https://connect.squareup.noctusoft.com',
      });

      expect(SquareClient).toHaveBeenCalledWith(
        expect.objectContaining({ baseUrl: 'https://connect.squareup.noctusoft.com' })
      );
    });

    it('omits baseUrl from SquareClient options when not provided', () => {
      const { SquareClient } = jest.requireMock('square') as { SquareClient: jest.Mock };

      new SquareService({
        accessToken: 'test-token',
        environment: 'sandbox',
        locationId: 'loc-123',
      });

      const lastCallOptions = SquareClient.mock.calls[SquareClient.mock.calls.length - 1]![0];
      expect(lastCallOptions).not.toHaveProperty('baseUrl');
    });
  });
});
