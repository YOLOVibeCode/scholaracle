import request from 'supertest';
import express, { type Express } from 'express';
import { MongoClient, ObjectId, type Db } from 'mongodb';
import { noctusoftWebhookRouter } from './noctusoftWebhook';
import { signNoctusoftWebhookBody } from '../../../services/noctusoft-store/verifyNoctusoftWebhookSignature';
import { WebhookEventRepository } from '@scholaracle/database';

describe('Noctusoft store webhook', () => {
  let app: Express;
  let client: MongoClient;
  let database: Db;
  const webhookSecret = 'whsec_test';

  const USERS = {
    buyer: new ObjectId().toHexString(),
    family: new ObjectId().toHexString(),
    template: new ObjectId().toHexString(),
    legacy: new ObjectId().toHexString(),
    dup: new ObjectId().toHexString(),
    firstCharge: new ObjectId().toHexString(),
    cancel: new ObjectId().toHexString(),
    scheduled: new ObjectId().toHexString(),
    past: new ObjectId().toHexString(),
  };

  interface IEventOverrides {
    readonly id?: string;
    readonly userId?: string | null;
    readonly code?: string | null;
    readonly amountCents?: number;
    readonly paymentId?: string | null;
    readonly subscriptionId?: string | null;
    readonly subscription?: Record<string, unknown> | null;
    readonly refundId?: string | null;
    readonly refundedCents?: number;
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
        userId: overrides.userId === undefined ? USERS.buyer : overrides.userId,
        email: 'parent@example.com',
      },
      item: code === null ? null : { code, key: null, kind: 'plan', name: 'Plan', quantity: 1 },
      money: {
        amountCents: overrides.amountCents ?? 999,
        currency: 'USD',
        refundedCents: overrides.refundedCents ?? 0,
        feeCents: null,
      },
      refs: {
        orderId: 'ord_rel_1',
        paymentId: overrides.paymentId === undefined ? 'pay_rel_1' : overrides.paymentId,
        subscriptionId:
          overrides.subscriptionId === undefined ? 'sub_rel_1' : overrides.subscriptionId,
        refundId: overrides.refundId ?? null,
        disputeId: null,
      },
      subscription: overrides.subscription ?? null,
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
      cancelAtPeriodEnd: false,
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
    await database.collection('users').insertMany(
      Object.entries(USERS).map(([name, id]) => ({
        _id: new ObjectId(id),
        email: `${name}@example.com`,
        name,
        role: 'parent',
        createdAt: new Date(),
        updatedAt: new Date(),
      }))
    );
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
    const sub = await database.collection('subscriptions').findOne({ userId: USERS.buyer });
    expect(sub!['plan']).toBe('premium');
    expect(sub!['billingCycle']).toBe('annual');
    const payment = await database.collection('payments').findOne({ userId: USERS.buyer });
    expect(payment!['storePaymentId']).toBe('pay_store_1');
    expect(payment!['amount']).toBe(19999);
  });

  it('keeps the store subscription ref on subscription.started', async () => {
    const body = makeEvent('subscription.started', {
      userId: USERS.family,
      code: 'NOCTU-SCHOLARMANCY-FAMILY-ANNUAL',
      amountCents: 49999,
      subscriptionId: 'sub_rel_42',
    });

    const res = await post(body);

    expect(res.status).toBe(200);
    const sub = await database.collection('subscriptions').findOne({ userId: USERS.family });
    expect(sub!['plan']).toBe('family');
    expect(sub!['billingCycle']).toBe('annual');
    expect(sub!['storeSubscriptionId']).toBe('sub_rel_42');
  });

  it('records the first charge from subscription.started, which carries no payment ref', async () => {
    const body = makeEvent('subscription.started', {
      userId: USERS.firstCharge,
      amountCents: 999,
      paymentId: null,
      subscriptionId: 'ns_sub_first',
      subscription: { status: 'active', cancelScheduled: false },
    });

    const res = await post(body);

    expect(res.status).toBe(200);
    const payments = await database
      .collection('payments')
      .find({ userId: USERS.firstCharge })
      .toArray();
    expect(payments).toHaveLength(1);
    expect(payments[0]!['amount']).toBe(999);
    expect(payments[0]!['storeSubscriptionId']).toBe('ns_sub_first');
    expect(payments[0]!['storePaymentId']).toBeUndefined();
  });

  it('acknowledges an event for a buyer who is not a Scholarmancy user and writes nothing', async () => {
    const res = await post(
      makeEvent('subscription.started', { userId: 'tester:someone@example.com' })
    );
    const unknownObjectId = new ObjectId().toHexString();
    const res2 = await post(makeEvent('purchase.paid', { userId: unknownObjectId }));

    expect(res.status).toBe(200);
    expect(res2.status).toBe(200);
    expect(await database.collection('subscriptions').countDocuments({})).toBe(0);
    expect(await database.collection('payments').countDocuments({})).toBe(0);
  });

  it('acknowledges a paid event for an item that is not a Scholarmancy plan and grants nothing', async () => {
    const body = makeEvent('subscription.started', {
      userId: USERS.template,
      code: 'NOCTU-SCHOLARMANCY-STR-0001',
      amountCents: 999,
    });

    const res = await post(body);

    expect(res.status).toBe(200);
    expect(
      await database.collection('subscriptions').findOne({ userId: USERS.template })
    ).toBeNull();
    expect(await database.collection('payments').findOne({ userId: USERS.template })).toBeNull();
  });

  it('ignores a pre-v1 body that carries the buyer under data', async () => {
    const body = JSON.stringify({
      version: 1,
      id: 'evt_pre_v1',
      type: 'purchase.paid',
      data: {
        userId: USERS.legacy,
        plan: 'premium',
        billingCycle: 'monthly',
        amountCents: 1999,
        paymentId: 'pay_legacy',
      },
    });

    const res = await post(body);

    expect(res.status).toBe(200);
    expect(await database.collection('subscriptions').findOne({ userId: USERS.legacy })).toBeNull();
  });

  it('dedupes repeated event id', async () => {
    const body = makeEvent('subscription.renewed', { userId: USERS.dup, id: 'evt_fixed_dup' });

    await post(body);
    const second = await post(body);

    expect(second.body.deduped).toBe(true);
    const payments = await database.collection('payments').find({ userId: USERS.dup }).toArray();
    expect(payments.length).toBe(1);
  });

  it('marks subscription cancelled', async () => {
    await insertSubscription(USERS.cancel, 'premium');

    const res = await post(makeEvent('subscription.canceled', { userId: USERS.cancel }));

    expect(res.status).toBe(200);
    const sub = await database.collection('subscriptions').findOne({ userId: USERS.cancel });
    expect(sub!['status']).toBe('cancelled');
  });

  it('syncs a cancel scheduled at period end from subscription.changed', async () => {
    await insertSubscription(USERS.scheduled, 'starter');

    const res = await post(
      makeEvent('subscription.changed', {
        userId: USERS.scheduled,
        subscription: { status: 'active', cancelScheduled: true },
      })
    );

    expect(res.status).toBe(200);
    const sub = await database.collection('subscriptions').findOne({ userId: USERS.scheduled });
    expect(sub!['status']).toBe('active');
    expect(sub!['cancelAtPeriodEnd']).toBe(true);
  });

  it('records a refund made in the store console from purchase.refunded', async () => {
    await database.collection('payments').insertOne({
      userId: USERS.buyer,
      amount: 999,
      amountRefunded: 0,
      currency: 'usd',
      status: 'succeeded',
      paymentMethod: 'card',
      storePaymentId: 'ns_pay_refund',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const res = await post(
      makeEvent('purchase.refunded', {
        userId: null,
        paymentId: 'ns_pay_refund',
        refundId: 'ns_ref_9',
        refundedCents: 999,
      })
    );

    expect(res.status).toBe(200);
    const payment = await database
      .collection('payments')
      .findOne({ storePaymentId: 'ns_pay_refund' });
    expect(payment!['status']).toBe('refunded');
    expect(payment!['amountRefunded']).toBe(999);
    expect(payment!['refundId']).toBe('ns_ref_9');
  });

  it('skips a purchase.refunded that the admin refund already recorded', async () => {
    await database.collection('payments').insertOne({
      userId: USERS.buyer,
      amount: 999,
      amountRefunded: 500,
      currency: 'usd',
      status: 'partially_refunded',
      paymentMethod: 'card',
      storePaymentId: 'ns_pay_refund',
      refundId: 'ns_ref_9',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const res = await post(
      makeEvent('purchase.refunded', {
        paymentId: 'ns_pay_refund',
        refundId: 'ns_ref_9',
        refundedCents: 500,
      })
    );

    expect(res.status).toBe(200);
    const payment = await database
      .collection('payments')
      .findOne({ storePaymentId: 'ns_pay_refund' });
    expect(payment!['amountRefunded']).toBe(500);
  });

  it('marks subscription past_due on payment_failed', async () => {
    await insertSubscription(USERS.past, 'starter');

    const res = await post(makeEvent('subscription.payment_failed', { userId: USERS.past }));

    expect(res.status).toBe(200);
    const sub = await database.collection('subscriptions').findOne({ userId: USERS.past });
    expect(sub!['status']).toBe('past_due');
  });
});
