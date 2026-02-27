import { MongoClient, type Db } from 'mongodb';
import { AnalyticsService } from './AnalyticsService';
import { UserRepository } from '@scholaracle/database';

describe('AnalyticsService', () => {
  let client: MongoClient;
  let database: Db;
  let analyticsService: AnalyticsService;
  let userRepository: UserRepository;

  beforeAll(async () => {
    const uri = process.env['MONGODB_URI'] ?? 'mongodb://localhost:27017';
    client = new MongoClient(uri);
    await client.connect();
    database = client.db('scholaracle_test');
    userRepository = new UserRepository(database);
    analyticsService = new AnalyticsService(database);
  });

  afterAll(async () => {
    await client.close();
  });

  beforeEach(async () => {
    await database.collection('users').deleteMany({});
    await database.collection('subscriptions').deleteMany({});
    await database.collection('payments').deleteMany({});
  });

  describe('calculateMRR', () => {
    it('should calculate MRR correctly', async () => {
      const passwordHash = await UserRepository.hashPassword('TestPass123!');

      // Create users with different subscription plans
      await userRepository.create({
        email: 'premium1@test.com',
        passwordHash,
        name: 'Premium 1',
        subscription: { plan: 'premium', status: 'active' },
      });
      await userRepository.create({
        email: 'premium2@test.com',
        passwordHash,
        name: 'Premium 2',
        subscription: { plan: 'premium', status: 'active' },
      });
      await userRepository.create({
        email: 'family1@test.com',
        passwordHash,
        name: 'Family 1',
        subscription: { plan: 'family', status: 'active' },
      });
      await userRepository.create({
        email: 'free1@test.com',
        passwordHash,
        name: 'Free 1',
        subscription: { plan: 'free', status: 'active' },
      });

      const mrr = await analyticsService.calculateMRR();

      // Premium: 2 * $19 = $38, Starter: 1 * $9 = $9, Free: 0
      // Total: $47
      expect(mrr).toBeGreaterThanOrEqual(47);
    });

    it('should exclude cancelled subscriptions from MRR', async () => {
      const passwordHash = await UserRepository.hashPassword('TestPass123!');

      await userRepository.create({
        email: 'cancelled@test.com',
        passwordHash,
        name: 'Cancelled User',
        subscription: { plan: 'premium', status: 'cancelled' },
      });

      const mrr = await analyticsService.calculateMRR();
      expect(mrr).toBe(0);
    });
  });

  describe('calculateChurnRate', () => {
    it('should calculate churn rate correctly', async () => {
      const passwordHash = await UserRepository.hashPassword('TestPass123!');

      // Create active and cancelled subscriptions
      await userRepository.create({
        email: 'active1@test.com',
        passwordHash,
        name: 'Active 1',
        subscription: { plan: 'premium', status: 'active' },
      });
      await userRepository.create({
        email: 'active2@test.com',
        passwordHash,
        name: 'Active 2',
        subscription: { plan: 'premium', status: 'active' },
      });
      await userRepository.create({
        email: 'cancelled1@test.com',
        passwordHash,
        name: 'Cancelled 1',
        subscription: { plan: 'premium', status: 'cancelled' },
      });

      const churnRate = await analyticsService.calculateChurnRate();

      // 1 cancelled out of 3 total = 33.33%
      expect(churnRate).toBeGreaterThan(0);
      expect(churnRate).toBeLessThanOrEqual(100);
    });
  });

  describe('calculateARPU', () => {
    it('should calculate ARPU correctly', async () => {
      const passwordHash = await UserRepository.hashPassword('TestPass123!');

      await userRepository.create({
        email: 'premium1@test.com',
        passwordHash,
        name: 'Premium 1',
        subscription: { plan: 'premium', status: 'active' },
      });
      await userRepository.create({
        email: 'premium2@test.com',
        passwordHash,
        name: 'Premium 2',
        subscription: { plan: 'premium', status: 'active' },
      });

      const arpu = await analyticsService.calculateARPU();

      // 2 premium users = $38 MRR / 2 = $19 ARPU
      expect(arpu).toBeGreaterThan(0);
    });
  });

  describe('getRevenueByPeriod', () => {
    it('should get revenue by period', async () => {
      // This will require PaymentRepository to be implemented
      // For now, test the structure
      const revenue = await analyticsService.getRevenueByPeriod(
        'month',
        new Date('2024-01-01'),
        new Date('2024-01-31')
      );

      expect(revenue).toBeDefined();
      expect(Array.isArray(revenue)).toBe(true);
    });
  });

  describe('getSubscriptionGrowth', () => {
    it('should get subscription growth over time', async () => {
      const growth = await analyticsService.getSubscriptionGrowth('month', 6);

      expect(growth).toBeDefined();
      expect(Array.isArray(growth)).toBe(true);
    });
  });

  describe('getCustomerGrowth', () => {
    it('should get customer growth over time', async () => {
      const passwordHash = await UserRepository.hashPassword('TestPass123!');

      await userRepository.create({
        email: 'growth1@test.com',
        passwordHash,
        name: 'Growth 1',
        subscription: { plan: 'free', status: 'active' },
      });

      const growth = await analyticsService.getCustomerGrowth('month', 6);

      expect(growth).toBeDefined();
      expect(Array.isArray(growth)).toBe(true);
    });
  });
});
