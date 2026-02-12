import { MongoClient, type Db } from 'mongodb';
import { UserRepository } from './UserRepository';

describe('UserRepository Admin Methods', () => {
  let client: MongoClient;
  let database: Db;
  let repository: UserRepository;

  beforeAll(async () => {
    const uri = process.env['MONGODB_URI'] ?? 'mongodb://localhost:27017';
    client = new MongoClient(uri);
    await client.connect();
    database = client.db('scholaracle_test');
    repository = new UserRepository(database);
  });

  afterAll(async () => {
    await client.close();
  });

  beforeEach(async () => {
    await database.collection('users').deleteMany({});
  });

  describe('findWithPagination', () => {
    it('should find users with pagination', async () => {
      // Create multiple users
      for (let i = 0; i < 15; i++) {
        const passwordHash = await UserRepository.hashPassword('TestPass123!');
        await repository.create({
          email: `user${i}@test.com`,
          passwordHash,
          name: `User ${i}`,
        });
      }

      const page1 = await repository.findWithPagination({ page: 1, limit: 10 });
      expect(page1.data.length).toBe(10);
      expect(page1.total).toBe(15);
      expect(page1.page).toBe(1);
      expect(page1.totalPages).toBe(2);

      const page2 = await repository.findWithPagination({ page: 2, limit: 10 });
      expect(page2.data.length).toBe(5);
      expect(page2.page).toBe(2);
    });

    it('should filter by subscription plan', async () => {
      const passwordHash = await UserRepository.hashPassword('TestPass123!');
      await repository.create({
        email: 'premium@test.com',
        passwordHash,
        name: 'Premium User',
        subscription: { plan: 'premium', status: 'active' },
      });
      await repository.create({
        email: 'free@test.com',
        passwordHash,
        name: 'Free User',
        subscription: { plan: 'free', status: 'active' },
      });

      const result = await repository.findWithPagination({
        page: 1,
        limit: 10,
        filters: { 'subscription.plan': 'premium' },
      });

      expect(result.data.length).toBe(1);
      expect(result.data[0]?.email).toBe('premium@test.com');
    });
  });

  describe('searchUsers', () => {
    it('should search users by email', async () => {
      const passwordHash = await UserRepository.hashPassword('TestPass123!');
      await repository.create({
        email: 'john.doe@test.com',
        passwordHash,
        name: 'John Doe',
      });
      await repository.create({
        email: 'jane.smith@test.com',
        passwordHash,
        name: 'Jane Smith',
      });

      const results = await repository.searchUsers('john');

      expect(results.length).toBe(1);
      expect(results[0]?.email).toBe('john.doe@test.com');
    });

    it('should search users by name', async () => {
      const passwordHash = await UserRepository.hashPassword('TestPass123!');
      await repository.create({
        email: 'alice@test.com',
        passwordHash,
        name: 'Alice Johnson',
      });
      await repository.create({
        email: 'bob@test.com',
        passwordHash,
        name: 'Bob Williams',
      });

      const results = await repository.searchUsers('alice');

      expect(results.length).toBe(1);
      expect(results[0]?.name).toBe('Alice Johnson');
    });
  });

  describe('suspendUser', () => {
    it('should suspend user', async () => {
      const passwordHash = await UserRepository.hashPassword('TestPass123!');
      const user = await repository.create({
        email: 'suspend@test.com',
        passwordHash,
        name: 'Suspend User',
      });

      const isSuccess = await repository.suspendUser(user._id!.toString(), 'Violation of terms');

      expect(isSuccess).toBe(true);
      const updated = await repository.findById(user._id!.toString());
      expect(updated).not.toBeNull();
      expect(updated?.isSuspended).toBe(true);
      expect(updated?.suspendedReason).toBe('Violation of terms');
    });
  });

  describe('unsuspendUser', () => {
    it('should unsuspend user', async () => {
      const passwordHash = await UserRepository.hashPassword('TestPass123!');
      const user = await repository.create({
        email: 'unsuspend@test.com',
        passwordHash,
        name: 'Unsuspend User',
      });

      await repository.suspendUser(user._id!.toString(), 'Test');
      const isSuccess = await repository.unsuspendUser(user._id!.toString());

      expect(isSuccess).toBe(true);
    });
  });

  describe('getUserStatistics', () => {
    it('should get user statistics', async () => {
      const passwordHash = await UserRepository.hashPassword('TestPass123!');
      await repository.create({
        email: 'premium1@test.com',
        passwordHash,
        name: 'Premium 1',
        subscription: { plan: 'premium', status: 'active' },
      });
      await repository.create({
        email: 'premium2@test.com',
        passwordHash,
        name: 'Premium 2',
        subscription: { plan: 'premium', status: 'active' },
      });
      await repository.create({
        email: 'free1@test.com',
        passwordHash,
        name: 'Free 1',
        subscription: { plan: 'free', status: 'active' },
      });

      const stats = await repository.getUserStatistics();

      expect(stats.totalUsers).toBeGreaterThanOrEqual(3);
      expect(stats.byPlan).toBeDefined();
    });
  });
});
