import crypto from 'crypto';
import request from 'supertest';
import { MongoClient, type Db } from 'mongodb';
import { createApp } from '../../../server';

/**
 * Regression test for the raw-body / signature-verification bug.
 *
 * The global express.json() middleware in createApp used to consume the
 * request body before the route-level express.raw() on /api/webhooks/square
 * ever saw it, so the handler verified the HMAC over an empty string and
 * rejected every genuine Square delivery with a 403. The other webhook tests
 * mount squareWebhookRouter directly with their own body parser, which is why
 * they never caught this — this test goes through the full createApp stack
 * with a real signature.
 */
describe('Square webhook raw body through createApp', () => {
  const signatureKey = 'test-signature-key';
  const notificationUrl = 'https://api.example.com/api/webhooks/square';

  let client: MongoClient;
  let database: Db;

  beforeAll(async () => {
    const uri = process.env['MONGODB_URI'] ?? 'mongodb://localhost:27017';
    client = new MongoClient(uri);
    await client.connect();
    database = client.db('scholaracle_test_rawbody');
  });

  afterAll(async () => {
    await database.dropDatabase();
    await client.close();
  });

  function buildApp() {
    return createApp(
      {
        squareAccessToken: 'test-token',
        squareEnvironment: 'sandbox',
        squareLocationId: 'test-location',
        squareWebhookSignatureKey: signatureKey,
        squareWebhookNotificationUrl: notificationUrl,
      },
      database
    );
  }

  function sign(body: string): string {
    return crypto
      .createHmac('sha256', signatureKey)
      .update(notificationUrl + body)
      .digest('base64');
  }

  it('accepts a correctly signed delivery (raw body survives the JSON parser)', async () => {
    const app = buildApp();
    const body = JSON.stringify({
      type: 'some.ignored.event',
      event_id: 'evt_rawbody_test_1',
      data: {},
    });

    const response = await request(app)
      .post('/api/webhooks/square')
      .set('Content-Type', 'application/json')
      .set('x-square-hmacsha256-signature', sign(body))
      .send(body);

    expect(response.status).toBe(200);
    expect(response.body.received).toBe(true);
  });

  it('rejects a delivery with an invalid signature', async () => {
    const app = buildApp();
    const body = JSON.stringify({
      type: 'some.ignored.event',
      event_id: 'evt_rawbody_test_2',
      data: {},
    });

    const response = await request(app)
      .post('/api/webhooks/square')
      .set('Content-Type', 'application/json')
      .set('x-square-hmacsha256-signature', 'not-a-valid-signature')
      .send(body);

    expect(response.status).toBe(403);
  });
});
