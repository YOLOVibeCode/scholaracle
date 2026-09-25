import request from 'supertest';
import express, { type Express } from 'express';
import { MongoClient, type Db } from 'mongodb';
import { noctusoftWebhookRouter } from './noctusoftWebhook';
import { signNoctusoftWebhookBody } from '../../../services/noctusoft-store/verifyNoctusoftWebhookSignature';
import { PLAN_PRICING, WebhookEventRepository } from '@scholaracle/database';

describe('Noctusoft store webhook', () => {
  let app: Express;
  let client: MongoClient;
  let database: Db;
  const webhookSecret = 'whsec_test';

  function makeEvent(
    type: string,
    data: Record<string, unknown>,
    id = `evt_${Date.now()}`
  ): string {
    return JSON.stringify({
      version: 1,
      id,
      type,
      data,
    });
  }

  function sign(body: string): string {
    return signNoctusoftWebhookBody(body, webhookSecret);
  }

  beforeAll(async () => {
    const uri = process.env['MONGODB_URI'] ?? 'mongodb://localhost:27017';
    client = new MongoClient(uri);
    await client.connect();
    database = client.db('scholaracle_test_noctusoft_wh');

    app = express();
    app.use(express.text({ type: 'application/json' }));
    await new WebhookEventRepository(database).ensureIndexes();
    app.use('/webhook', noctusoftWebhookRouter({ database, webhookSecret }));
  });

  afterAll(async () => {
    await client.close();
  });

  beforeEach(async () => {
    await database.collection('payments').deleteMany({});
    await database.collection('subscriptions').deleteMany({});
    await database.collection('users').deleteMany({});
    await database.collection('webhook_events').deleteMany({});
  });

  it('returns 400 without signature header', async () => {
    const body = makeEvent('purchase.paid', { userId: 'u1' });
    const res = await request(app)
      .post('/webhook')
      .set('Content-Type', 'application/json')
      .send(body);
    expect(res.status).toBe(400);
  });

  it('returns 403 with invalid signature', async () => {
    const body = makeEvent('purchase.paid', { userId: 'u1' });
    const res = await request(app)
      .post('/webhook')
      .set('Content-Type', 'application/json')
      .set('x-noctusoft-signature', 'bad')
      .send(body);
    expect(res.status).toBe(403);
  });

  it('creates subscription on purchase.paid', async () => {
    const amountCents = Math.round(PLAN_PRICING.premium.annual * 100);
    const body = makeEvent('purchase.paid', {
      userId: 'user123',
      plan: 'premium',
      billingCycle: 'annual',
      amountCents,
      currency: 'USD',
      paymentId: 'pay_store_1',
    });

    const res = await request(app)
      .post('/webhook')
      .set('Content-Type', 'application/json')
      .set('x-noctusoft-signature', sign(body))
      .send(body);

    expect(res.status).toBe(200);
    const sub = await database.collection('subscriptions').findOne({ userId: 'user123' });
    expect(sub!['plan']).toBe('premium');
    expect(sub!['billingCycle']).toBe('annual');
  });

  it('dedupes repeated event id', async () => {
    const body = makeEvent(
      'subscription.renewed',
      { userId: 'user_dup', plan: 'starter', billingCycle: 'monthly', paymentId: 'pay_dup' },
      'evt_fixed_dup'
    );

    await request(app)
      .post('/webhook')
      .set('Content-Type', 'application/json')
      .set('x-noctusoft-signature', sign(body))
      .send(body);
    const second = await request(app)
      .post('/webhook')
      .set('Content-Type', 'application/json')
      .set('x-noctusoft-signature', sign(body))
      .send(body);

    expect(second.body.deduped).toBe(true);
    const payments = await database.collection('payments').find({ userId: 'user_dup' }).toArray();
    expect(payments.length).toBe(0);
  });

  it('marks subscription cancelled', async () => {
    await database.collection('subscriptions').insertOne({
      userId: 'user_cancel',
      plan: 'premium',
      status: 'active',
      billingCycle: 'monthly',
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const body = makeEvent('subscription.canceled', { userId: 'user_cancel' });
    const res = await request(app)
      .post('/webhook')
      .set('Content-Type', 'application/json')
      .set('x-noctusoft-signature', sign(body))
      .send(body);
    expect(res.status).toBe(200);

    const sub = await database.collection('subscriptions').findOne({ userId: 'user_cancel' });
    expect(sub!['status']).toBe('cancelled');
  });

  it('marks subscription past_due on payment_failed', async () => {
    await database.collection('subscriptions').insertOne({
      userId: 'user_past',
      plan: 'starter',
      status: 'active',
      billingCycle: 'monthly',
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const body = makeEvent('subscription.payment_failed', { userId: 'user_past' });
    const res = await request(app)
      .post('/webhook')
      .set('Content-Type', 'application/json')
      .set('x-noctusoft-signature', sign(body))
      .send(body);
    expect(res.status).toBe(200);

    const sub = await database.collection('subscriptions').findOne({ userId: 'user_past' });
    expect(sub!['status']).toBe('past_due');
  });
});
