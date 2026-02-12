import { Subscription, PLAN_PRICING, PLAN_FEATURES } from './Subscription';
import type { ObjectId } from 'mongodb';

describe('Subscription', () => {
  const makeRequiredData = (overrides = {}) => ({
    userId: 'user-123',
    plan: 'premium' as const,
    status: 'active' as const,
    currentPeriodStart: new Date('2024-01-01'),
    currentPeriodEnd: new Date('2024-02-01'),
    billingCycle: 'monthly' as const,
    ...overrides,
  });

  describe('constructor', () => {
    it('should create subscription with required fields', () => {
      // Arrange
      const data = makeRequiredData();

      // Act
      const sub = new Subscription(data);

      // Assert
      expect(sub.userId).toBe('user-123');
      expect(sub.plan).toBe('premium');
      expect(sub.status).toBe('active');
      expect(sub.currentPeriodStart).toEqual(new Date('2024-01-01'));
      expect(sub.currentPeriodEnd).toEqual(new Date('2024-02-01'));
      expect(sub.billingCycle).toBe('monthly');
    });

    it('should set cancelAtPeriodEnd to false by default', () => {
      // Arrange
      const data = makeRequiredData();

      // Act
      const sub = new Subscription(data);

      // Assert
      expect(sub.cancelAtPeriodEnd).toBe(false);
    });

    it('should set events to empty array by default', () => {
      // Arrange
      const data = makeRequiredData();

      // Act
      const sub = new Subscription(data);

      // Assert
      expect(sub.events).toEqual([]);
    });

    it('should set createdAt to current date', () => {
      // Arrange
      const before = new Date();
      const data = makeRequiredData();

      // Act
      const sub = new Subscription(data);
      const after = new Date();

      // Assert
      expect(sub.createdAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(sub.createdAt.getTime()).toBeLessThanOrEqual(after.getTime());
    });

    it('should set updatedAt to current date', () => {
      // Arrange
      const before = new Date();
      const data = makeRequiredData();

      // Act
      const sub = new Subscription(data);
      const after = new Date();

      // Assert
      expect(sub.updatedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(sub.updatedAt.getTime()).toBeLessThanOrEqual(after.getTime());
    });

    it('should use provided cancelAtPeriodEnd value', () => {
      // Arrange
      const data = makeRequiredData({ cancelAtPeriodEnd: true });

      // Act
      const sub = new Subscription(data);

      // Assert
      expect(sub.cancelAtPeriodEnd).toBe(true);
    });

    it('should use provided events', () => {
      // Arrange
      const events = [
        { type: 'created' as const, timestamp: new Date('2024-01-01') },
        {
          type: 'upgraded' as const,
          fromPlan: 'starter' as const,
          toPlan: 'premium' as const,
          timestamp: new Date('2024-02-01'),
        },
      ];
      const data = makeRequiredData({ events });

      // Act
      const sub = new Subscription(data);

      // Assert
      expect(sub.events).toEqual(events);
    });

    it('should use provided createdAt and updatedAt', () => {
      // Arrange
      const createdAt = new Date('2024-01-01');
      const updatedAt = new Date('2024-06-01');
      const data = makeRequiredData({ createdAt, updatedAt });

      // Act
      const sub = new Subscription(data);

      // Assert
      expect(sub.createdAt).toEqual(createdAt);
      expect(sub.updatedAt).toEqual(updatedAt);
    });

    it('should use provided optional fields', () => {
      // Arrange
      const data = makeRequiredData({
        priceId: 'price_abc123',
        trialStart: new Date('2024-01-01'),
        trialEnd: new Date('2024-01-15'),
        cancelledAt: new Date('2024-03-01'),
        cancellationReason: 'Too expensive',
        lastPaymentDate: new Date('2024-01-01'),
        lastPaymentAmount: 19,
        nextPaymentDate: new Date('2024-02-01'),
        nextPaymentAmount: 19,
        stripeSubscriptionId: 'sub_abc123',
        stripeCustomerId: 'cus_abc123',
      });

      // Act
      const sub = new Subscription(data);

      // Assert
      expect(sub.priceId).toBe('price_abc123');
      expect(sub.trialStart).toEqual(new Date('2024-01-01'));
      expect(sub.trialEnd).toEqual(new Date('2024-01-15'));
      expect(sub.cancelledAt).toEqual(new Date('2024-03-01'));
      expect(sub.cancellationReason).toBe('Too expensive');
      expect(sub.lastPaymentDate).toEqual(new Date('2024-01-01'));
      expect(sub.lastPaymentAmount).toBe(19);
      expect(sub.nextPaymentDate).toEqual(new Date('2024-02-01'));
      expect(sub.nextPaymentAmount).toBe(19);
      expect(sub.stripeSubscriptionId).toBe('sub_abc123');
      expect(sub.stripeCustomerId).toBe('cus_abc123');
    });

    it('should accept ObjectId for _id', () => {
      // Arrange
      const mockId = { toString: () => 'sub-123' } as unknown as ObjectId;
      const data = makeRequiredData();

      // Act
      const sub = new Subscription(data, mockId);

      // Assert
      expect(sub._id).toBe(mockId);
    });
  });

  describe('isActive', () => {
    it('should return true for active status', () => {
      // Arrange
      const sub = new Subscription(makeRequiredData({ status: 'active' }));

      // Act & Assert
      expect(sub.isActive()).toBe(true);
    });

    it('should return true for trialing status', () => {
      // Arrange
      const sub = new Subscription(makeRequiredData({ status: 'trialing' }));

      // Act & Assert
      expect(sub.isActive()).toBe(true);
    });

    it('should return false for cancelled status', () => {
      // Arrange
      const sub = new Subscription(makeRequiredData({ status: 'cancelled' }));

      // Act & Assert
      expect(sub.isActive()).toBe(false);
    });

    it('should return false for expired status', () => {
      // Arrange
      const sub = new Subscription(makeRequiredData({ status: 'expired' }));

      // Act & Assert
      expect(sub.isActive()).toBe(false);
    });

    it('should return false for past_due status', () => {
      // Arrange
      const sub = new Subscription(makeRequiredData({ status: 'past_due' }));

      // Act & Assert
      expect(sub.isActive()).toBe(false);
    });
  });

  describe('isTrialing', () => {
    it('should return true when trialing with future trialEnd', () => {
      // Arrange
      const futureDate = new Date();
      futureDate.setFullYear(futureDate.getFullYear() + 1);
      const sub = new Subscription(
        makeRequiredData({
          status: 'trialing',
          trialEnd: futureDate,
        })
      );

      // Act & Assert
      expect(sub.isTrialing()).toBe(true);
    });

    it('should return false when trialing with past trialEnd', () => {
      // Arrange
      const sub = new Subscription(
        makeRequiredData({
          status: 'trialing',
          trialEnd: new Date('2020-01-01'),
        })
      );

      // Act & Assert
      expect(sub.isTrialing()).toBe(false);
    });

    it('should return false when active even with future trialEnd', () => {
      // Arrange
      const futureDate = new Date();
      futureDate.setFullYear(futureDate.getFullYear() + 1);
      const sub = new Subscription(
        makeRequiredData({
          status: 'active',
          trialEnd: futureDate,
        })
      );

      // Act & Assert
      expect(sub.isTrialing()).toBe(false);
    });

    it('should return false when trialing without trialEnd', () => {
      // Arrange
      const sub = new Subscription(makeRequiredData({ status: 'trialing' }));

      // Act & Assert
      expect(sub.isTrialing()).toBe(false);
    });
  });

  describe('getDaysUntilRenewal', () => {
    it('should return positive days for future period end', () => {
      // Arrange
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 30);
      const sub = new Subscription(makeRequiredData({ currentPeriodEnd: futureDate }));

      // Act
      const days = sub.getDaysUntilRenewal();

      // Assert
      expect(days).toBe(30);
    });

    it('should return negative days for past period end', () => {
      // Arrange
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 5);
      const sub = new Subscription(makeRequiredData({ currentPeriodEnd: pastDate }));

      // Act
      const days = sub.getDaysUntilRenewal();

      // Assert
      expect(days).toBeLessThanOrEqual(-4);
    });
  });

  describe('getMRR', () => {
    it('should return monthly price for active monthly subscription', () => {
      // Arrange
      const sub = new Subscription(
        makeRequiredData({ plan: 'premium', billingCycle: 'monthly', status: 'active' })
      );

      // Act & Assert
      expect(sub.getMRR()).toBe(PLAN_PRICING.premium.monthly);
    });

    it('should return annual price divided by 12 for active annual subscription', () => {
      // Arrange
      const sub = new Subscription(
        makeRequiredData({ plan: 'premium', billingCycle: 'annual', status: 'active' })
      );

      // Act & Assert
      expect(sub.getMRR()).toBeCloseTo(PLAN_PRICING.premium.annual / 12);
    });

    it('should return 0 for non-active subscription', () => {
      // Arrange
      const sub = new Subscription(makeRequiredData({ plan: 'premium', status: 'cancelled' }));

      // Act & Assert
      expect(sub.getMRR()).toBe(0);
    });

    it('should return 0 for free plan', () => {
      // Arrange
      const sub = new Subscription(makeRequiredData({ plan: 'free', status: 'active' }));

      // Act & Assert
      expect(sub.getMRR()).toBe(0);
    });
  });

  describe('getFeatures', () => {
    it('should return correct features for free plan', () => {
      // Arrange
      const sub = new Subscription(makeRequiredData({ plan: 'free' }));

      // Act & Assert
      expect(sub.getFeatures()).toEqual(PLAN_FEATURES.free);
    });

    it('should return correct features for premium plan', () => {
      // Arrange
      const sub = new Subscription(makeRequiredData({ plan: 'premium' }));

      // Act & Assert
      expect(sub.getFeatures()).toEqual(PLAN_FEATURES.premium);
    });

    it('should return correct features for enterprise plan', () => {
      // Arrange
      const sub = new Subscription(makeRequiredData({ plan: 'enterprise' }));

      // Act & Assert
      expect(sub.getFeatures()).toEqual(PLAN_FEATURES.enterprise);
    });
  });
});
