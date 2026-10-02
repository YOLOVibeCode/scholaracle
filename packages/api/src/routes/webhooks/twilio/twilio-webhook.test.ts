import request from 'supertest';
import express, { type Express } from 'express';
import { MongoClient, type Db } from 'mongodb';
import { MongoMemoryServer } from 'mongodb-memory-server';
import querystring from 'node:querystring';
import {
  SCHOLARMANCY_SMS_PURPOSE,
  SMS_INBOUND_WEBHOOK_URL,
  SMS_STATUS_WEBHOOK_URL,
} from '@scholaracle/contracts';
import { twilioWebhookRouter } from './twilio-webhook.router';
import { signRelayInboundBody } from '../../../services/sms/verifyRelayInboundSignature';
import { SmsConsentRepository } from '@scholaracle/database';

const RELAY_SECRET = 'test-relay-inbound-secret';

function signedPost(
  app: Express,
  path: string,
  publicUrl: string,
  fields: Record<string, string>
): request.Test {
  const rawBody = querystring.stringify(fields);
  const sig = signRelayInboundBody(publicUrl, rawBody, RELAY_SECRET);
  return request(app)
    .post(path)
    .set('Content-Type', 'application/x-www-form-urlencoded')
    .set('x-relay-signature', sig)
    .send(rawBody);
}

