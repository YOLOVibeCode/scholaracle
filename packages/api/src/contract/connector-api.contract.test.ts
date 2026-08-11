/**
 * Contract tests for the connector/ingest endpoints consumed by mobile:
 * scraper-token mint, ingest source registration, and the run lifecycle
 * (start → envelope → complete). Pins exact key sets of every response.
 *
 * Wire types: @scholaracle/contracts types/api/{integrations,ingest}.
 */
import request from 'supertest';
import express, { type Express } from 'express';
import { MongoClient, type Db } from 'mongodb';
import { AuthService } from '@scholaracle/auth';
import { SLC_INGEST_SCHEMA_VERSION_V1 } from '@scholaracle/contracts';
import { integrationsRouter } from '../routes/integrations/integrations';
import { ingestV1Router } from '../routes/ingest/v1/ingest';
import { authMiddleware } from '../middleware/auth';
import { createErrorHandler } from '../middleware/errorHandler';
import { assertKeys } from './assertExactKeys';

const EMAIL = 'contract-connector@example.com';
const SOURCE_ID = 'local-canvas-contract-example-com';

describe('connector/ingest API contract', () => {
  let app: Express;
  let database: Db;
  let mongoClient: MongoClient;
  let userToken: string;
  let connectorToken: string;

  beforeAll(async () => {
    // The scraper-token mint resolves its secret from env; align it with the
    // secret the ingest router verifies against.
    process.env['JWT_SECRET'] = 'test-secret';

    const mongodbUri = process.env['MONGODB_URI'] ?? 'mongodb://localhost:27017';
    const dbName = process.env['MONGODB_DB_NAME'] ?? 'scholaracle_test';
    mongoClient = new MongoClient(mongodbUri);
    await mongoClient.connect();
    database = mongoClient.db(dbName);

    await database.collection('users').deleteMany({ email: EMAIL });
    await database.collection('slc_sources').deleteMany({ sourceId: SOURCE_ID });
    await database.collection('slc_runs').deleteMany({ sourceId: SOURCE_ID });

    const authService = new AuthService(database, 'test-secret');
    const reg = await authService.register(EMAIL, 'password123', 'Connector User');
    if (!reg.success || !reg.token) throw new Error('Failed to register test user');
    userToken = reg.token;

    app = express();
    app.use(express.json());
    app.use('/api/integrations', authMiddleware(authService), integrationsRouter({ database }));
    app.use('/api/ingest/v1', ingestV1Router({ database, jwtSecret: 'test-secret' }));
    app.use(createErrorHandler());
  });

  afterAll(async () => {
    if (mongoClient) await mongoClient.close();
  });

  it('POST /api/integrations/scraper-token — exact keys', async () => {
    const res = await request(app)
      .post('/api/integrations/scraper-token')
      .set('Authorization', `Bearer ${userToken}`)
      .send({});

    expect(res.status).toBe(200);
    assertKeys(
      res.body as Record<string, unknown>,
      ['success', 'token', 'jti', 'expiresIn'],
      [],
      'IConnectorTokenResponse'
    );
    connectorToken = res.body.token as string;
  });

  it('POST /api/ingest/v1/sources — exact keys (source register/upsert)', async () => {
    const res = await request(app)
      .post('/api/ingest/v1/sources')
      .set('Authorization', `Bearer ${connectorToken}`)
      .send({
        sourceId: SOURCE_ID,
        provider: 'canvas',
        adapterId: 'com.instructure.canvas',
        displayName: 'Canvas (mobile)',
        portalBaseUrl: 'https://contract.example.com',
      });

    expect(res.status).toBe(200);
    assertKeys(
      res.body as Record<string, unknown>,
      ['success', 'source'],
      [],
      'IIngestSourceRegisterResponse'
    );
    expect(res.body.success).toBe(true);
  });

  it('run lifecycle: start → envelope → complete — exact keys at each step', async () => {
    // Start
    const start = await request(app)
      .post('/api/ingest/v1/runs')
      .set('Authorization', `Bearer ${connectorToken}`)
      .send({ sourceId: SOURCE_ID, runId: 'contract-run-1', clientMeta: { clientType: 'mobile' } });

    expect(start.status).toBe(200);
    assertKeys(
      start.body as Record<string, unknown>,
      ['success', 'runId', 'mode', 'lastCursor'],
      [],
      'IIngestRunStartResponse'
    );
    expect(start.body.runId).toBe('contract-run-1');
    expect(start.body.mode).toBe('delta');

    // Envelope
    const envelope = {
      schemaVersion: SLC_INGEST_SCHEMA_VERSION_V1,
      run: {
        runId: 'contract-run-1',
        startedAt: new Date().toISOString(),
        endedAt: new Date().toISOString(),
        provider: 'canvas',
        adapterId: 'com.instructure.canvas',
        adapterVersion: '1.0.0',
        mode: 'delta',
        timezone: 'America/Chicago',
        meta: { clientType: 'mobile' },
      },
      source: {
        sourceId: SOURCE_ID,
        displayName: 'Canvas (mobile)',
        portalBaseUrl: 'https://contract.example.com',
      },
      ops: [],
    };
    const upload = await request(app)
      .post('/api/ingest/v1/runs/contract-run-1/envelope')
      .set('Authorization', `Bearer ${connectorToken}`)
      .send(envelope);

    expect(upload.status).toBe(200);
    assertKeys(
      upload.body as Record<string, unknown>,
      ['success', 'accepted'],
      [],
      'IIngestEnvelopeAcceptResponse'
    );

    // Complete (success path)
    const complete = await request(app)
      .post('/api/ingest/v1/runs/contract-run-1/complete')
      .set('Authorization', `Bearer ${connectorToken}`)
      .send({ status: 'success' });

    expect(complete.status).toBe(200);
    assertKeys(
      complete.body as Record<string, unknown>,
      ['success', 'committed', 'newCursor', 'derivedAlertsQueued'],
      [],
      'IIngestRunCompleteResponse'
    );
    expect(complete.body.committed).toBe(true);
  });

  it('failed run completion — exact keys', async () => {
    await request(app)
      .post('/api/ingest/v1/runs')
      .set('Authorization', `Bearer ${connectorToken}`)
      .send({ sourceId: SOURCE_ID, runId: 'contract-run-2' });

    const res = await request(app)
      .post('/api/ingest/v1/runs/contract-run-2/complete')
      .set('Authorization', `Bearer ${connectorToken}`)
      .send({ status: 'failed', error: 'portal timeout' });

    expect(res.status).toBe(200);
    assertKeys(
      res.body as Record<string, unknown>,
      ['success', 'committed', 'failed'],
      ['error'],
      'IIngestRunFailedResponse'
    );
    expect(res.body.failed).toBe(true);
  });
});
