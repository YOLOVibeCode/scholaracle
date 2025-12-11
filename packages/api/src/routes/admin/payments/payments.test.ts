import request from 'supertest';
import express, { type Express } from 'express';
import { MongoClient, type Db } from 'mongodb';
import { paymentsRouter } from './payments';
import { AdminAuthService } from '@scholaracle/auth';
import { AdminUserRepository, PaymentRepository } from '@scholaracle/database';

describe('Admin Payment Routes', () => {
  let app: Express;
  let client: MongoClient;
  let database: Db;
  let adminToken: string;
  let billingAdminToken: string;

  beforeAll(async () => {
    const uri = process.env['MONGODB_URI'] ?? 'mongodb://localhost:27017';
    client = new MongoClient(uri);
    await client.connect();
    database = client.db('scholaracle_test');

    // Create admin users
    const passwordHash = await AdminUserRepository.hashPassword('AdminPass123!');
    await new AdminUserRepository(database).create({
      email: 'payment-admin@test.com',
      passwordHash,
      name: 'Payment Admin',
      role: 'admin',
    });
    await new AdminUserRepository(database).create({
      email: 'billing-admin@test.com',
      passwordHash,
      name: 'Billing Admin',
      role: 'billing',
    });

    const adminAuthService = new AdminAuthService(database, 'test-secret');
    const adminLogin = await adminAuthService.login('payment-admin@test.com', 'AdminPass123!');
    adminToken = adminLogin.token!;
    
    const billingLogin = await adminAuthService.login('billing-admin@test.com', 'AdminPass123!');
    billingAdminToken = billingLogin.token!;

    app = express();
    app.use(express.json());
    app.use('/api/admin/payments', paymentsRouter({ database, jwtSecret: 'test-secret' }));
  });

  afterAll(async () => {
    await client.close();
  });

  beforeEach(async () => {
    await database.collection('payments').deleteMany({});
  });

  describe('GET /api/admin/payments', () => {
    it('should list payments', async () => {
      await new PaymentRepository(database).create({
        userId: '507f1f77bcf86cd799439011',
        amount: 1900,
        currency: 'usd',
        status: 'succeeded',
        paymentMethod: 'card',
      });

      const response = await request(app)
        .get('/api/admin/payments')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
    });

    it('should filter by status', async () => {
      await new PaymentRepository(database).create({
        userId: '507f1f77bcf86cd799439011',
        amount: 1900,
        currency: 'usd',
        status: 'succeeded',
        paymentMethod: 'card',
      });
      await new PaymentRepository(database).create({
        userId: '507f1f77bcf86cd799439012',
        amount: 2900,
        currency: 'usd',
        status: 'failed',
        paymentMethod: 'card',
      });

      const response = await request(app)
        .get('/api/admin/payments?status=succeeded')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data.length).toBe(1);
    });
  });

  describe('GET /api/admin/payments/:id', () => {
    it('should get payment details', async () => {
      const payment = await new PaymentRepository(database).create({
        userId: '507f1f77bcf86cd799439011',
        amount: 1900,
        currency: 'usd',
        status: 'succeeded',
        paymentMethod: 'card',
      });

      const response = await request(app)
        .get(`/api/admin/payments/${payment._id!.toString()}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.amount).toBe(19); // Converted to dollars
    });
  });

  describe('POST /api/admin/payments/:id/refund', () => {
    it('should process full refund', async () => {
      const payment = await new PaymentRepository(database).create({
        userId: '507f1f77bcf86cd799439011',
        amount: 1900,
        currency: 'usd',
        status: 'succeeded',
        paymentMethod: 'card',
      });

      const response = await request(app)
        .post(`/api/admin/payments/${payment._id!.toString()}/refund`)
        .set('Authorization', `Bearer ${billingAdminToken}`)
        .send({
          amount: 19, // Full refund in dollars
          reason: 'Customer request',
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    it('should process partial refund', async () => {
      const payment = await new PaymentRepository(database).create({
        userId: '507f1f77bcf86cd799439011',
        amount: 1900,
        currency: 'usd',
        status: 'succeeded',
        paymentMethod: 'card',
      });

      const response = await request(app)
        .post(`/api/admin/payments/${payment._id!.toString()}/refund`)
        .set('Authorization', `Bearer ${billingAdminToken}`)
        .send({
          amount: 10, // Partial refund
          reason: 'Partial refund',
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    it('should require refund reason', async () => {
      const payment = await new PaymentRepository(database).create({
        userId: '507f1f77bcf86cd799439011',
        amount: 1900,
        currency: 'usd',
        status: 'succeeded',
        paymentMethod: 'card',
      });

      const response = await request(app)
        .post(`/api/admin/payments/${payment._id!.toString()}/refund`)
        .set('Authorization', `Bearer ${billingAdminToken}`)
        .send({
          amount: 19,
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('reason');
    });
  });

  describe('POST /api/admin/payments/:id/retry', () => {
    it('should retry failed payment', async () => {
      const payment = await new PaymentRepository(database).create({
        userId: '507f1f77bcf86cd799439011',
        amount: 1900,
        currency: 'usd',
        status: 'failed',
        paymentMethod: 'card',
      });

      const response = await request(app)
        .post(`/api/admin/payments/${payment._id!.toString()}/retry`)
        .set('Authorization', `Bearer ${billingAdminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });
  });
});

