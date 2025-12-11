import request from 'supertest';
import express, { type Express } from 'express';
import { MongoClient, type Db } from 'mongodb';
import { analyticsRouter } from './analytics';
import { AdminAuthService } from '@scholaracle/auth';
import { AdminUserRepository } from '@scholaracle/database';

describe('Admin Analytics Routes', () => {
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
      email: 'analytics-admin@test.com',
      passwordHash,
      name: 'Analytics Admin',
      role: 'analyst',
    });

    const adminAuthService = new AdminAuthService(database, 'test-secret');
    const loginResult = await adminAuthService.login('analytics-admin@test.com', 'AdminPass123!');
    
    if (!loginResult.success || !loginResult.token) {
      throw new Error('Failed to login admin user');
    }
    
    adminToken = loginResult.token;

    app = express();
    app.use(express.json());
    app.use('/api/admin/analytics', analyticsRouter({ database, jwtSecret: 'test-secret' }));
  });

  afterAll(async () => {
    await client.close();
  });

  beforeEach(async () => {
    await database.collection('users').deleteMany({});
    await database.collection('payments').deleteMany({});
  });

  describe('GET /api/admin/analytics/overview', () => {
    it('should return overview analytics', async () => {
      const response = await request(app)
        .get('/api/admin/analytics/overview')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeDefined();
      expect(response.body.data.mrr).toBeDefined();
      expect(response.body.data.churnRate).toBeDefined();
      expect(response.body.data.arpu).toBeDefined();
    });

    it('should require authentication', async () => {
      const response = await request(app).get('/api/admin/analytics/overview');

      expect(response.status).toBe(401);
    });
  });

  describe('GET /api/admin/analytics/revenue', () => {
    it('should return revenue data', async () => {
      const response = await request(app)
        .get('/api/admin/analytics/revenue')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
    });

    it('should accept date range parameters', async () => {
      const startDate = new Date('2024-01-01').toISOString();
      const endDate = new Date('2024-01-31').toISOString();

      const response = await request(app)
        .get(`/api/admin/analytics/revenue?startDate=${startDate}&endDate=${endDate}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });
  });

  describe('GET /api/admin/analytics/customers', () => {
    it('should return customer growth data', async () => {
      const response = await request(app)
        .get('/api/admin/analytics/customers')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
    });
  });

  describe('GET /api/admin/analytics/subscriptions', () => {
    it('should return subscription growth data', async () => {
      const response = await request(app)
        .get('/api/admin/analytics/subscriptions')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
    });
  });

  describe('GET /api/admin/analytics/churn', () => {
    it('should return churn rate', async () => {
      const response = await request(app)
        .get('/api/admin/analytics/churn')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.churnRate).toBeDefined();
    });
  });
});

