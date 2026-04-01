import request from 'supertest';
import express, { type Express } from 'express';
import { MongoClient, type Db } from 'mongodb';
import { twilioWebhookRouter } from './twilio-webhook.router';

describe('Twilio Webhooks', () => {
  let app: Express;
  let client: MongoClient;
  let database: Db;

  beforeAll(async () => {
    const uri = process.env['MONGODB_URI'] ?? 'mongodb://localhost:27017';
    client = new MongoClient(uri);
    await client.connect();
    database = client.db('scholaracle_test');

    app = express();
    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));
    app.use('/api/webhooks/twilio', twilioWebhookRouter({ database, twilioAuthToken: '' }));
  });

  afterAll(async () => {
    await client.close();
  });

  beforeEach(async () => {
    await database.collection('communication_logs').deleteMany({});
    await database.collection('audit_logs').deleteMany({});
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

      const res = await request(app)
        .post('/api/webhooks/twilio/status')
        .send({ MessageSid: 'SM_TEST_123', MessageStatus: 'delivered' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('returns 400 when MessageSid is missing', async () => {
      const res = await request(app)
        .post('/api/webhooks/twilio/status')
        .send({ MessageStatus: 'delivered' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('MessageSid and MessageStatus are required');
    });

    it('returns 400 when MessageStatus is missing', async () => {
      const res = await request(app)
        .post('/api/webhooks/twilio/status')
        .send({ MessageSid: 'SM_TEST_123' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('MessageSid and MessageStatus are required');
    });

    it('returns 200 with empty body (both fields missing)', async () => {
      const res = await request(app).post('/api/webhooks/twilio/status').send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('MessageSid and MessageStatus are required');
    });

    it('returns 200 for unknown Twilio status (no internal mapping)', async () => {
      const res = await request(app)
        .post('/api/webhooks/twilio/status')
        .send({ MessageSid: 'SM_UNKNOWN_789', MessageStatus: 'accepted' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('POST /sms (inbound)', () => {
    it('returns 200 with TwiML for a normal inbound message', async () => {
      const res = await request(app).post('/api/webhooks/twilio/sms').send({
        MessageSid: 'SM_INBOUND_001',
        From: '+15005550006',
        To: '+18449003903',
        Body: 'Hello there',
      });

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/text\/xml/);
      expect(res.text).toBe('<Response></Response>');
    });

    it('returns opt-out TwiML for STOP keyword', async () => {
      const res = await request(app).post('/api/webhooks/twilio/sms').send({
        MessageSid: 'SM_INBOUND_STOP',
        From: '+15005550006',
        To: '+18449003903',
        Body: 'STOP',
      });

      expect(res.status).toBe(200);
      expect(res.text).toContain('unsubscribed');

      const auditLog = await database
        .collection('audit_logs')
        .findOne({ entityType: 'sms_opt_out' });
      expect(auditLog).toBeTruthy();
      expect(auditLog?.['entityId']).toBe('+15005550006');
    });

    it('returns opt-in TwiML for START keyword', async () => {
      const res = await request(app).post('/api/webhooks/twilio/sms').send({
        MessageSid: 'SM_INBOUND_START',
        From: '+15005550006',
        To: '+18449003903',
        Body: 'start',
      });

      expect(res.status).toBe(200);
      expect(res.text).toContain('re-subscribed');

      const auditLog = await database
        .collection('audit_logs')
        .findOne({ entityType: 'sms_opt_in' });
      expect(auditLog).toBeTruthy();
      expect(auditLog?.['entityId']).toBe('+15005550006');
    });

    it('handles empty body gracefully', async () => {
      const res = await request(app).post('/api/webhooks/twilio/sms').send({});

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/text\/xml/);
      expect(res.text).toBe('<Response></Response>');
    });

    it('handles missing Body field gracefully', async () => {
      const res = await request(app)
        .post('/api/webhooks/twilio/sms')
        .send({ MessageSid: 'SM_NO_BODY', From: '+15005550006' });

      expect(res.status).toBe(200);
      expect(res.text).toBe('<Response></Response>');
    });
  });
});
