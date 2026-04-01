import request from 'supertest';
import express, { type Express } from 'express';
import { MongoClient, type Db } from 'mongodb';
import { squareWebhookRouter } from './squareWebhook';
import { PLAN_PRICING } from '@scholaracle/database';
import type { SquareService } from '../../../services/SquareService';

describe('Square Webhook', () => {
  let app: Express;
  let client: MongoClient;
  let database: Db;

  const mockSquareService = {
    verifyWebhookSignature: jest.fn().mockResolvedValue(true),
    createPaymentLink: jest.fn(),
    getPayment: jest.fn(),
    listPaymentsByOrderId: jest.fn(),
    createOrGetCustomer: jest.fn(),
    refundPayment: jest.fn(),
  } as unknown as SquareService;

  function makeEvent(overrides: {
    paymentId?: string;
    amount?: number;
    note?: string;
    status?: string;
  }) {
    return JSON.stringify({
      type: 'payment.completed',
      data: {
        object: {
          payment: {
            id: overrides.paymentId ?? 'pay_123',
            status: overrides.status ?? 'COMPLETED',
            amountMoney: { amount: overrides.amount ?? 999, currency: 'USD' },
            note: overrides.note ?? 'User ID: user123 | Plan: starter | Cycle: monthly',
          },
        },
      },
    });
  }

  beforeAll(async () => {
    const uri = process.env['MONGODB_URI'] ?? 'mongodb://localhost:27017';
    client = new MongoClient(uri);
    await client.connect();
    database = client.db('scholaracle_test');

    app = express();
    app.use(express.text({ type: 'application/json' }));
    app.use('/webhook', squareWebhookRouter({ database, squareService: mockSquareService }));
  });

  afterAll(async () => {
    await client.close();
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    (mockSquareService.verifyWebhookSignature as jest.Mock).mockResolvedValue(true);
    await database.collection('payments').deleteMany({});
    await database.collection('subscriptions').deleteMany({});
    await database.collection('users').deleteMany({});
  });

  it('returns 400 without signature header', async () => {
    const res = await request(app)
      .post('/webhook')
      .set('Content-Type', 'application/json')
      .send(makeEvent({}));

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Missing.*signature/i);
  });

  it('returns 403 with invalid signature', async () => {
    (mockSquareService.verifyWebhookSignature as jest.Mock).mockResolvedValue(false);

    const res = await request(app)
      .post('/webhook')
      .set('Content-Type', 'application/json')
      .set('x-square-hmacsha256-signature', 'bad-sig')
      .send(makeEvent({}));

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/Invalid.*signature/i);
  });

  it('creates payment record with correct plan from note', async () => {
    const body = makeEvent({
      paymentId: 'pay_premium_1',
      amount: 19999,
      note: 'User ID: user123 | Plan: premium | Cycle: annual',
    });

    const res = await request(app)
      .post('/webhook')
      .set('Content-Type', 'application/json')
      .set('x-square-hmacsha256-signature', 'valid')
      .send(body);

    expect(res.status).toBe(200);

    const payment = await database
      .collection('payments')
      .findOne({ squarePaymentId: 'pay_premium_1' });
    expect(payment).toBeTruthy();
    expect(payment!['userId']).toBe('user123');
    expect(payment!['amount']).toBe(19999);
    expect(payment!['status']).toBe('succeeded');
  });

  it('creates subscription with correct plan from note', async () => {
    const body = makeEvent({
      paymentId: 'pay_sub_1',
      amount: 19999,
      note: 'User ID: user123 | Plan: premium | Cycle: annual',
    });

    await request(app)
      .post('/webhook')
      .set('Content-Type', 'application/json')
      .set('x-square-hmacsha256-signature', 'valid')
      .send(body);

    const sub = await database.collection('subscriptions').findOne({ userId: 'user123' });
    expect(sub).toBeTruthy();
    expect(sub!['plan']).toBe('premium');
    expect(sub!['billingCycle']).toBe('annual');
    expect(sub!['status']).toBe('active');
  });

  it('falls back to amount-based plan resolution', async () => {
    const starterMonthlyAmount = Math.round(PLAN_PRICING.starter.monthly * 100);

    const body = makeEvent({
      paymentId: 'pay_fallback_1',
      amount: starterMonthlyAmount,
      note: 'User ID: user456',
    });

    await request(app)
      .post('/webhook')
      .set('Content-Type', 'application/json')
      .set('x-square-hmacsha256-signature', 'valid')
      .send(body);

    const sub = await database.collection('subscriptions').findOne({ userId: 'user456' });
    expect(sub).toBeTruthy();
    expect(sub!['plan']).toBe('starter');
  });

  it('updates existing subscription plan on upgrade', async () => {
    await database.collection('subscriptions').insertOne({
      userId: 'user_upgrade',
      plan: 'starter',
      status: 'active',
      billingCycle: 'monthly',
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      createdAt: new Date(),
      updatedAt: new Date(),
      events: [],
    });

    const premiumMonthlyAmount = Math.round(PLAN_PRICING.premium.monthly * 100);

    const body = makeEvent({
      paymentId: 'pay_upgrade_1',
      amount: premiumMonthlyAmount,
      note: 'User ID: user_upgrade | Plan: premium | Cycle: monthly',
    });

    await request(app)
      .post('/webhook')
      .set('Content-Type', 'application/json')
      .set('x-square-hmacsha256-signature', 'valid')
      .send(body);

    const sub = await database.collection('subscriptions').findOne({ userId: 'user_upgrade' });
    expect(sub).toBeTruthy();
    expect(sub!['plan']).toBe('premium');
    expect(sub!['status']).toBe('active');
  });

  it('syncs plan to user document', async () => {
    const { insertedId } = await database.collection('users').insertOne({
      email: 'sync@test.com',
      name: 'Sync User',
      passwordHash: 'x',
      subscription: { plan: 'free', status: 'active' },
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const body = makeEvent({
      paymentId: 'pay_sync_1',
      amount: 999,
      note: `User ID: ${insertedId.toHexString()} | Plan: starter | Cycle: monthly`,
    });

    await request(app)
      .post('/webhook')
      .set('Content-Type', 'application/json')
      .set('x-square-hmacsha256-signature', 'valid')
      .send(body);

    const user = await database.collection('users').findOne({ _id: insertedId });
    expect(user).toBeTruthy();
    expect(user!['subscription']).toMatchObject({ plan: 'starter', status: 'active' });
  });

  it('is idempotent: duplicate payment ID ignored', async () => {
    const body = makeEvent({
      paymentId: 'pay_idempotent',
      amount: 999,
      note: 'User ID: user_idem | Plan: starter | Cycle: monthly',
    });

    await request(app)
      .post('/webhook')
      .set('Content-Type', 'application/json')
      .set('x-square-hmacsha256-signature', 'valid')
      .send(body);

    await request(app)
      .post('/webhook')
      .set('Content-Type', 'application/json')
      .set('x-square-hmacsha256-signature', 'valid')
      .send(body);

    const payments = await database
      .collection('payments')
      .find({ squarePaymentId: 'pay_idempotent' })
      .toArray();
    expect(payments).toHaveLength(1);
  });

  it('annual cycle sets period end +1 year', async () => {
    const before = new Date();

    const body = makeEvent({
      paymentId: 'pay_annual_1',
      amount: 19999,
      note: 'User ID: user_annual | Plan: premium | Cycle: annual',
    });

    await request(app)
      .post('/webhook')
      .set('Content-Type', 'application/json')
      .set('x-square-hmacsha256-signature', 'valid')
      .send(body);

    const sub = await database.collection('subscriptions').findOne({ userId: 'user_annual' });
    expect(sub).toBeTruthy();

    const periodEnd = new Date(sub!['currentPeriodEnd'] as string);
    const expectedEarliest = new Date(before);
    expectedEarliest.setFullYear(expectedEarliest.getFullYear() + 1);
    expectedEarliest.setMinutes(expectedEarliest.getMinutes() - 1);

    const expectedLatest = new Date();
    expectedLatest.setFullYear(expectedLatest.getFullYear() + 1);
    expectedLatest.setMinutes(expectedLatest.getMinutes() + 1);

    expect(periodEnd.getTime()).toBeGreaterThanOrEqual(expectedEarliest.getTime());
    expect(periodEnd.getTime()).toBeLessThanOrEqual(expectedLatest.getTime());
  });
});
