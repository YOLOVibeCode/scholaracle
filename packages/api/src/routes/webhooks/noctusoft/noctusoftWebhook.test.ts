import request from 'supertest';
import express, { type Express } from 'express';
import { MongoClient, type Db } from 'mongodb';
import { noctusoftWebhookRouter } from './noctusoftWebhook';
import { signNoctusoftWebhookBody } from '../../../services/noctusoft-store/verifyNoctusoftWebhookSignature';
import { WebhookEventRepository } from '@scholaracle/database';

describe('Noctusoft store webhook', () => {
  let app: Express;
  let client: MongoClient;
  let database: Db;
  const webhookSecret = 'whsec_test';

  interface IEventOverrides {
    readonly id?: string;
    readonly userId?: string | null;
    readonly code?: string | null;
    readonly amountCents?: number;
    readonly paymentId?: string | null;
    readonly subscriptionId?: string | null;
  }

  function makeEvent(type: string, overrides: IEventOverrides = {}): string {
    const code =
      overrides.code === undefined ? 'NOCTU-SCHOLARMANCY-STARTER-MONTHLY' : overrides.code;
    return JSON.stringify({
      id: overrides.id ?? `rel_evt_${Date.now()}_${Math.random()}`,
      type,
      version: 1,
      store: 'scholarmancy',
      product: 'scholarmancy',
      mode: 'test',
      occurredAt: '2026-09-27T16:00:00Z',
      buyer: {
        userId: overrides.userId === undefined ? 'user123' : overrides.userId,
        email: 'parent@example.com',
      },
      item: code === null ? null : { code, key: null, kind: 'plan', name: 'Plan', quantity: 1 },
      money: {
        amountCents: overrides.amountCents ?? 999,
        currency: 'USD',
        refundedCents: 0,
        feeCents: null,
      },
      refs: {
        orderId: 'ord_rel_1',
        paymentId: overrides.paymentId === undefined ? 'pay_rel_1' : overrides.paymentId,
        subscriptionId:
          overrides.subscriptionId === undefined ? 'sub_rel_1' : overrides.subscriptionId,
        refundId: null,
        disputeId: null,
      },
      subscription: null,
      seller: null,
      action: null,
      entitlements: {},
    });
  }

  function sign(body: string): string {
    return signNoctusoftWebhookBody(body, webhookSecret);
  }

  function post(body: string, signature: string | null = sign(body)): request.Test {
    const req = request(app).post('/webhook').set('Content-Type', 'application/json');
    return signature === null
      ? req.send(body)
      : req.set('x-noctusoft-signature', signature).send(body);
  }

  async function insertSubscription(userId: string, plan: string): Promise<void> {
    await database.collection('subscriptions').insertOne({
      userId,
      plan,
      status: 'active',
      billingCycle: 'monthly',
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    });
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
    const res = await post(makeEvent('purchase.paid'), null);
    expect(res.status).toBe(400);
  });

  it('returns 403 with invalid signature', async () => {
    const res = await post(makeEvent('purchase.paid'), 'bad');
    expect(res.status).toBe(403);
  });

  it('grants the plan named by the item code on purchase.paid', async () => {
    const body = makeEvent('purchase.paid', {
      code: 'NOCTU-SCHOLARMANCY-PREMIUM-ANNUAL',
      amountCents: 19999,
      paymentId: 'pay_store_1',
    });

    const res = await post(body);

    expect(res.status).toBe(200);
    const sub = await database.collection('subscriptions').findOne({ userId: 'user123' });
    expect(sub!['plan']).toBe('premium');
    expect(sub!['billingCycle']).toBe('annual');
    const payment = await database.collection('payments').findOne({ userId: 'user123' });
    expect(payment!['storePaymentId']).toBe('pay_store_1');
    expect(payment!['amount']).toBe(19999);
  });

  it('keeps the store subscription ref on subscription.started', async () => {
    const body = makeEvent('subscription.started', {
      userId: 'user_v1',
      code: 'NOCTU-SCHOLARMANCY-FAMILY-ANNUAL',
      amountCents: 49999,
      subscriptionId: 'sub_rel_42',
    });

    const res = await post(body);

    expect(res.status).toBe(200);
    const sub = await database.collection('subscriptions').findOne({ userId: 'user_v1' });
    expect(sub!['plan']).toBe('family');
    expect(sub!['billingCycle']).toBe('annual');
    expect(sub!['storeSubscriptionId']).toBe('sub_rel_42');
  });

  it('acknowledges a paid event for an item that is not a Scholarmancy plan and grants nothing', async () => {
    const body = makeEvent('subscription.started', {
      userId: 'user_template',
      code: 'NOCTU-SCHOLARMANCY-STR-0001',
      amountCents: 999,
    });

    const res = await post(body);

    expect(res.status).toBe(200);
    expect(
      await database.collection('subscriptions').findOne({ userId: 'user_template' })
    ).toBeNull();
    expect(await database.collection('payments').findOne({ userId: 'user_template' })).toBeNull();
  });

  it('ignores a pre-v1 body that carries the buyer under data', async () => {
    const body = JSON.stringify({
      version: 1,
      id: 'evt_pre_v1',
      type: 'purchase.paid',
      data: {
        userId: 'user_legacy',
        plan: 'premium',
        billingCycle: 'monthly',
        amountCents: 1999,
        paymentId: 'pay_legacy',
      },
    });

    const res = await post(body);

    expect(res.status).toBe(200);
    expect(
      await database.collection('subscriptions').findOne({ userId: 'user_legacy' })
    ).toBeNull();
  });

  it('dedupes repeated event id', async () => {
    const body = makeEvent('subscription.renewed', { userId: 'user_dup', id: 'evt_fixed_dup' });

    await post(body);
    const second = await post(body);

    expect(second.body.deduped).toBe(true);
    const payments = await database.collection('payments').find({ userId: 'user_dup' }).toArray();
    expect(payments.length).toBe(1);
  });

  it('marks subscription cancelled', async () => {
    await insertSubscription('user_cancel', 'premium');

    const res = await post(makeEvent('subscription.canceled', { userId: 'user_cancel' }));

    expect(res.status).toBe(200);
    const sub = await database.collection('subscriptions').findOne({ userId: 'user_cancel' });
    expect(sub!['status']).toBe('cancelled');
  });

  it('marks subscription past_due on payment_failed', async () => {
    await insertSubscription('user_past', 'starter');

    const res = await post(makeEvent('subscription.payment_failed', { userId: 'user_past' }));

    expect(res.status).toBe(200);
    const sub = await database.collection('subscriptions').findOne({ userId: 'user_past' });
    expect(sub!['status']).toBe('past_due');
  });
});
