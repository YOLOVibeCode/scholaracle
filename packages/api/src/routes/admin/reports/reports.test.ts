import request from 'supertest';
import express, { type Express } from 'express';
import { MongoClient, type Db } from 'mongodb';
import { reportsRouter } from './reports';
import { AdminAuthService } from '@scholaracle/auth';
import { AdminUserRepository } from '@scholaracle/database';
import { UserRepository } from '@scholaracle/database';

describe('Admin Reports Routes', () => {
  let app: Express;
  let client: MongoClient;
  let database: Db;
  let adminToken: string;

  beforeAll(async () => {
    const uri = process.env['MONGODB_URI'] ?? 'mongodb://localhost:27017';
    client = new MongoClient(uri);
    await client.connect();
    database = client.db('scholaracle_test');

    // Create admin user and get token
    const passwordHash = await AdminUserRepository.hashPassword('AdminPass123!');
    await new AdminUserRepository(database).create({
      email: 'reports-admin@test.com',
      passwordHash,
      name: 'Reports Admin',
      role: 'analyst',
    });

    const adminAuthService = new AdminAuthService(database, 'test-secret');
    const loginResult = await adminAuthService.login('reports-admin@test.com', 'AdminPass123!');
    
    if (!loginResult.success || !loginResult.token) {
      throw new Error('Failed to login admin user');
    }
    
    adminToken = loginResult.token;

    app = express();
    app.use(express.json());
    app.use('/api/admin/reports', reportsRouter({ database, jwtSecret: 'test-secret' }));
  });

  afterAll(async () => {
    await client.close();
  });

  beforeEach(async () => {
    await database.collection('users').deleteMany({});
    await database.collection('payments').deleteMany({});
  });

  describe('GET /api/admin/reports/export/customers', () => {
    it('should export customers CSV', async () => {
      const passwordHash = await UserRepository.hashPassword('TestPass123!');
      await new UserRepository(database).create({
        email: 'export@test.com',
        passwordHash,
        name: 'Export User',
        subscription: { plan: 'premium', status: 'active' },
      });

      const response = await request(app)
        .get('/api/admin/reports/export/customers')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toContain('text/csv');
      expect(response.headers['content-disposition']).toContain('customers.csv');
      expect(response.text).toContain('Email');
      expect(response.text).toContain('export@test.com');
    });

    it('should require authentication', async () => {
      const response = await request(app).get('/api/admin/reports/export/customers');

      expect(response.status).toBe(401);
    });
  });

  describe('GET /api/admin/reports/export/payments', () => {
    it('should export payments CSV', async () => {
      await database.collection('payments').insertOne({
        userId: '507f1f77bcf86cd799439011',
        amount: 1900,
        currency: 'usd',
        status: 'succeeded',
        paymentMethod: 'card',
        createdAt: new Date(),
      });

      const response = await request(app)
        .get('/api/admin/reports/export/payments')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toContain('text/csv');
      expect(response.headers['content-disposition']).toContain('payments.csv');
    });
  });

  describe('GET /api/admin/reports/export/subscriptions', () => {
    it('should export subscriptions CSV', async () => {
      const passwordHash = await UserRepository.hashPassword('TestPass123!');
      await new UserRepository(database).create({
        email: 'subexport@test.com',
        passwordHash,
        name: 'Sub Export User',
        subscription: { plan: 'premium', status: 'active' },
      });

      const response = await request(app)
        .get('/api/admin/reports/export/subscriptions')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toContain('text/csv');
      expect(response.headers['content-disposition']).toContain('subscriptions.csv');
      expect(response.text).toContain('User Email');
    });
  });
});

