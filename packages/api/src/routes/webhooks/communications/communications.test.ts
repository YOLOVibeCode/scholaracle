import request from 'supertest';
import express, { type Express } from 'express';
import { MongoClient, type Db } from 'mongodb';
import { communicationsWebhooksRouter } from './communications';
import { CommunicationLogRepository } from '@scholaracle/database';

describe('Communications Webhooks', () => {
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
    app.use(
      '/api/webhooks/communications',
      communicationsWebhooksRouter({ database, webhookSecret: 'test-secret' })
    );
  });

  afterAll(async () => {
    await client.close();
  });

  beforeEach(async () => {
    await database.collection('communication_logs').deleteMany({});
    await database.collection('audit_logs').deleteMany({});
  });

  it('should require webhook secret', async () => {
    const res = await request(app)
      .post('/api/webhooks/communications/status')
      .send({ logId: 'x', status: 'opened' });
    expect(res.status).toBe(401);
  });

  it('should update delivery status for a log', async () => {
    const repo = new CommunicationLogRepository(database);
    const log = await repo.create({
      userId: 'u1',
      channel: 'email',
      type: 'support',
      subject: 'S',
      content: 'C',
      recipientEmail: 'test.parent@example.com',
      status: 'sent',
      triggeredBy: 'admin',
      createdAt: new Date(),
    });

    const res = await request(app)
      .post('/api/webhooks/communications/status')
      .set('x-webhook-secret', 'test-secret')
      .send({ logId: log._id!.toString(), status: 'opened' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const updated = (await database
      .collection('communication_logs')
      .findOne({ _id: log._id })) as any;
    expect(updated?.['status']).toBe('opened');
    expect(updated?.['openedAt']).toBeTruthy();
  });

  it('returns 400 when logId is missing', async () => {
    const res = await request(app)
      .post('/api/webhooks/communications/status')
      .set('x-webhook-secret', 'test-secret')
      .send({ status: 'opened' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('logId and status are required');
  });

  it('returns 400 when status is missing', async () => {
    const res = await request(app)
      .post('/api/webhooks/communications/status')
      .set('x-webhook-secret', 'test-secret')
      .send({ logId: 'some-id' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('logId and status are required');
  });

  it('returns 404 for non-existent logId', async () => {
    const res = await request(app)
      .post('/api/webhooks/communications/status')
      .set('x-webhook-secret', 'test-secret')
      .send({ logId: '507f1f77bcf86cd799439011', status: 'opened' });
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Log not found');
  });

  it('creates audit log entry on successful update', async () => {
    const repo = new CommunicationLogRepository(database);
    const log = await repo.create({
      userId: 'u1',
      channel: 'email',
      type: 'support',
      subject: 'S',
      content: 'C',
      recipientEmail: 'test.parent@example.com',
      status: 'sent',
      triggeredBy: 'admin',
      createdAt: new Date(),
    });

    const logId = log._id!.toString();

    await request(app)
      .post('/api/webhooks/communications/status')
      .set('x-webhook-secret', 'test-secret')
      .send({ logId, status: 'opened' });

    const auditEntry = await database.collection('audit_logs').findOne({ entityId: logId });
    expect(auditEntry).toBeTruthy();
    expect(auditEntry?.['entityType']).toBe('communication');
    expect(auditEntry?.['action']).toBe('system:config_change');
    expect(auditEntry?.['adminUserId']).toBe('system');
    expect(auditEntry?.['metadata']).toEqual({ status: 'opened' });
  });

  it('rejects wrong webhook secret', async () => {
    const res = await request(app)
      .post('/api/webhooks/communications/status')
      .set('x-webhook-secret', 'wrong-secret')
      .send({ logId: 'x', status: 'opened' });
    expect(res.status).toBe(401);
  });
});
