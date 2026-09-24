import crypto from 'crypto';
import request from 'supertest';
import express, { type Express } from 'express';
import { MongoClient, type Db } from 'mongodb';
import { relayWebhookRouter } from './relayWebhook';

const SECRET = 'relay_whsec_test';
const CALLBACK = 'https://api.example.com/api/webhooks/relay';

function signRelay(body: string): string {
  return crypto
    .createHmac('sha256', SECRET)
    .update(CALLBACK + body)
    .digest('base64');
}

function stripeEvent(type: string, id: string, object: Record<string, unknown>): string {
  return JSON.stringify({
    id,
    type,
    data: { object },
  });
}

describe('Relay webhook', () => {
  let app: Express;
  let client: MongoClient;
  let database: Db;
  let eventCounter = 0;

  beforeAll(async () => {
    const uri = process.env['MONGODB_URI'] ?? 'mongodb://localhost:27017';
    client = new MongoClient(uri);
    await client.connect();
    database = client.db('scholaracle_test_relay_wh');

    app = express();
    app.use(express.text({ type: 'application/json' }));
    app.use(
      '/webhook',
      relayWebhookRouter({
        database,
        webhookSecret: SECRET,
        callbackUrl: CALLBACK,
      })
    );
  });

  afterAll(async () => {
    await database.dropDatabase();
    await client.close();
  });

  beforeEach(async () => {
    await database.collection('webhook_events').deleteMany({});
    await database.collection('subscriptions').deleteMany({});
    eventCounter += 1;
  });

  function postEvent(body: string, signature = signRelay(body)) {
    return request(app)
      .post('/webhook')
      .set('Content-Type', 'application/json')
      .set('x-relay-signature', signature)
      .send(body);
  }

  const meta = { metadata: { user_id: 'user-relay-1', plan: 'solo' } };

  it('rejects missing signature', async () => {
    const res = await request(app)
      .post('/webhook')
      .send(stripeEvent('checkout.session.completed', 'evt_missing_sig', meta))
      .expect(400);
    expect(res.body.error).toMatch(/signature/i);
  });

  it('rejects invalid signature', async () => {
    const body = stripeEvent('checkout.session.completed', 'evt_bad_sig', meta);
    await postEvent(body, 'not-valid').expect(403);
  });

  it('dedupes duplicate event.id', async () => {
    const body = stripeEvent('checkout.session.completed', 'evt_dupe', meta);
    await postEvent(body).expect(200);
    const second = await postEvent(body).expect(200);
    expect(second.body.deduped).toBe(true);
  });

  const eventTypes = [
    'checkout.session.completed',
    'payment_intent.succeeded',
    'customer.subscription.created',
    'customer.subscription.updated',
    'customer.subscription.deleted',
    'invoice.paid',
    'invoice.payment_failed',
    'charge.refunded',
    'charge.dispute.created',
    'charge.dispute.closed',
  ] as const;

  it.each(eventTypes)('accepts %s with 200', async (type) => {
    const id = `evt_${type}_${eventCounter}`;
    const object: Record<string, unknown> = {
      ...meta,
      id: type.startsWith('customer.subscription') ? 'sub_1' : 'obj_1',
      status: type === 'customer.subscription.deleted' ? 'canceled' : 'active',
      customer: 'cus_1',
      amount: 1999,
      currency: 'usd',
      payment_intent: 'pi_test_1',
      amount_refunded: 100,
    };
    if (type === 'payment_intent.succeeded') {
      object['amount_received'] = 1999;
    }
    if (type === 'invoice.paid') {
      object['amount_paid'] = 1999;
    }
    const body = stripeEvent(type, id, object);
    await postEvent(body).expect(200);
  });

  it('returns 200 for unknown event types', async () => {
    const body = stripeEvent('unknown.event', 'evt_unknown', meta);
    await postEvent(body).expect(200);
  });
});
