import request from 'supertest';
import express, { type Express } from 'express';
import { MongoClient, type Db } from 'mongodb';
import { WebhookEventRepository } from '@scholaracle/database';
import { storeWebhookRouter } from './storeWebhook';
import { PLAN_PRICING } from '@scholaracle/database';
import type { StoreBillingService } from '../../../services/StoreBillingService';

describe('Noctusoft store webhook', () => {
  let app: Express;
  let client: MongoClient;
  let database: Db;

  const mockStoreBillingService = {
    verifyWebhookSignature: jest.fn().mockReturnValue(true),
    createCheckout: jest.fn(),
    getEntitlements: jest.fn(),
    refundPayment: jest.fn(),
  } as unknown as StoreBillingService;

  function makeEvent(overrides: {
    eventId?: string;
    paymentId?: string;
    amountCents?: number;
    note?: string;
    status?: string;
    metadata?: Record<string, string>;
  }) {
    return JSON.stringify({
      version: 1,
      id: overrides.eventId ?? 'evt_123',
      type: 'payment.completed',
      data: {
        payment: {
          id: overrides.paymentId ?? 'pay_123',
          status: overrides.status ?? 'completed',
          amountCents: overrides.amountCents ?? 999,
          currency: 'USD',
          note: overrides.note ?? 'User ID: user123 | Plan: starter | Cycle: monthly',
          metadata: overrides.metadata,
        },
      },
    });
  }

  beforeAll(async () => {
    const uri = process.env['MONGODB_URI'] ?? 'mongodb://localhost:27017';
    client = new MongoClient(uri);
    await client.connect();
    database = client.db('scholaracle_test_store_webhook');

    await new WebhookEventRepository(database).ensureIndexes();

    app = express();
    app.use(express.text({ type: 'application/json' }));
    app.use(
      '/webhook',
      storeWebhookRouter({ database, storeBillingService: mockStoreBillingService })
    );
  });

  afterAll(async () => {
    await client.close();
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    (mockStoreBillingService.verifyWebhookSignature as jest.Mock).mockReturnValue(true);
    await database.collection('payments').deleteMany({});
    await database.collection('subscriptions').deleteMany({});
    await database.collection('users').deleteMany({});
    await database.collection('webhook_events').deleteMany({});
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
    (mockStoreBillingService.verifyWebhookSignature as jest.Mock).mockReturnValue(false);

    const res = await request(app)
      .post('/webhook')
      .set('Content-Type', 'application/json')
      .set('x-noctusoft-signature', 'bad-sig')
      .send(makeEvent({}));

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/Invalid.*signature/i);
  });

  it('creates payment record with correct plan from note', async () => {
    const body = makeEvent({
      paymentId: 'pay_premium_1',
      amountCents: 19999,
      note: 'User ID: user123 | Plan: premium | Cycle: annual',
    });

    const res = await request(app)
      .post('/webhook')
      .set('Content-Type', 'application/json')
      .set('x-relay-signature', 'valid')
      .send(body);

    expect(res.status).toBe(200);

    const payment = await database
      .collection('payments')
      .findOne({ squarePaymentId: 'pay_premium_1' });
    expect(payment).toBeTruthy();
    expect(payment!['userId']).toBe('user123');
    expect(payment!['amount']).toBe(19999);
  });

  it('dedupes duplicate event id', async () => {
    const body = makeEvent({
      eventId: 'evt_dupe',
      paymentId: 'pay_dupe_1',
      amountCents: 999,
    });

    await request(app)
      .post('/webhook')
      .set('Content-Type', 'application/json')
      .set('x-noctusoft-signature', 'valid')
      .send(body);

    const second = await request(app)
      .post('/webhook')
      .set('Content-Type', 'application/json')
      .set('x-noctusoft-signature', 'valid')
      .send(
        makeEvent({
          eventId: 'evt_dupe',
          paymentId: 'pay_dupe_2',
          amountCents: 999,
        })
      );

    expect(second.body.deduped).toBe(true);
    const payments = await database.collection('payments').find({}).toArray();
    expect(payments).toHaveLength(1);
  });

  it('falls back to amount-based plan resolution', async () => {
    const starterMonthlyAmount = Math.round(PLAN_PRICING.starter.monthly * 100);
    const body = makeEvent({
      paymentId: 'pay_fallback_1',
      amountCents: starterMonthlyAmount,
      note: 'User ID: user456',
    });

    await request(app)
      .post('/webhook')
      .set('Content-Type', 'application/json')
      .set('x-noctusoft-signature', 'valid')
      .send(body);

    const sub = await database.collection('subscriptions').findOne({ userId: 'user456' });
    expect(sub!['plan']).toBe('starter');
  });
});