describe('Twilio Webhooks (relay)', () => {
  let app: Express;
  let client: MongoClient;
  let database: Db;
  let mongoServer: MongoMemoryServer;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    client = new MongoClient(mongoServer.getUri());
    await client.connect();
    database = client.db('scholaracle_test');

    process.env['RELAY_INBOUND_SECRET'] = RELAY_SECRET;

    app = express();
    app.use(
      '/api/webhooks/twilio',
      twilioWebhookRouter({
        database,
        relayInboundSecret: RELAY_SECRET,
      })
    );
  });

  afterAll(async () => {
    delete process.env['RELAY_INBOUND_SECRET'];
    await client.close();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    await database.collection('communication_logs').deleteMany({});
    await database.collection('sms_consents').deleteMany({});
  });

  describe('signature', () => {
    it('rejects missing signature with 401', async () => {
      const res = await request(app)
        .post('/api/webhooks/twilio/sms')
        .send({ Body: 'STOP', From: '+15005550006' });
      expect(res.status).toBe(401);
    });

    it('rejects invalid signature with 401', async () => {
      const rawBody = querystring.stringify({ From: '+15005550006', Body: 'STOP' });
      const res = await request(app)
        .post('/api/webhooks/twilio/sms')
        .set('Content-Type', 'application/x-www-form-urlencoded')
        .set('x-relay-signature', 'not-valid-base64-sig')
        .send(rawBody);
      expect(res.status).toBe(401);
    });

    it('rejects tampered body with 401', async () => {
      const rawBody = querystring.stringify({ From: '+15005550006', Body: 'STOP' });
      const sig = signRelayInboundBody(SMS_INBOUND_WEBHOOK_URL, rawBody, RELAY_SECRET);
      const res = await request(app)
        .post('/api/webhooks/twilio/sms')
        .set('Content-Type', 'application/x-www-form-urlencoded')
        .set('x-relay-signature', sig)
        .send(`${rawBody}&tampered=1`);
      expect(res.status).toBe(401);
    });
  });

  describe('POST /sms', () => {
    it('records opt-out for STOP with empty TwiML', async () => {
      const res = await signedPost(app, '/api/webhooks/twilio/sms', SMS_INBOUND_WEBHOOK_URL, {
        From: '+15005550006',
        Body: 'STOP',
      });
      expect(res.status).toBe(200);
      expect(res.text).toBe('<Response></Response>');
      const repo = new SmsConsentRepository(database);
      const row = await repo.findByPhoneAndPurpose('+15005550006', SCHOLARMANCY_SMS_PURPOSE);
      expect(row?.revokedAt).toBeTruthy();
    });

    it('clears opt-out on START', async () => {
      const repo = new SmsConsentRepository(database);
      await repo.recordOptOut('+15005550006', SCHOLARMANCY_SMS_PURPOSE);
      const res = await signedPost(app, '/api/webhooks/twilio/sms', SMS_INBOUND_WEBHOOK_URL, {
        From: '+15005550006',
        Body: 'START',
      });
      expect(res.status).toBe(200);
      expect(res.text).toBe('<Response></Response>');
      const row = await repo.findByPhoneAndPurpose('+15005550006', SCHOLARMANCY_SMS_PURPOSE);
      expect(row?.revokedAt).toBeUndefined();
    });

    it('replies with HELP TwiML', async () => {
      const res = await signedPost(app, '/api/webhooks/twilio/sms', SMS_INBOUND_WEBHOOK_URL, {
        From: '+15005550006',
        Body: 'HELP',
      });
      expect(res.status).toBe(200);
      expect(res.text).toContain('Scholarmancy');
      expect(res.text).toContain('support@scholarmancy.com');
    });

    it('records consent on YES', async () => {
      const res = await signedPost(app, '/api/webhooks/twilio/sms', SMS_INBOUND_WEBHOOK_URL, {
        From: '+15005550006',
        Body: 'YES',
      });
      expect(res.status).toBe(200);
      const repo = new SmsConsentRepository(database);
      expect(await repo.hasActiveConsent('+15005550006', SCHOLARMANCY_SMS_PURPOSE)).toBe(true);
    });

    it('handles OptOutType=STOP', async () => {
      const res = await signedPost(app, '/api/webhooks/twilio/sms', SMS_INBOUND_WEBHOOK_URL, {
        From: '+15005550007',
        Body: '',
        OptOutType: 'STOP',
      });
      expect(res.status).toBe(200);
      const repo = new SmsConsentRepository(database);
      const row = await repo.findByPhoneAndPurpose('+15005550007', SCHOLARMANCY_SMS_PURPOSE);
      expect(row?.revokedAt).toBeTruthy();
    });

    it('clears opt-out on OptOutType=START', async () => {
      const repo = new SmsConsentRepository(database);
      await repo.recordOptOut('+15005550009', SCHOLARMANCY_SMS_PURPOSE);
      const res = await signedPost(app, '/api/webhooks/twilio/sms', SMS_INBOUND_WEBHOOK_URL, {
        From: '+15005550009',
        Body: '',
        OptOutType: 'START',
      });
      expect(res.status).toBe(200);
      expect(res.text).toBe('<Response></Response>');
      const row = await repo.findByPhoneAndPurpose('+15005550009', SCHOLARMANCY_SMS_PURPOSE);
      expect(row?.revokedAt).toBeUndefined();
    });

    it('replies with HELP TwiML for OptOutType=HELP', async () => {
      const res = await signedPost(app, '/api/webhooks/twilio/sms', SMS_INBOUND_WEBHOOK_URL, {
        From: '+15005550010',
        Body: '',
        OptOutType: 'HELP',
      });
      expect(res.status).toBe(200);
      expect(res.text).toContain('Scholarmancy');
      expect(res.text).toContain('support@scholarmancy.com');
    });
  });

  describe('POST /status', () => {
    it('returns 200 with valid status payload', async () => {
      await database.collection('communication_logs').insertOne({
        userId: 'u1',
        channel: 'sms',
        type: 'notification',
        subject: 'Test',
        content: 'Hello',
        recipientPhone: '+15005550001',
        status: 'sent',
        providerId: 'SM_TEST_123',
        triggeredBy: 'system',
        createdAt: new Date(),
      });

      const res = await signedPost(app, '/api/webhooks/twilio/status', SMS_STATUS_WEBHOOK_URL, {
        MessageSid: 'SM_TEST_123',
        MessageStatus: 'delivered',
      });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('records opt-out when ErrorCode is 21610', async () => {
      const res = await signedPost(app, '/api/webhooks/twilio/status', SMS_STATUS_WEBHOOK_URL, {
        MessageSid: 'SM_OPT',
        MessageStatus: 'failed',
        To: '+15005550008',
        ErrorCode: '21610',
      });
      expect(res.status).toBe(200);
      const repo = new SmsConsentRepository(database);
      const row = await repo.findByPhoneAndPurpose('+15005550008', SCHOLARMANCY_SMS_PURPOSE);
      expect(row?.revokedAt).toBeTruthy();
    });
  });
});
