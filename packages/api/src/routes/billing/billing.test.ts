import request from 'supertest';
import express, { type Express } from 'express';
import { billingRouter } from './billing';
import { createErrorHandler } from '../../middleware/errorHandler';
import type { INoctusoftStoreClient } from '../../services/noctusoft-store/NoctusoftStoreClient';

// Mock @scholaracle/database
jest.mock('@scholaracle/database', () => {
  const mockFindByUserId = jest.fn();
  const mockUpdateSubscription = jest.fn();
  const mockFindByUserIdPayments = jest.fn();
  return {
    SubscriptionRepository: jest.fn().mockImplementation(() => ({
      findByUserId: mockFindByUserId,
      update: mockUpdateSubscription,
    })),
    PaymentRepository: jest.fn().mockImplementation(() => ({
      findByUserId: mockFindByUserIdPayments,
    })),
    CouponRepository: jest.fn().mockImplementation(() => ({
      validateCode: jest.fn().mockResolvedValue({ valid: false, error: 'Coupon not found' }),
      recordRedemption: jest.fn().mockResolvedValue(null),
    })),
    __mockFindByUserId: mockFindByUserId,
    __mockUpdateSubscription: mockUpdateSubscription,
    __mockFindByUserIdPayments: mockFindByUserIdPayments,
  };
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const {
  __mockFindByUserId: mockFindByUserId,
  __mockUpdateSubscription: mockUpdateSubscription,
  __mockFindByUserIdPayments: mockFindByUserIdPayments,
} = require('@scholaracle/database') as {
  __mockFindByUserId: jest.Mock;
  __mockUpdateSubscription: jest.Mock;
  __mockFindByUserIdPayments: jest.Mock;
};

function createMockStoreClient(): jest.Mocked<INoctusoftStoreClient> {
  return {
    createCheckout: jest.fn(),
    cancelSubscription: jest.fn(),
    updatePaymentMethod: jest.fn(),
    refundPayment: jest.fn(),
  };
}

const paidSubscription = {
  plan: 'starter',
  status: 'active',
  billingCycle: 'monthly',
  currentPeriodStart: new Date('2026-09-28'),
  currentPeriodEnd: new Date('2026-10-28'),
  cancelAtPeriodEnd: false,
  storeSubscriptionId: 'ns_sub_1',
  isActive: () => true,
};

describe('Billing Routes', () => {
  let app: Express;
  let mockStoreClient: jest.Mocked<INoctusoftStoreClient>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockStoreClient = createMockStoreClient();

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
        storeClient: mockStoreClient,
      })
    );
    app.use(createErrorHandler());
  });

  describe('POST /api/billing/checkout', () => {
    it('should create a checkout session', async () => {
      mockStoreClient.createCheckout.mockResolvedValue({
        url: 'https://store.noctusoft.com/checkout/example',
        sessionId: 'order_123',
      });

      const res = await request(app)
        .post('/api/billing/checkout')
        .send({ plan: 'starter', billingCycle: 'monthly' })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.sessionId).toBe('order_123');
      expect(res.body.url).toBe('https://store.noctusoft.com/checkout/example');
    });

    it('should default to starter plan if not provided', async () => {
      mockStoreClient.createCheckout.mockResolvedValue({
        url: 'https://store.noctusoft.com/checkout/example',
        sessionId: 'order_123',
      });

      const res = await request(app).post('/api/billing/checkout').send({}).expect(200);

      expect(mockStoreClient.createCheckout).toHaveBeenCalledWith(
        expect.objectContaining({
          plan: 'starter',
          billingCycle: 'monthly',
        })
      );
      expect(res.body.success).toBe(true);
    });

    it('sends the buyer back to the billing page after the store checkout', async () => {
      mockStoreClient.createCheckout.mockResolvedValue({
        url: 'https://store.noctusoft.com/buy/scholarmancy/NOCTU-SCHOLARMANCY-STARTER-MONTHLY',
        sessionId: 'buy:abc',
      });

      await request(app)
        .post('/api/billing/checkout')
        .set('Origin', 'https://web-uat.scholarmancy.com')
        .send({ plan: 'starter', billingCycle: 'monthly' })
        .expect(200);

      expect(mockStoreClient.createCheckout).toHaveBeenCalledWith(
        expect.objectContaining({
          successUrl: 'https://web-uat.scholarmancy.com/dashboard/billing?checkout=success',
          cancelUrl: 'https://web-uat.scholarmancy.com/dashboard/billing?checkout=cancelled',
        })
      );
    });
  });

  describe('POST /api/billing/portal', () => {
    it('should return billing settings URL when there is no store subscription', async () => {
      mockFindByUserId.mockResolvedValue(null);

      const res = await request(app).post('/api/billing/portal').send({}).expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.url).toContain('/dashboard/billing');
      expect(mockStoreClient.updatePaymentMethod).not.toHaveBeenCalled();
    });

    it('opens the store page to update the card on a paid subscription', async () => {
      mockFindByUserId.mockResolvedValue(paidSubscription);
      mockStoreClient.updatePaymentMethod.mockResolvedValue(
        'https://billing.stripe.com/p/session/test_1'
      );

      const res = await request(app)
        .post('/api/billing/portal')
        .set('Origin', 'https://web-uat.scholarmancy.com')
        .send({})
        .expect(200);

      expect(mockStoreClient.updatePaymentMethod).toHaveBeenCalledWith(
        'ns_sub_1',
        'https://web-uat.scholarmancy.com/dashboard/billing'
      );
      expect(res.body.hasPortal).toBe(true);
      expect(res.body.url).toBe('https://billing.stripe.com/p/session/test_1');
    });
  });

  describe('POST /api/billing/cancel', () => {
    it('cancels the store subscription at period end and marks it locally', async () => {
      mockFindByUserId.mockResolvedValue(paidSubscription);
      mockStoreClient.cancelSubscription.mockResolvedValue({
        cancelAtPeriodEnd: true,
        currentPeriodEnd: '2026-10-28T03:45:34.000Z',
      });

      const res = await request(app).post('/api/billing/cancel').send({}).expect(200);

      expect(mockStoreClient.cancelSubscription).toHaveBeenCalledWith('ns_sub_1');
      expect(mockUpdateSubscription).toHaveBeenCalledWith(
        'user-1',
        expect.objectContaining({ cancelAtPeriodEnd: true })
      );
      expect(res.body.subscription.cancelAtPeriodEnd).toBe(true);
      expect(res.body.subscription.currentPeriodEnd).toBe('2026-10-28T03:45:34.000Z');
    });

    it('answers 409 when there is no store subscription to cancel', async () => {
      mockFindByUserId.mockResolvedValue({ ...paidSubscription, storeSubscriptionId: undefined });

      const res = await request(app).post('/api/billing/cancel').send({}).expect(409);

      expect(res.body.code).toBe('CONFLICT');
      expect(mockStoreClient.cancelSubscription).not.toHaveBeenCalled();
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
          storePaymentId: 'pay_1',
          amount: 1900,
          currency: 'usd',
          status: 'succeeded',
          createdAt: new Date('2025-01-15'),
          receiptUrl: 'https://store.noctusoft.com/receipt/1',
        },
      ]);

      const res = await request(app).get('/api/billing/invoices').expect(200);

      expect(res.body.invoices).toHaveLength(1);
      expect(res.body.invoices[0].id).toBe('pay_1');
      expect(res.body.invoices[0].amount).toBe(19);
      expect(res.body.invoices[0].currency).toBe('usd');
    });
  });
});
