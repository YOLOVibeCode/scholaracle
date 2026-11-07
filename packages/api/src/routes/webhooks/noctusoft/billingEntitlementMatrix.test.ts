import request from 'supertest';
import express, { type Express } from 'express';
import { MongoClient, ObjectId, type Db } from 'mongodb';
import { noctusoftWebhookRouter } from './noctusoftWebhook';
import { signNoctusoftWebhookBody } from '../../../services/noctusoft-store/verifyNoctusoftWebhookSignature';
import {
  PLAN_FEATURES,
  SubscriptionRepository,
  WebhookEventRepository,
  type SubscriptionPlan,
} from '@scholaracle/database';

const PERIOD_END_FUTURE = '2099-06-01T00:00:00Z';
const PERIOD_END_PAST = '2020-01-01T00:00:00Z';
const TRIAL_END_FUTURE = '2099-06-01T00:00:00Z';
const TRIAL_END_PAST = '2020-01-01T00:00:00Z';

describe('billing entitlement matrix (store events → effectivePlan + maxStudents)', () => {
  let app: Express;
  let client: MongoClient;
  let database: Db;
  const webhookSecret = 'whsec_matrix';

  interface IMatrixRow {
    readonly name: string;
    readonly plan?: string;
    readonly setup?: 'activePremium' | 'activeFamily' | 'activePremiumWithPayment';
    readonly eventType: string;
    readonly eventOverrides?: Record<string, unknown>;
    readonly expectedEffectivePlan: SubscriptionPlan;
    readonly expectedMaxStudents: number;
  }

  const matrix: readonly IMatrixRow[] = [
    {
      name: 'paid',
      eventType: 'purchase.paid',
      eventOverrides: {
        code: 'NOCTU-SCHOLARMANCY-PREMIUM-MONTHLY',
        amountCents: 1999,
        subscription: { status: 'active', currentPeriodEnd: PERIOD_END_FUTURE },
      },
      expectedEffectivePlan: 'premium',
      expectedMaxStudents: PLAN_FEATURES.premium.maxStudents,
    },
    {
      name: 'renewed',
      setup: 'activePremium',
      eventType: 'subscription.renewed',
      eventOverrides: {
        code: 'NOCTU-SCHOLARMANCY-PREMIUM-MONTHLY',
        amountCents: 1999,
        subscription: { status: 'active', currentPeriodEnd: PERIOD_END_FUTURE },
      },
      expectedEffectivePlan: 'premium',
      expectedMaxStudents: PLAN_FEATURES.premium.maxStudents,
    },
    {
      name: 'refunded',
      setup: 'activePremiumWithPayment',
      eventType: 'purchase.refunded',
      eventOverrides: {
        userId: null,
        paymentId: 'ns_pay_matrix_refund',
        refundId: 'ns_ref_matrix',
        refundedCents: 1999,
      },
      expectedEffectivePlan: 'premium',
      expectedMaxStudents: PLAN_FEATURES.premium.maxStudents,
    },
    {
      name: 'dispute_lost',
      setup: 'activeFamily',
      eventType: 'purchase.dispute_lost',
      expectedEffectivePlan: 'free',
      expectedMaxStudents: PLAN_FEATURES.free.maxStudents,
    },
    {
      name: 'canceled',
      setup: 'activePremium',
      eventType: 'subscription.canceled',
      expectedEffectivePlan: 'free',
      expectedMaxStudents: PLAN_FEATURES.free.maxStudents,
    },
    {
      name: 'past_due',
      setup: 'activePremium',
      eventType: 'subscription.payment_failed',
      expectedEffectivePlan: 'premium',
      expectedMaxStudents: PLAN_FEATURES.premium.maxStudents,
    },
    {
      name: 'paused',
      setup: 'activePremium',
      eventType: 'subscription.paused',
      expectedEffectivePlan: 'free',
      expectedMaxStudents: PLAN_FEATURES.free.maxStudents,
    },
    {
      name: 'trial_end',
      eventType: 'subscription.started',
      eventOverrides: {
        code: 'NOCTU-SCHOLARMANCY-PREMIUM-MONTHLY',
        paymentId: null,
        amountCents: 0,
        subscription: {
          status: 'trialing',
          trialEnd: TRIAL_END_PAST,
          currentPeriodEnd: PERIOD_END_PAST,
        },
      },
      expectedEffectivePlan: 'free',
      expectedMaxStudents: PLAN_FEATURES.free.maxStudents,
    },
    {
      name: 'trial_active',
      eventType: 'subscription.started',
      eventOverrides: {
        code: 'NOCTU-SCHOLARMANCY-PREMIUM-MONTHLY',
        paymentId: null,
        amountCents: 0,
        subscription: {
          status: 'trialing',
          trialEnd: TRIAL_END_FUTURE,
          currentPeriodEnd: PERIOD_END_FUTURE,
        },
      },
      expectedEffectivePlan: 'premium',
      expectedMaxStudents: PLAN_FEATURES.premium.maxStudents,
    },
  ];

  function makeEvent(
    userId: string,
    type: string,
    overrides: Record<string, unknown> = {}
  ): string {
    const code =
      overrides['code'] === undefined ? 'NOCTU-SCHOLARMANCY-PREMIUM-MONTHLY' : overrides['code'];
    return JSON.stringify({
      id: (overrides['id'] as string | undefined) ?? `matrix_evt_${userId}_${type}`,
      type,
      version: 1,
      store: 'scholarmancy',
      product: 'scholarmancy',
      mode: 'test',
      occurredAt: '2026-09-27T16:00:00Z',
      buyer: { userId, email: 'matrix@example.com' },
      item: code === null ? null : { code, key: null, kind: 'plan', name: 'Plan', quantity: 1 },
      money: {
        amountCents: (overrides['amountCents'] as number | undefined) ?? 1999,
        currency: 'USD',
        refundedCents: (overrides['refundedCents'] as number | undefined) ?? 0,
        feeCents: null,
      },
      refs: {
        orderId: 'ord_matrix',
        paymentId:
          overrides['paymentId'] === undefined ? `pay_matrix_${userId}` : overrides['paymentId'],
        subscriptionId: `sub_matrix_${userId}`,
        refundId: (overrides['refundId'] as string | null | undefined) ?? null,
        disputeId: null,
      },
      subscription: (overrides['subscription'] as Record<string, unknown> | null) ?? null,
      seller: null,
      action: null,
      entitlements: {},
    });
  }

  function post(body: string): request.Test {
    const sig = signNoctusoftWebhookBody(body, webhookSecret);
    return request(app)
      .post('/webhook')
      .set('Content-Type', 'application/json')
      .set('x-noctusoft-signature', sig)
      .send(body);
  }

  async function insertActiveSubscription(userId: string, plan: string): Promise<void> {
    const now = new Date();
    await database.collection('subscriptions').insertOne({
      userId,
      plan,
      status: 'active',
      billingCycle: 'monthly',
      currentPeriodStart: now,
      currentPeriodEnd: new Date(PERIOD_END_FUTURE),
      cancelAtPeriodEnd: false,
      createdAt: now,
      updatedAt: now,
    });
  }

  beforeAll(async () => {
    const uri = process.env['MONGODB_URI'] ?? 'mongodb://localhost:27017';
    client = new MongoClient(uri);
    await client.connect();
    database = client.db('scholaracle_test_billing_matrix');
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
    await database.collection('billing_orphans').deleteMany({});
  });

  it.each(matrix)(
    '$name yields effectivePlan=$expectedEffectivePlan maxStudents=$expectedMaxStudents',
    async (row) => {
      const userId = new ObjectId().toHexString();
      await database.collection('users').insertOne({
        _id: new ObjectId(userId),
        email: `${row.name}@example.com`,
        name: row.name,
        role: 'parent',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      if (row.setup === 'activePremium') {
        await insertActiveSubscription(userId, 'premium');
      } else if (row.setup === 'activeFamily') {
        await insertActiveSubscription(userId, 'family');
      } else if (row.setup === 'activePremiumWithPayment') {
        await insertActiveSubscription(userId, 'premium');
        await database.collection('payments').insertOne({
          userId,
          amount: 1999,
          amountRefunded: 0,
          currency: 'usd',
          status: 'succeeded',
          paymentMethod: 'card',
          storePaymentId: 'ns_pay_matrix_refund',
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }

      const body = makeEvent(userId, row.eventType, {
        ...(row.eventOverrides ?? {}),
        userId: row.eventOverrides?.['userId'] === null ? null : userId,
      });
      const res = await post(body);
      expect(res.status).toBe(200);

      const sub = await new SubscriptionRepository(database).findByUserId(userId);
      expect(sub).not.toBeNull();
      const effective = sub!.effectivePlan();
      expect(effective).toBe(row.expectedEffectivePlan);
      expect(PLAN_FEATURES[effective].maxStudents).toBe(row.expectedMaxStudents);
    }
  );
});
