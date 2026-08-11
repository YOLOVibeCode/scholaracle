import request from 'supertest';
import express, { type Express } from 'express';
import { MongoClient, type Db } from 'mongodb';
import { subscriptionsRouter } from './subscriptions';
import { SubscriptionRepository, UserRepository } from '@scholaracle/database';
import { createTestAdmin } from '../../../test-utils/admin-test-helper';
import { createErrorHandler } from '../../../middleware/errorHandler';

describe('Admin Subscription Routes', () => {
  let app: Express;
  let client: MongoClient;
  let database: Db;
  let adminToken: string;
  let testUserId: string;

  beforeAll(async () => {
    const uri = process.env['MONGODB_URI'] ?? 'mongodb://localhost:27017';
    client = new MongoClient(uri);
    await client.connect();
    database = client.db('scholaracle_test');

    const { token } = await createTestAdmin(database, 'test-secret', {
      email: 'sub-admin@test.com',
      password: 'AdminPass123!',
      name: 'Subscription Admin',
      role: 'admin',
    });
    adminToken = token;

    // Create test user
    const userPasswordHash = await UserRepository.hashPassword('TestPass123!');
    const user = await new UserRepository(database).create({
      email: 'subuser@test.com',
      passwordHash: userPasswordHash,
      name: 'Sub User',
    });
    testUserId = user._id!.toString();

    app = express();
    app.use(express.json());
    app.use(
      '/api/admin/subscriptions',
      subscriptionsRouter({ database, jwtSecret: 'test-secret' })
    );
    app.use(createErrorHandler());
  });

  afterAll(async () => {
    await client.close();
  });

  beforeEach(async () => {
    await database.collection('subscriptions').deleteMany({});
  });

  describe('GET /api/admin/subscriptions', () => {
    it('should list all subscriptions', async () => {
      await new SubscriptionRepository(database).create({
        userId: testUserId,
        plan: 'premium',
        status: 'active',
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        billingCycle: 'monthly',
      });

      const response = await request(app)
        .get('/api/admin/subscriptions')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
    });

    it('should filter by status', async () => {
      await new SubscriptionRepository(database).create({
        userId: testUserId,
        plan: 'premium',
        status: 'active',
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        billingCycle: 'monthly',
      });

      const response = await request(app)
        .get('/api/admin/subscriptions?status=active')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data.length).toBeGreaterThan(0);
    });
  });

  describe('GET /api/admin/subscriptions/:id', () => {
    it('should get subscription details', async () => {
      const sub = await new SubscriptionRepository(database).create({
        userId: testUserId,
        plan: 'premium',
        status: 'active',
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        billingCycle: 'monthly',
      });

      const response = await request(app)
        .get(`/api/admin/subscriptions/${sub._id!.toString()}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.plan).toBe('premium');
    });
  });

  describe('PUT /api/admin/subscriptions/:id/plan', () => {
    it('should change subscription plan', async () => {
      await new SubscriptionRepository(database).create({
        userId: testUserId,
        plan: 'starter',
        status: 'active',
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        billingCycle: 'monthly',
      });

      const response = await request(app)
        .put(`/api/admin/subscriptions/${testUserId}/plan`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ plan: 'premium' });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.plan).toBe('premium');
    });
  });

  describe('POST /api/admin/subscriptions/:id/cancel', () => {
    it('should cancel subscription', async () => {
      await new SubscriptionRepository(database).create({
        userId: testUserId,
        plan: 'premium',
        status: 'active',
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        billingCycle: 'monthly',
      });

      const response = await request(app)
        .post(`/api/admin/subscriptions/${testUserId}/cancel`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ reason: 'Customer request' });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });
  });

  describe('POST /api/admin/subscriptions/:id/reactivate', () => {
    it('should reactivate subscription', async () => {
      await new SubscriptionRepository(database).create({
        userId: testUserId,
        plan: 'premium',
        status: 'cancelled',
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        billingCycle: 'monthly',
        cancelledAt: new Date(),
      });

      const response = await request(app)
        .post(`/api/admin/subscriptions/${testUserId}/reactivate`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });
  });

  describe('POST /api/admin/subscriptions/:id/extend-trial', () => {
    it('should extend trial period', async () => {
      await new SubscriptionRepository(database).create({
        userId: testUserId,
        plan: 'starter',
        status: 'trialing',
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        billingCycle: 'monthly',
      });

      const response = await request(app)
        .post(`/api/admin/subscriptions/${testUserId}/extend-trial`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ days: 7, reason: 'Support extension' });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    it('should require reason', async () => {
      await new SubscriptionRepository(database).create({
        userId: testUserId,
        plan: 'starter',
        status: 'trialing',
        currentPeriodStart: new Date(),
        currentPeriodEnd: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        billingCycle: 'monthly',
      });

      const response = await request(app)
        .post(`/api/admin/subscriptions/${testUserId}/extend-trial`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ days: 7 });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('reason');
      expect(response.body.code).toBe('VALIDATION_ERROR');
    });
  });
});
