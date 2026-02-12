import { MongoClient, type Db } from 'mongodb';
import { SubscriptionRepository } from './SubscriptionRepository';
import { Subscription, type ISubscriptionData } from '../../models/Subscription';

describe('SubscriptionRepository', () => {
  let client: MongoClient;
  let database: Db;
  let repository: SubscriptionRepository;

  beforeAll(async () => {
    const uri = process.env['MONGODB_URI'] ?? 'mongodb://localhost:27017';
    client = new MongoClient(uri);
    await client.connect();
    database = client.db('scholaracle_test');
    repository = new SubscriptionRepository(database);
  });

  afterAll(async () => {
    await client.close();
  });

  beforeEach(async () => {
    await database.collection('subscriptions').deleteMany({});
  });

  describe('create', () => {
    it('should create subscription', async () => {
      const subData: ISubscriptionData = {
        userId: '507f1f77bcf86cd799439011',
        plan: 'premium',
        status: 'active',
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        billingCycle: 'monthly',
      };

      const subscription = await repository.create(subData);

      expect(subscription).toBeInstanceOf(Subscription);
      expect(subscription.plan).toBe('premium');
      expect(subscription._id).toBeDefined();
    });
  });

  describe('findByUserId', () => {
    it('should find subscription by user id', async () => {
      const userId = '507f1f77bcf86cd799439011';
      await repository.create({
        userId,
        plan: 'premium',
        status: 'active',
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        billingCycle: 'monthly',
      });

      const subscription = await repository.findByUserId(userId);

      expect(subscription).not.toBeNull();
      expect(subscription?.userId).toBe(userId);
    });

    it('should return null when subscription not found', async () => {
      const subscription = await repository.findByUserId('507f1f77bcf86cd799439099');
      expect(subscription).toBeNull();
    });
  });

  describe('changePlan', () => {
    it('should change plan', async () => {
      const userId = '507f1f77bcf86cd799439011';
      await repository.create({
        userId,
        plan: 'starter',
        status: 'active',
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        billingCycle: 'monthly',
      });

      const updated = await repository.changePlan(userId, 'premium', '507f1f77bcf86cd799439012');

      expect(updated).not.toBeNull();
      expect(updated?.plan).toBe('premium');
      expect(updated?.events.length).toBeGreaterThan(0);
    });
  });

  describe('cancel', () => {
    it('should cancel subscription', async () => {
      const userId = '507f1f77bcf86cd799439011';
      await repository.create({
        userId,
        plan: 'premium',
        status: 'active',
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        billingCycle: 'monthly',
      });

      const isSuccess = await repository.cancel(userId, 'User request');

      expect(isSuccess).toBe(true);
      const subscription = await repository.findByUserId(userId);
      expect(subscription?.status).toBe('cancelled');
    });
  });

  describe('reactivate', () => {
    it('should reactivate subscription', async () => {
      const userId = '507f1f77bcf86cd799439011';
      await repository.create({
        userId,
        plan: 'premium',
        status: 'cancelled',
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        billingCycle: 'monthly',
        cancelledAt: new Date(),
      });

      const isSuccess = await repository.reactivate(userId);

      expect(isSuccess).toBe(true);
      const subscription = await repository.findByUserId(userId);
      expect(subscription?.status).toBe('active');
    });
  });

  describe('getExpiringSubscriptions', () => {
    it('should get expiring subscriptions', async () => {
      // Create subscription expiring in 5 days
      await repository.create({
        userId: '507f1f77bcf86cd799439011',
        plan: 'premium',
        status: 'active',
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
        billingCycle: 'monthly',
      });

      const expiring = await repository.getExpiringSubscriptions(7);

      expect(expiring.length).toBeGreaterThanOrEqual(1);
    });
  });
});
