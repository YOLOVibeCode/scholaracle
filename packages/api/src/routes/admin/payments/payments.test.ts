import request from 'supertest';
import express, { type Express } from 'express';
import { MongoClient, type Db } from 'mongodb';
import { paymentsRouter } from './payments';
import { AdminStepUpChallengeRepository, PaymentRepository } from '@scholaracle/database';
import { adminAuthRouter } from '../auth/auth';
import { createTestAdmin, getStepUpToken } from '../../../test-utils/admin-test-helper';

describe('Admin Payment Routes', () => {
  let app: Express;
  let client: MongoClient;
  let database: Db;
  let adminToken: string;
  let billingAdminToken: string;
  let billingAdminMfaSecret: string;

  beforeAll(async () => {
    const uri = process.env['MONGODB_URI'] ?? 'mongodb://localhost:27017';
    client = new MongoClient(uri);
    await client.connect();
    database = client.db('scholaracle_test');

    const adminResult = await createTestAdmin(database, 'test-secret', {
      email: 'payment-admin@test.com',
      password: 'AdminPass123!',
      name: 'Payment Admin',
      role: 'admin',
    });
    adminToken = adminResult.token;

    const billingResult = await createTestAdmin(database, 'test-secret', {
      email: 'billing-admin@test.com',
      password: 'AdminPass123!',
      name: 'Billing Admin',
      role: 'admin',
    });
    billingAdminToken = billingResult.token;
    billingAdminMfaSecret = billingResult.mfaSecret;

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
      const stepUpToken = await getStepUpToken(app, billingAdminToken, billingAdminMfaSecret);
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
        .set('x-admin-stepup', stepUpToken)
        .send({
          amount: 19, // Full refund in dollars
          reason: 'Customer request',
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    it('should process partial refund', async () => {
      const stepUpToken = await getStepUpToken(app, billingAdminToken, billingAdminMfaSecret);
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
        .set('x-admin-stepup', stepUpToken)
        .send({
          amount: 10, // Partial refund
          reason: 'Partial refund',
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    it('should require refund reason', async () => {
      const stepUpToken = await getStepUpToken(app, billingAdminToken, billingAdminMfaSecret);
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
        .set('x-admin-stepup', stepUpToken)
        .send({
          amount: 19,
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('reason');
    });

    it('should require step-up when MFA is enabled', async () => {
      const payment = await new PaymentRepository(database).create({
        userId: '507f1f77bcf86cd799439011',
        amount: 1900,
        currency: 'usd',
        status: 'succeeded',
        paymentMethod: 'card',
      });

      // Billing admin already has MFA from createTestAdmin
      const billingTokenWithMFA = billingAdminToken;

      // Refund without step-up must be denied
      const denied = await request(app)
        .post(`/api/admin/payments/${payment._id!.toString()}/refund`)
        .set('Authorization', `Bearer ${billingTokenWithMFA}`)
        .send({ amount: 19, reason: 'Customer request' });
      expect(denied.status).toBe(401);
      expect(String(denied.body.code ?? '')).toContain('MFA_STEP_UP');

      const stepUpToken = await getStepUpToken(app, billingTokenWithMFA, billingAdminMfaSecret);
      const ok = await request(app)
        .post(`/api/admin/payments/${payment._id!.toString()}/refund`)
        .set('Authorization', `Bearer ${billingTokenWithMFA}`)
        .set('x-admin-stepup', stepUpToken)
        .send({ amount: 19, reason: 'Customer request' });
      expect(ok.status).toBe(200);
      expect(ok.body.success).toBe(true);
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
