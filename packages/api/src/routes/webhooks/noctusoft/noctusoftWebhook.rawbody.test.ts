import request from 'supertest';
import { MongoClient, type Db } from 'mongodb';
import { createApp } from '../../../server';
import { signNoctusoftWebhookBody } from '../../../services/noctusoft-store/verifyNoctusoftWebhookSignature';

describe('Noctusoft webhook raw body through createApp', () => {
  const webhookSecret = 'test-webhook-secret';

  let client: MongoClient;
  let database: Db;

  beforeAll(async () => {
    const uri = process.env['MONGODB_URI'] ?? 'mongodb://localhost:27017';
    client = new MongoClient(uri);
    await client.connect();
    database = client.db('scholaracle_test_noctusoft_rawbody');
  });

  afterAll(async () => {
    await database.dropDatabase();
    await client.close();
  });

  function buildApp() {
    return createApp(
      {
        relayApiKey: 'nsk_test',
        relayWebhookSecret: webhookSecret,
        relayStoreAlias: 'scholarmancy',
        relayStoreMode: 'test',
      },
      database
    );
  }

  it('accepts a correctly signed delivery', async () => {
    const app = buildApp();
    const body = JSON.stringify({
      version: 1,
      id: 'evt_rawbody_1',
      type: 'subscription.started',
      buyer: { userId: 'u1', email: 'parent@example.com' },
      item: { code: 'NOCTU-SCHOLARMANCY-STARTER-MONTHLY', kind: 'plan' },
      money: { amountCents: 999, currency: 'USD' },
      refs: { paymentId: 'pay_rawbody_1', subscriptionId: 'sub_rawbody_1' },
    });

    const response = await request(app)
      .post('/api/webhooks/noctusoft')
      .set('Content-Type', 'application/json')
      .set('x-noctusoft-signature', signNoctusoftWebhookBody(body, webhookSecret))
      .send(body);

    expect(response.status).toBe(200);
    expect(response.body.received).toBe(true);
  });

  it('rejects an invalid signature', async () => {
    const app = buildApp();
    const body = JSON.stringify({
      version: 1,
      id: 'evt_rawbody_2',
      type: 'subscription.started',
      buyer: { userId: 'u1', email: 'parent@example.com' },
    });

    const response = await request(app)
      .post('/api/webhooks/noctusoft')
      .set('Content-Type', 'application/json')
      .set('x-noctusoft-signature', 'invalid')
      .send(body);

    expect(response.status).toBe(403);
  });
});
