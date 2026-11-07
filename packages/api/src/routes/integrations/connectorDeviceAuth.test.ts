/**
 * Per-device connector token mint, verification, and revocation.
 */
import request from 'supertest';
import express, { type Express } from 'express';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient, type Db } from 'mongodb';
import { AuthService } from '@scholaracle/auth';
import { integrationsRouter } from './integrations';
import { ingestV1Router } from '../ingest/v1/ingest';
import { authMiddleware } from '../../middleware/auth';
import { createErrorHandler } from '../../middleware/errorHandler';

const USER_JWT_SECRET = 'connector-device-user-secret-min-32';
const CONNECTOR_JWT_SECRET = 'connector-device-ingest-secret-min-32';

describe('per-device connector tokens', () => {
  jest.setTimeout(90_000);
  let mongoServer: MongoMemoryServer;
  let mongoClient: MongoClient;
  let database: Db;
  let app: Express;
  let parentToken: string;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    mongoClient = new MongoClient(mongoServer.getUri());
    await mongoClient.connect();
    database = mongoClient.db('connector-device-auth');

    const authService = new AuthService(database, USER_JWT_SECRET);
    const reg = await authService.register('per-device@test.com', 'password123', 'Parent');
    if (!reg.success || !reg.token) throw new Error('register failed');
    parentToken = reg.token;

    app = express();
    app.use(express.json());
    app.use(
      '/api/integrations',
      authMiddleware(authService),
      integrationsRouter({ database, connectorJwtSecret: CONNECTOR_JWT_SECRET })
    );
    app.use(
      '/api/ingest/v1',
      ingestV1Router({
        database,
        jwtSecret: USER_JWT_SECRET,
        connectorJwtSecret: CONNECTOR_JWT_SECRET,
      })
    );
    app.use(createErrorHandler());
  });

  afterAll(async () => {
    await mongoClient.close();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    await database.collection('slc_devices').deleteMany({});
    await database.collection('revoked_connector_tokens').deleteMany({});
  });

  async function mintForDevice(deviceId: string): Promise<string> {
    const res = await request(app)
      .post('/api/integrations/scraper-token')
      .set('Authorization', `Bearer ${parentToken}`)
      .send({ deviceId });
    expect(res.status).toBe(200);
    return res.body.token as string;
  }

  it('two devices mint and both verify on ingest', async () => {
    const tokenPhone = await mintForDevice('phone-1');
    const tokenCli = await mintForDevice('cli-1');

    const phoneSources = await request(app)
      .get('/api/ingest/v1/sources')
      .set('Authorization', `Bearer ${tokenPhone}`);
    expect(phoneSources.status).toBe(200);

    const cliSources = await request(app)
      .get('/api/ingest/v1/sources')
      .set('Authorization', `Bearer ${tokenCli}`);
    expect(cliSources.status).toBe(200);
  });

  it('revoking one device leaves the other valid', async () => {
    const tokenPhone = await mintForDevice('phone-revoke');
    const tokenCli = await mintForDevice('cli-revoke');

    const revoke = await request(app)
      .delete('/api/integrations/scraper-token')
      .set('Authorization', `Bearer ${parentToken}`)
      .send({ deviceId: 'phone-revoke' });
    expect(revoke.status).toBe(200);
    expect(revoke.body.revoked).toBe(true);

    const phoneAfter = await request(app)
      .get('/api/ingest/v1/sources')
      .set('Authorization', `Bearer ${tokenPhone}`);
    expect(phoneAfter.status).toBe(401);

    const cliAfter = await request(app)
      .get('/api/ingest/v1/sources')
      .set('Authorization', `Bearer ${tokenCli}`);
    expect(cliAfter.status).toBe(200);
  });

  it('rejects a parent JWT at ingest', async () => {
    const res = await request(app)
      .get('/api/ingest/v1/sources')
      .set('Authorization', `Bearer ${parentToken}`);
    expect(res.status).toBe(401);
  });
});
