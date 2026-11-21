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
  const mockUserUpdateSubscription = jest.fn().mockResolvedValue(true);
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
    UserRepository: jest.fn().mockImplementation(() => ({
      updateSubscription: mockUserUpdateSubscription,
    })),
    __mockUserUpdateSubscription: mockUserUpdateSubscription,
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
  __mockUserUpdateSubscription: mockUserUpdateSubscription,
} = require('@scholaracle/database') as {
  __mockFindByUserId: jest.Mock;
  __mockUpdateSubscription: jest.Mock;
  __mockFindByUserIdPayments: jest.Mock;
  __mockFindOwnedByUserId: jest.Mock;
  __mockUserUpdateSubscription: jest.Mock;
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

    it('rejects a billing cycle that is neither monthly nor annual', async () => {
      mockFindByUserId.mockResolvedValue({ ...paidSubscription, billingCycle: 'annual' });

      const res = await request(app)
        .post('/api/billing/change-plan')
        .send({ plan: 'premium', billingCycle: 'yearly', confirmed: true })
        .expect(400);

      expect(JSON.stringify(res.body)).toMatch(/billing cycle/i);
      expect(mockStoreClient.changePlan).not.toHaveBeenCalled();
      expect(mockUpdateSubscription).not.toHaveBeenCalled();
    });

    it('keeps an annual subscriber on annual when the request names no cycle', async () => {
      mockFindByUserId.mockResolvedValue({ ...paidSubscription, billingCycle: 'annual' });
      mockStoreClient.changePlan.mockResolvedValue({ planKey: 'x', effective: 'now' });

      await request(app)
        .post('/api/billing/change-plan')
        .send({ plan: 'premium', confirmed: true })
        .expect(200);

      expect(mockStoreClient.changePlan).toHaveBeenCalledWith('ns_sub_1', {
        plan: 'NOCTU-SCHOLARMANCY-PREMIUM-ANNUAL',
      });
      expect(mockUpdateSubscription).toHaveBeenCalledWith(
        'user-1',
        expect.objectContaining({ plan: 'premium', billingCycle: 'annual' })
      );
    });

    it('refuses a subscription with no store subscription (coupon trial or admin grant)', async () => {
      mockFindByUserId.mockResolvedValue({
        ...paidSubscription,
        status: 'trialing',
        storeSubscriptionId: undefined,
      });

      const res = await request(app)
        .post('/api/billing/change-plan')
        .send({ plan: 'premium', billingCycle: 'monthly', confirmed: true })
        .expect(409);

      expect(JSON.stringify(res.body)).toMatch(/no paid subscription/i);
      expect(mockStoreClient.changePlan).not.toHaveBeenCalled();
    });

    it('refuses a past-due subscription', async () => {
      mockFindByUserId.mockResolvedValue({
        ...paidSubscription,
        status: 'past_due',
        isActive: () => false,
      });

      await request(app)
        .post('/api/billing/change-plan')
        .send({ plan: 'premium', billingCycle: 'monthly', confirmed: true })
        .expect(409);

      expect(mockStoreClient.changePlan).not.toHaveBeenCalled();
    });

    it('refuses free and enterprise as targets', async () => {
      mockFindByUserId.mockResolvedValue(paidSubscription);

      await request(app)
        .post('/api/billing/change-plan')
        .send({ plan: 'free', billingCycle: 'monthly', confirmed: true })
        .expect(400);
      await request(app)
        .post('/api/billing/change-plan')
        .send({ plan: 'enterprise', billingCycle: 'monthly', confirmed: true })
        .expect(400);

      expect(mockStoreClient.changePlan).not.toHaveBeenCalled();
    });

    it('refuses a change to the plan and cycle the subscription is already on', async () => {
      mockFindByUserId.mockResolvedValue(paidSubscription);

      await request(app)
        .post('/api/billing/change-plan')
        .send({ plan: 'starter', billingCycle: 'monthly', confirmed: true })
        .expect(400);

      expect(mockStoreClient.changePlan).not.toHaveBeenCalled();
    });

    it('lets the store decide when the change applies: no effective is sent', async () => {
      mockFindByUserId.mockResolvedValueOnce(paidSubscription).mockResolvedValueOnce({
        ...paidSubscription,
        plan: 'premium',
        effectivePlan: () => 'premium',
      });
      mockStoreClient.changePlan.mockResolvedValue({
        status: 'active',
        planKey: 'NOCTU-SCHOLARMANCY-PREMIUM-MONTHLY',
        pendingPlanKey: null,
        currentPeriodEnd: '2026-12-01T00:00:00.000Z',
        effective: 'now',
      });

      const res = await request(app)
        .post('/api/billing/change-plan')
        .send({ plan: 'premium', billingCycle: 'monthly', confirmed: true })
        .expect(200);

      expect(mockStoreClient.changePlan).toHaveBeenCalledWith('ns_sub_1', {
        plan: 'NOCTU-SCHOLARMANCY-PREMIUM-MONTHLY',
      });
      expect(mockUpdateSubscription).toHaveBeenCalledWith(
        'user-1',
        expect.objectContaining({
          plan: 'premium',
          billingCycle: 'monthly',
          currentPeriodEnd: new Date('2026-12-01T00:00:00.000Z'),
        })
      );
      expect(mockUserUpdateSubscription).toHaveBeenCalledWith('user-1', {
        plan: 'premium',
        status: 'active',
      });
      expect(res.body.effective).toBe('now');
      expect(res.body.pendingPlan).toBeUndefined();
      // The full subscription comes back, not a partial one.
      expect(res.body.subscription.plan).toBe('premium');
      expect(res.body.subscription.maxStudents).toBe(2);
      expect(res.body.subscription.featureLines).toEqual(
        expect.arrayContaining(['2 students', 'Advanced analytics'])
      );
      expect(res.body.subscription.canChangePlan).toBe(true);
    });

    it('applies a downgrade immediately when the store applied it now (Stripe)', async () => {
      const family = { ...paidSubscription, plan: 'family', effectivePlan: () => 'family' };
      mockFindByUserId
        .mockResolvedValueOnce(family)
        .mockResolvedValueOnce({ ...family, plan: 'premium', effectivePlan: () => 'premium' });
      mockStoreClient.changePlan.mockResolvedValue({ effective: 'now', pendingPlanKey: null });

      const res = await request(app)
        .post('/api/billing/change-plan')
        .send({ plan: 'premium', billingCycle: 'monthly', confirmed: true })
        .expect(200);

      expect(mockUpdateSubscription).toHaveBeenCalledWith(
        'user-1',
        expect.objectContaining({ plan: 'premium' })
      );
      expect(res.body.effective).toBe('now');
      expect(res.body.subscription.plan).toBe('premium');
    });

    it('keeps the paid plan until renewal when the store schedules the change', async () => {
      const family = { ...paidSubscription, plan: 'family', effectivePlan: () => 'family' };
      mockFindByUserId.mockResolvedValue(family);
      mockStoreClient.changePlan.mockResolvedValue({
        status: 'active',
        planKey: 'NOCTU-SCHOLARMANCY-FAMILY-MONTHLY',
        pendingPlanKey: 'NOCTU-SCHOLARMANCY-PREMIUM-MONTHLY',
        effective: 'next_period',
      });

      const res = await request(app)
        .post('/api/billing/change-plan')
        .send({ plan: 'premium', billingCycle: 'monthly', confirmed: true })
        .expect(200);

      expect(mockUpdateSubscription).not.toHaveBeenCalled();
      expect(mockUserUpdateSubscription).not.toHaveBeenCalled();
      expect(res.body.effective).toBe('next_period');
      expect(res.body.pendingPlan).toEqual({ plan: 'premium', billingCycle: 'monthly' });
      expect(res.body.subscription.plan).toBe('family');
      expect(res.body.subscription.effectivePlan).toBe('family');
      expect(res.body.subscription.maxStudents).toBe(5);
    });

    it('keeps the old period end when the store sends none or an unreadable one', async () => {
      mockFindByUserId.mockResolvedValue(paidSubscription);
      mockStoreClient.changePlan.mockResolvedValue({ currentPeriodEnd: 'not-a-date' });

      await request(app)
        .post('/api/billing/change-plan')
        .send({ plan: 'premium', billingCycle: 'monthly', confirmed: true })
        .expect(200);

      expect(mockUpdateSubscription).toHaveBeenCalledWith(
        'user-1',
        expect.objectContaining({ currentPeriodEnd: paidSubscription.currentPeriodEnd })
      );
    });

    it('does not update local subscription when the store fails, and hides the store text', async () => {
      mockFindByUserId.mockResolvedValue(paidSubscription);
      mockStoreClient.changePlan.mockRejectedValue(
        new ExternalServiceError('Store 422 CAPABILITY_UNSUPPORTED: This store changes plans', {
          status: 422,
          code: 'CAPABILITY_UNSUPPORTED',
        })
      );

      const res = await request(app)
        .post('/api/billing/change-plan')
        .send({ plan: 'premium', billingCycle: 'monthly', confirmed: true })
        .expect(502);

      const text = JSON.stringify(res.body);
      expect(text).toMatch(/could not change your plan/i);
      expect(text).not.toMatch(/CAPABILITY_UNSUPPORTED|Store 422/);
      expect(mockUpdateSubscription).not.toHaveBeenCalled();
      expect(mockUserUpdateSubscription).not.toHaveBeenCalled();
    });

    it('tells the buyer their card failed when the store answers 402', async () => {
      mockFindByUserId.mockResolvedValue(paidSubscription);
      mockStoreClient.changePlan.mockRejectedValue(
        new ExternalServiceError('Store 402 CARD_DECLINED: declined', {
          status: 402,
          code: 'CARD_DECLINED',
        })
      );

      const res = await request(app)
        .post('/api/billing/change-plan')
        .send({ plan: 'premium', billingCycle: 'monthly', confirmed: true })
        .expect(402);

      const text = JSON.stringify(res.body);
      expect(text).toMatch(/card could not be charged/i);
      expect(text).not.toMatch(/CARD_DECLINED/);
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
