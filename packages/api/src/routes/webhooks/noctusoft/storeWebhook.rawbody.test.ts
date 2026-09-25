import crypto from 'crypto';
import request from 'supertest';
import { MongoClient, type Db } from 'mongodb';
import { createApp } from '../../../server';

describe('Noctusoft store webhook raw body through createApp', () => {
  const webhookSecret = 'test-webhook-secret';

  let client: MongoClient;
  let database: Db;

  beforeAll(async () => {
    const uri = process.env['MONGODB_URI'] ?? 'mongodb://localhost:27017';
    client = new MongoClient(uri);
    await client.connect();
    database = client.db('scholaracle_test_store_rawbody');
  });

  afterAll(async () => {
    await database.dropDatabase();
    await client.close();
  });

  function buildApp() {
    return createApp(
      {
        noctusoftStoreBaseUrl: 'https://store.example',
        noctusoftStoreProductKey: 'scholarmancy',
        noctusoftStoreApiKey: 'test-api-key',
        noctusoftStoreWebhookSecret: webhookSecret,
      },
      database
    );
  }

  function sign(body: string): string {
    return crypto.createHmac('sha256', webhookSecret).update(body).digest('hex');
  }

  it('accepts a correctly signed delivery', async () => {
    const app = buildApp();
    const body = JSON.stringify({
      version: 1,
      id: 'evt_rawbody_test_1',
      type: 'subscription.updated',
      data: {},
    });

    const response = await request(app)
      .post('/api/webhooks/noctusoft/store')
      .set('Content-Type', 'application/json')
      .set('x-noctusoft-signature', sign(body))
      .send(body);

    expect(response.status).toBe(200);
    expect(response.body.received).toBe(true);
  });

  it('rejects a delivery with an invalid signature', async () => {
    const app = buildApp();
    const body = JSON.stringify({
      version: 1,
      id: 'evt_rawbody_test_2',
      type: 'subscription.updated',
      data: {},
    });

    const response = await request(app)
      .post('/api/webhooks/noctusoft/store')
      .set('Content-Type', 'application/json')
      .set('x-noctusoft-signature', 'not-a-valid-signature')
      .send(body);

    expect(response.status).toBe(403);
  });
});
