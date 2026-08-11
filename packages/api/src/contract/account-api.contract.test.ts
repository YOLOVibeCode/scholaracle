/**
 * Contract tests for POST /api/account/push-token (mobile push
 * registration). Also guards the /api/account mount in server.ts — the
 * router existed unmounted for months and every push registration 404'd.
 *
 * Wire types: @scholaracle/contracts types/api/account.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import request from 'supertest';
import express, { type Express } from 'express';
import { MongoClient, type Db } from 'mongodb';
import { AuthService } from '@scholaracle/auth';
import { createAccountRouter } from '../routes/account/account';
import { authMiddleware } from '../middleware/auth';
import { createErrorHandler } from '../middleware/errorHandler';
import { assertKeys } from './assertExactKeys';

const EMAIL = 'contract-account@example.com';

describe('account API contract', () => {
  let app: Express;
  let database: Db;
  let mongoClient: MongoClient;
  let userToken: string;

  beforeAll(async () => {
    const mongodbUri = process.env['MONGODB_URI'] ?? 'mongodb://localhost:27017';
    const dbName = process.env['MONGODB_DB_NAME'] ?? 'scholaracle_test';
    mongoClient = new MongoClient(mongodbUri);
    await mongoClient.connect();
    database = mongoClient.db(dbName);
    await database.collection('users').deleteMany({ email: EMAIL });

    const authService = new AuthService(database, 'test-secret');
    app = express();
    app.use(express.json());
    app.use(
      '/api/account',
      authMiddleware(authService),
      createAccountRouter({ database, baseUrl: 'http://test.example' })
    );
    app.use(createErrorHandler());

    const reg = await authService.register(EMAIL, 'password123', 'Account Contract');
    if (!reg.success || !reg.token) throw new Error('Failed to register test user');
    userToken = reg.token;
  });

  afterAll(async () => {
    if (mongoClient) await mongoClient.close();
  });

  it('server.ts mounts /api/account (guard against silent unmount)', () => {
    const serverSource = readFileSync(join(__dirname, '..', 'server.ts'), 'utf8');
    // Whitespace-insensitive: prettier may split app.use across lines.
    expect(serverSource.replace(/\s+/g, ' ')).toContain("app.use( '/api/account'");
    expect(serverSource).toContain('createAccountRouter({ database, baseUrl })');
  });

  it('POST /api/account/push-token — returns the exact wire keys', async () => {
    const res = await request(app)
      .post('/api/account/push-token')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ expoPushToken: 'ExponentPushToken[contract-1]', deviceId: 'device-a', type: 'ios' });

    expect(res.status).toBe(200);
    assertKeys(res.body as Record<string, unknown>, ['success'], [], 'IPushTokenResponse');
    expect(res.body.success).toBe(true);
  });

  it('stores one device per deviceId and replaces on re-registration', async () => {
    await request(app)
      .post('/api/account/push-token')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ expoPushToken: 'ExponentPushToken[contract-2]', deviceId: 'device-b', type: 'ios' });
    await request(app)
      .post('/api/account/push-token')
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        expoPushToken: 'ExponentPushToken[contract-2b]',
        deviceId: 'device-b',
        type: 'ios',
      });

    const user = await database.collection('users').findOne({ email: EMAIL });
    const devices = (user?.['devices'] ?? []) as Array<{ deviceId: string; pushToken: string }>;
    const deviceB = devices.filter((d) => d.deviceId === 'device-b');
    expect(deviceB).toHaveLength(1);
    expect(deviceB[0]?.pushToken).toBe('ExponentPushToken[contract-2b]');
    // device-a from the previous test coexists (multi-device support)
    expect(devices.some((d) => d.deviceId === 'device-a')).toBe(true);
  });

  it('rejects a missing expoPushToken with the standard error envelope', async () => {
    const res = await request(app)
      .post('/api/account/push-token')
      .set('Authorization', `Bearer ${userToken}`)
      .send({});

    expect(res.status).toBe(400);
    assertKeys(
      res.body as Record<string, unknown>,
      ['success', 'error', 'code'],
      ['requestId', 'details', 'debug'],
      'IErrorResponseBody'
    );
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('rejects unauthenticated requests', async () => {
    const res = await request(app)
      .post('/api/account/push-token')
      .send({ expoPushToken: 'ExponentPushToken[nope]' });

    expect(res.status).toBe(401);
  });

  it('DELETE /api/account/push-token — removes the device, idempotent, exact keys', async () => {
    await request(app)
      .post('/api/account/push-token')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ expoPushToken: 'ExponentPushToken[del-1]', deviceId: 'device-del', type: 'ios' });

    const res = await request(app)
      .delete('/api/account/push-token')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ deviceId: 'device-del' });

    expect(res.status).toBe(200);
    assertKeys(res.body as Record<string, unknown>, ['success'], [], 'IPushTokenResponse');

    const user = await database.collection('users').findOne({ email: EMAIL });
    const devices = (user?.['devices'] ?? []) as Array<{ deviceId: string }>;
    expect(devices.some((d) => d.deviceId === 'device-del')).toBe(false);

    // Idempotent: deleting again still 200s
    const again = await request(app)
      .delete('/api/account/push-token')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ deviceId: 'device-del' });
    expect(again.status).toBe(200);
  });

  it('DELETE /api/account/push-token — missing deviceId yields the standard error envelope', async () => {
    const res = await request(app)
      .delete('/api/account/push-token')
      .set('Authorization', `Bearer ${userToken}`)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('DELETE /api/account/push-token — unauthenticated is 401 (not 404)', async () => {
    const res = await request(app).delete('/api/account/push-token').send({ deviceId: 'x' });
    expect(res.status).toBe(401);
  });
});
