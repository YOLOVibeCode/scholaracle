import request from 'supertest';
import express, { type Express } from 'express';
import { billingRouter } from './billing';
import { createErrorHandler } from '../../middleware/errorHandler';
import type { SquareService } from '../../services/SquareService';

// Mock @scholaracle/database
jest.mock('@scholaracle/database', () => {
  const mockFindByUserId = jest.fn();
  const mockFindByUserIdPayments = jest.fn();
  return {
    SubscriptionRepository: jest.fn().mockImplementation(() => ({
      findByUserId: mockFindByUserId,
    })),
    PaymentRepository: jest.fn().mockImplementation(() => ({
      findByUserId: mockFindByUserIdPayments,
    })),
    CouponRepository: jest.fn().mockImplementation(() => ({
      validateCode: jest.fn().mockResolvedValue({ valid: false, error: 'Coupon not found' }),
      recordRedemption: jest.fn().mockResolvedValue(null),
    })),
    __mockFindByUserId: mockFindByUserId,
    __mockFindByUserIdPayments: mockFindByUserIdPayments,
  };
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const {
  __mockFindByUserId: mockFindByUserId,
  __mockFindByUserIdPayments: mockFindByUserIdPayments,
} = require('@scholaracle/database') as {
  __mockFindByUserId: jest.Mock;
  __mockFindByUserIdPayments: jest.Mock;
};

function createMockSquareService(): jest.Mocked<Pick<SquareService, 'createPaymentLink'>> {
  return {
    createPaymentLink: jest.fn(),
  };
}

describe('Billing Routes', () => {
  let app: Express;
  let mockSquareService: jest.Mocked<Pick<SquareService, 'createPaymentLink'>>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockSquareService = createMockSquareService();

    app = express();
    app.use(express.json());

    app.use((req, _res, next) => {
      (req as unknown as { userId: string; userEmail: string }).userId = 'user-1';
      (req as unknown as { userId: string; userEmail: string }).userEmail = 'test@example.com';
      next();
    });

    app.use(
      '/api/billing',
      billingRouter({
        database: {} as unknown as import('mongodb').Db,
        squareService: mockSquareService as unknown as SquareService,
      })
    );
    app.use(createErrorHandler());
  });

  describe('POST /api/billing/checkout', () => {
    it('should create a payment link', async () => {
      mockSquareService.createPaymentLink.mockResolvedValue({
        url: 'https://square.link/example',
        orderId: 'order_123',
      });

      const res = await request(app)
        .post('/api/billing/checkout')
        .send({ plan: 'starter', billingCycle: 'monthly' })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.sessionId).toBe('order_123');
      expect(res.body.url).toBe('https://square.link/example');
    });

    it('should default to starter plan if not provided', async () => {
      mockSquareService.createPaymentLink.mockResolvedValue({
        url: 'https://square.link/example',
        orderId: 'order_123',
      });

      const res = await request(app).post('/api/billing/checkout').send({}).expect(200);

      expect(mockSquareService.createPaymentLink).toHaveBeenCalledWith(
        expect.objectContaining({
          plan: 'starter',
          billingCycle: 'monthly',
        })
      );
      expect(res.body.success).toBe(true);
    });
  });

  describe('POST /api/billing/portal', () => {
    it('should return settings URL when subscription has squareCustomerId', async () => {
      mockFindByUserId.mockResolvedValue({
        squareCustomerId: 'sq_cus_1',
        plan: 'starter',
        status: 'active',
      });

      const res = await request(app).post('/api/billing/portal').send({}).expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.url).toBeDefined();
    });

    it('should return 404 if no billing account found', async () => {
      mockFindByUserId.mockResolvedValue(null);

      const res = await request(app).post('/api/billing/portal').send({}).expect(404);

      expect(res.body.error).toContain('No billing account');
      expect(res.body.code).toBe('NOT_FOUND');
    });
  });

  describe('GET /api/billing/subscription', () => {
    it('should return free plan if no subscription exists', async () => {
      mockFindByUserId.mockResolvedValue(null);

      const res = await request(app).get('/api/billing/subscription').expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.subscription.plan).toBe('free');
    });

    it('should return subscription details when found', async () => {
      mockFindByUserId.mockResolvedValue({
        plan: 'premium',
        status: 'active',
        currentPeriodStart: new Date('2025-01-01'),
        currentPeriodEnd: new Date('2025-02-01'),
        billingCycle: 'monthly',
        cancelAtPeriodEnd: false,
      });

      const res = await request(app).get('/api/billing/subscription').expect(200);

      expect(res.body.subscription.plan).toBe('premium');
      expect(res.body.subscription.status).toBe('active');
    });
  });

  describe('GET /api/billing/invoices', () => {
    it('should return empty array if no payments', async () => {
      mockFindByUserIdPayments.mockResolvedValue([]);

      const res = await request(app).get('/api/billing/invoices').expect(200);

      expect(res.body.invoices).toEqual([]);
    });

    it('should return formatted invoices from payments', async () => {
      mockFindByUserIdPayments.mockResolvedValue([
        {
          squarePaymentId: 'pay_1',
          amount: 1900,
          currency: 'usd',
          status: 'succeeded',
          createdAt: new Date('2025-01-15'),
          receiptUrl: 'https://square.com/receipt/1',
        },
      ]);

      const res = await request(app).get('/api/billing/invoices').expect(200);

      expect(res.body.invoices).toHaveLength(1);
      expect(res.body.invoices[0].amount).toBe(19);
      expect(res.body.invoices[0].currency).toBe('usd');
    });
  });
});
