import request from 'supertest';
import express, { type Express } from 'express';
import { billingRouter } from './billing';
import { createErrorHandler } from '../../middleware/errorHandler';
import { ExternalServiceError } from '@scholaracle/contracts';
import type { INoctusoftStoreClient } from '../../services/noctusoft-store/NoctusoftStoreClient';

// Mock @scholaracle/database
jest.mock('@scholaracle/database', () => {
  const mockFindByUserId = jest.fn();
  const mockUpdateSubscription = jest.fn();
  const mockFindByUserIdPayments = jest.fn();
  const mockFindOwnedByUserId = jest.fn();
  return {
    PLAN_FEATURES: {
      free: {
        maxStudents: 1,
        emailNotifications: true,
        smsNotifications: false,
        prioritySupport: false,
        advancedAnalytics: false,
      },
      starter: {
        maxStudents: 1,
        emailNotifications: true,
        smsNotifications: true,
        prioritySupport: false,
        advancedAnalytics: false,
      },
      premium: {
        maxStudents: 2,
        emailNotifications: true,
        smsNotifications: true,
        prioritySupport: true,
        advancedAnalytics: true,
      },
      family: {
        maxStudents: 5,
        emailNotifications: true,
        smsNotifications: true,
        prioritySupport: true,
        advancedAnalytics: true,
      },
      enterprise: {
        maxStudents: -1,
        emailNotifications: true,
        smsNotifications: true,
        prioritySupport: true,
        advancedAnalytics: true,
      },
    },
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
    StudentRepository: jest.fn().mockImplementation(() => ({
      findOwnedByUserId: mockFindOwnedByUserId,
    })),
    __mockFindByUserId: mockFindByUserId,
    __mockUpdateSubscription: mockUpdateSubscription,
    __mockFindByUserIdPayments: mockFindByUserIdPayments,
    __mockFindOwnedByUserId: mockFindOwnedByUserId,
  };
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const {
  __mockFindByUserId: mockFindByUserId,
  __mockUpdateSubscription: mockUpdateSubscription,
  __mockFindByUserIdPayments: mockFindByUserIdPayments,
  __mockFindOwnedByUserId: mockFindOwnedByUserId,
} = require('@scholaracle/database') as {
  __mockFindByUserId: jest.Mock;
  __mockUpdateSubscription: jest.Mock;
  __mockFindByUserIdPayments: jest.Mock;
  __mockFindOwnedByUserId: jest.Mock;
};

function createMockStoreClient(): jest.Mocked<INoctusoftStoreClient> {
  return {
    createCheckout: jest.fn(),
    cancelSubscription: jest.fn(),
    updatePaymentMethod: jest.fn(),
    changePlan: jest.fn(),
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
  effectivePlan: () => 'starter',
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

  describe('POST /api/billing/change-plan', () => {
    beforeEach(() => {
      mockFindOwnedByUserId.mockResolvedValue([]);
    });

    it('requires confirmed: true before calling the store', async () => {
      mockFindByUserId.mockResolvedValue(paidSubscription);

      const res = await request(app)
        .post('/api/billing/change-plan')
        .send({ plan: 'premium', billingCycle: 'monthly' })
        .expect(400);

      expect(res.body.code).toBe('CONFIRMATION_REQUIRED');
      expect(mockStoreClient.changePlan).not.toHaveBeenCalled();
    });

    it('blocks change when cancel is scheduled at period end', async () => {
      mockFindByUserId.mockResolvedValue({ ...paidSubscription, cancelAtPeriodEnd: true });

      const res = await request(app)
        .post('/api/billing/change-plan')
        .send({ plan: 'premium', billingCycle: 'monthly', confirmed: true })
        .expect(409);

      expect(res.body.code).toBe('SUBSCRIPTION_CANCELING');
      expect(mockStoreClient.changePlan).not.toHaveBeenCalled();
    });

    it('blocks downgrade when the household has too many students', async () => {
      mockFindByUserId.mockResolvedValue({
        ...paidSubscription,
        plan: 'family',
        effectivePlan: () => 'family',
      });
      mockFindOwnedByUserId.mockResolvedValue([{}, {}, {}]);

      const res = await request(app)
        .post('/api/billing/change-plan')
        .send({ plan: 'starter', billingCycle: 'monthly', confirmed: true })
        .expect(409);

      expect(res.body.code).toBe('PLAN_LIMIT');
      expect(mockStoreClient.changePlan).not.toHaveBeenCalled();
    });

    it('sends effective now on upgrade', async () => {
      mockFindByUserId.mockResolvedValue(paidSubscription);
      mockStoreClient.changePlan.mockResolvedValue({ currentPeriodEnd: null });

      await request(app)
        .post('/api/billing/change-plan')
        .send({ plan: 'premium', billingCycle: 'monthly', confirmed: true })
        .expect(200);

      expect(mockStoreClient.changePlan).toHaveBeenCalledWith(
        'ns_sub_1',
        expect.objectContaining({
          plan: 'NOCTU-SCHOLARMANCY-PREMIUM-MONTHLY',
          effective: 'now',
        })
      );
      expect(mockUpdateSubscription).toHaveBeenCalledWith(
        'user-1',
        expect.objectContaining({ plan: 'premium', billingCycle: 'monthly' })
      );
    });

    it('sends effective next_period on downgrade', async () => {
      mockFindByUserId.mockResolvedValue({
        ...paidSubscription,
        plan: 'family',
        effectivePlan: () => 'family',
      });
      mockStoreClient.changePlan.mockResolvedValue({ currentPeriodEnd: null });

      await request(app)
        .post('/api/billing/change-plan')
        .send({ plan: 'premium', billingCycle: 'monthly', confirmed: true })
        .expect(200);

      expect(mockStoreClient.changePlan).toHaveBeenCalledWith(
        'ns_sub_1',
        expect.objectContaining({ effective: 'next_period' })
      );
    });

    it('does not update local subscription when the store fails', async () => {
      mockFindByUserId.mockResolvedValue(paidSubscription);
      mockStoreClient.changePlan.mockRejectedValue(new ExternalServiceError('store down'));

      await request(app)
        .post('/api/billing/change-plan')
        .send({ plan: 'premium', billingCycle: 'monthly', confirmed: true })
        .expect(502);

      expect(mockUpdateSubscription).not.toHaveBeenCalled();
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
      expect(res.body.subscription.maxStudents).toBe(1);
      expect(res.body.subscription.featureLines).toEqual(
        expect.arrayContaining(['1 student', '7-day history'])
      );
    });

    it('should return subscription details when found', async () => {
      mockFindByUserId.mockResolvedValue({
        plan: 'premium',
        status: 'active',
        currentPeriodStart: new Date('2025-01-01'),
        currentPeriodEnd: new Date('2025-02-01'),
        billingCycle: 'monthly',
        cancelAtPeriodEnd: false,
        effectivePlan: () => 'premium',
      });

      const res = await request(app).get('/api/billing/subscription').expect(200);

      expect(res.body.subscription.plan).toBe('premium');
      expect(res.body.subscription.effectivePlan).toBe('premium');
      expect(res.body.subscription.status).toBe('active');
      expect(res.body.subscription.maxStudents).toBe(2);
      expect(res.body.subscription.features.advancedAnalytics).toBe(true);
      expect(res.body.subscription.featureLines).toEqual(
        expect.arrayContaining(['2 students', 'Advanced analytics'])
      );
    });

    it('reports the free student cap when the paid plan has lapsed', async () => {
      mockFindByUserId.mockResolvedValue({
        plan: 'family',
        status: 'cancelled',
        currentPeriodEnd: new Date('2025-02-01'),
        cancelAtPeriodEnd: false,
        effectivePlan: () => 'free',
      });

      const res = await request(app).get('/api/billing/subscription').expect(200);

      expect(res.body.subscription.plan).toBe('family');
      expect(res.body.subscription.effectivePlan).toBe('free');
      expect(res.body.subscription.maxStudents).toBe(1);
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
      expect(res.body.invoices[0].pdfUrl).toBe('https://store.noctusoft.com/receipt/1');
    });
  });

  describe('subscription state rules', () => {
    it('refuses a second checkout while a store subscription is running', async () => {
      mockFindByUserId.mockResolvedValue(paidSubscription);

      await request(app)
        .post('/api/billing/checkout')
        .send({ plan: 'premium', billingCycle: 'monthly' })
        .expect(409);

      expect(mockStoreClient.createCheckout).not.toHaveBeenCalled();
    });

    it('allows checkout again after the subscription was cancelled', async () => {
      mockFindByUserId.mockResolvedValue({ ...paidSubscription, status: 'cancelled' });
      mockStoreClient.createCheckout.mockResolvedValue({
        url: 'https://store.example/buy',
        sessionId: 'buy:2',
      });

      await request(app)
        .post('/api/billing/checkout')
        .send({ plan: 'premium', billingCycle: 'monthly' })
        .expect(200);
    });

    it('uses the configured web origin for return URLs when the request has no Origin', async () => {
      mockFindByUserId.mockResolvedValue(null);
      mockStoreClient.createCheckout.mockResolvedValue({
        url: 'https://store.example/buy',
        sessionId: 'buy:3',
      });
      const native = express();
      native.use(express.json());
      native.use((req, _res, next) => {
        (req as unknown as { userId: string; userEmail: string }).userId = 'user-1';
        (req as unknown as { userId: string; userEmail: string }).userEmail = 'test@example.com';
        next();
      });
      native.use(
        '/api/billing',
        billingRouter({
          database: {} as unknown as import('mongodb').Db,
          storeClient: mockStoreClient,
          webBaseUrl: 'https://scholarmancy.com/',
        })
      );
      native.use(createErrorHandler());

      await request(native).post('/api/billing/checkout').send({ plan: 'starter' }).expect(200);

      expect(mockStoreClient.createCheckout).toHaveBeenCalledWith(
        expect.objectContaining({
          successUrl: 'https://scholarmancy.com/dashboard/billing?checkout=success',
        })
      );
    });

    it('opens the card page for a past-due customer', async () => {
      mockFindByUserId.mockResolvedValue({
        ...paidSubscription,
        status: 'past_due',
        isActive: () => false,
      });
      mockStoreClient.updatePaymentMethod.mockResolvedValue('https://store.example/card');

      const res = await request(app).post('/api/billing/portal').send({}).expect(200);

      expect(res.body.hasPortal).toBe(true);
      expect(mockStoreClient.updatePaymentMethod).toHaveBeenCalled();
    });
  });
});
