import request from 'supertest';
import express, { type Express } from 'express';
import { MongoClient, ObjectId, type Db } from 'mongodb';
import { invoicesRouter } from './invoices';
import { AdminStepUpChallengeRepository, PaymentRepository } from '@scholaracle/database';
import { adminAuthRouter } from '../auth/auth';
import { createTestAdmin } from '../../../test-utils/admin-test-helper';
import { createErrorHandler } from '../../../middleware/errorHandler';

describe('Admin Invoice Routes', () => {
  let app: Express;
  let client: MongoClient;
  let database: Db;
  let adminToken: string;

  beforeAll(async () => {
    const uri = process.env['MONGODB_URI'] ?? 'mongodb://localhost:27017';
    client = new MongoClient(uri);
    await client.connect();
    database = client.db('scholaracle_test');

    const adminResult = await createTestAdmin(database, 'test-secret', {
      email: 'invoice-admin@test.com',
      password: 'AdminPass123!',
      name: 'Invoice Admin',
      role: 'admin',
    });
    adminToken = adminResult.token;

    app = express();
    app.use(express.json());
    app.use(
      '/api/admin/auth',
      adminAuthRouter({
        database,
        jwtSecret: 'test-secret',
        stepUpChallengeStore: new AdminStepUpChallengeRepository(database),
      })
    );
    app.use('/api/admin/invoices', invoicesRouter({ database, jwtSecret: 'test-secret' }));
    app.use(createErrorHandler());
  });

  afterAll(async () => {
    await client.close();
  });

  beforeEach(async () => {
    await database.collection('payments').deleteMany({});
  });

  describe('POST /api/admin/invoices/:id/send', () => {
    it('should return 401 without admin token', async () => {
      const response = await request(app).post(`/api/admin/invoices/${new ObjectId()}/send`);

      expect(response.status).toBe(401);
    });

    it('should return 404 for non-existent invoice', async () => {
      const response = await request(app)
        .post(`/api/admin/invoices/${new ObjectId()}/send`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('not found');
      expect(response.body.code).toBe('NOT_FOUND');
    });

    it('should return success:false with skipped:true when no SendGrid key', async () => {
      const paymentRepo = new PaymentRepository(database);
      const payment = await paymentRepo.create({
        userId: '507f1f77bcf86cd799439011',
        amount: 999,
        currency: 'usd',
        status: 'succeeded',
        paymentMethod: 'card',
      });

      const response = await request(app)
        .post(`/api/admin/invoices/${payment._id!.toString()}/send`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(false);
      expect(response.body.skipped).toBe(true);
    });

    it('should return 200 with valid payment', async () => {
      const paymentRepo = new PaymentRepository(database);
      const payment = await paymentRepo.create({
        userId: '507f1f77bcf86cd799439011',
        amount: 2500,
        currency: 'usd',
        status: 'succeeded',
        paymentMethod: 'card',
      });

      const response = await request(app)
        .post(`/api/admin/invoices/${payment._id!.toString()}/send`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success');
      expect(response.body).toHaveProperty('skipped', true);
      expect(response.body).toHaveProperty('message');
    });
  });
});
