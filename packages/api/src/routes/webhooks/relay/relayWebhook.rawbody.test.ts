import crypto from 'crypto';
import request from 'supertest';
import { MongoClient, type Db } from 'mongodb';
import { createApp } from '../../../server';

describe('Relay webhook raw body through createApp', () => {
  const secret = 'relay-rawbody-secret';
  const callbackUrl = 'https://api.example.com/api/webhooks/relay';

  let client: MongoClient;
  let database: Db;

  beforeAll(async () => {
    const uri = process.env['MONGODB_URI'] ?? 'mongodb://localhost:27017';
    client = new MongoClient(uri);
    await client.connect();
    database = client.db('scholaracle_test_relay_raw');
  });

  afterAll(async () => {
    await database.dropDatabase();
    await client.close();
  });

  function sign(body: string): string {
    return crypto
      .createHmac('sha256', secret)
      .update(callbackUrl + body)
      .digest('base64');
  }

  function buildApp() {
    return createApp(
      {
        relayApiKey: 'nsk_test',
        relayApiBaseUrl: 'https://store.example.com',
        relayWebhookSecret: secret,
        relayWebhookCallbackUrl: callbackUrl,
      },
      database
    );
  }

  it('accepts valid relay signature on raw body', async () => {
    const app = buildApp();
    const body = JSON.stringify({
      id: 'evt_raw_1',
      type: 'checkout.session.completed',
      data: { object: { metadata: { user_id: 'u1', plan: 'starter' } } },
    });

    const res = await request(app)
      .post('/api/webhooks/relay')
      .set('Content-Type', 'application/json')
      .set('x-relay-signature', sign(body))
      .send(body)
      .expect(200);

    expect(res.body.received).toBe(true);
  });

  it('rejects tampered body', async () => {
    const app = buildApp();
    const body = JSON.stringify({ id: 'evt_raw_2', type: 'checkout.session.completed' });

    await request(app)
      .post('/api/webhooks/relay')
      .set('Content-Type', 'application/json')
      .set('x-relay-signature', sign('{"id":"other"}'))
      .send(body)
      .expect(403);
  });
});
