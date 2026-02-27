import { MongoClient, type Db } from 'mongodb';
import { ExportService } from './ExportService';
import { UserRepository } from '@scholaracle/database';

describe('ExportService', () => {
  let client: MongoClient;
  let database: Db;
  let exportService: ExportService;
  let userRepository: UserRepository;

  beforeAll(async () => {
    const uri = process.env['MONGODB_URI'] ?? 'mongodb://localhost:27017';
    client = new MongoClient(uri);
    await client.connect();
    database = client.db('scholaracle_test');
    userRepository = new UserRepository(database);
    exportService = new ExportService(database);
  });

  afterAll(async () => {
    await client.close();
  });

  beforeEach(async () => {
    await database.collection('users').deleteMany({});
    await database.collection('payments').deleteMany({});
  });

  describe('exportCustomers', () => {
    it('should export customers to CSV', async () => {
      const passwordHash = await UserRepository.hashPassword('TestPass123!');
      await userRepository.create({
        email: 'export1@test.com',
        passwordHash,
        name: 'Export User 1',
        subscription: { plan: 'premium', status: 'active' },
      });
      await userRepository.create({
        email: 'export2@test.com',
        passwordHash,
        name: 'Export User 2',
        subscription: { plan: 'free', status: 'active' },
      });

      const csv = await exportService.exportCustomers();

      expect(csv).toBeDefined();
      expect(typeof csv).toBe('string');
      expect(csv).toContain('Email');
      expect(csv).toContain('Name');
      expect(csv).toContain('export1@test.com');
      expect(csv).toContain('export2@test.com');
    });

    it('should export customers with date filters', async () => {
      const passwordHash = await UserRepository.hashPassword('TestPass123!');

      // Create user now (will have current date)
      await userRepository.create({
        email: 'filtered@test.com',
        passwordHash,
        name: 'Filtered User',
        subscription: { plan: 'premium', status: 'active' },
      });

      // Use date range that includes today
      const startDate = new Date();
      startDate.setMonth(startDate.getMonth() - 1);
      const endDate = new Date();
      endDate.setMonth(endDate.getMonth() + 1);

      const csv = await exportService.exportCustomers(startDate, endDate);

      expect(csv).toBeDefined();
      expect(csv).toContain('filtered@test.com');
    });
  });

  describe('exportPayments', () => {
    it('should export payments to CSV', async () => {
      // Create payment records
      await database.collection('payments').insertOne({
        userId: '507f1f77bcf86cd799439011',
        amount: 1900, // $19.00 in cents
        currency: 'usd',
        status: 'succeeded',
        paymentMethod: 'card',
        createdAt: new Date(),
      });

      const csv = await exportService.exportPayments();

      expect(csv).toBeDefined();
      expect(typeof csv).toBe('string');
      expect(csv).toContain('Amount');
      expect(csv).toContain('Status');
    });

    it('should export payments with date filters', async () => {
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-31');

      await database.collection('payments').insertOne({
        userId: '507f1f77bcf86cd799439011',
        amount: 1900,
        currency: 'usd',
        status: 'succeeded',
        paymentMethod: 'card',
        createdAt: new Date('2024-01-15'),
      });

      const csv = await exportService.exportPayments(startDate, endDate);

      expect(csv).toBeDefined();
    });
  });

  describe('exportSubscriptions', () => {
    it('should export subscriptions to CSV', async () => {
      const passwordHash = await UserRepository.hashPassword('TestPass123!');
      await userRepository.create({
        email: 'subexport@test.com',
        passwordHash,
        name: 'Sub Export User',
        subscription: { plan: 'premium', status: 'active' },
      });

      const csv = await exportService.exportSubscriptions();

      expect(csv).toBeDefined();
      expect(typeof csv).toBe('string');
      expect(csv).toContain('User Email');
      expect(csv).toContain('Plan');
      expect(csv).toContain('Status');
    });
  });
});
