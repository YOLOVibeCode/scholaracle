import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import express, { type Express } from 'express';
import { MongoClient, type Db } from 'mongodb';
import { AuthService } from '@scholaracle/auth';
import { ingestV1Router } from './ingest';
import { createErrorHandler } from '../../../middleware/errorHandler';
import { LocalAssetStore } from '../../../services/assets/LocalAssetStore';
import { decryptRunSkeleton } from '../../../services/runSkeletons/runSkeletonCipher';

describe('POST /api/ingest/v1/runs/:runId/skeletons', () => {
  let app: Express;
  let database: Db;
  let mongoClient: MongoClient;
  let userToken: string;
  let assetDir: string;

  beforeAll(async () => {
    const mongodbUri = process.env['MONGODB_URI'] ?? 'mongodb://localhost:27017';
    const dbName = process.env['MONGODB_DB_NAME'] ?? 'scholaracle_test';

    mongoClient = new MongoClient(mongodbUri);
    await mongoClient.connect();
    database = mongoClient.db(dbName);
    await database.collection('users').deleteMany({ email: 'skeleton-user@test.com' });
    await database.collection('slc_runs').deleteMany({});
    await database.collection('slc_run_skeletons').deleteMany({});
    await database.collection('slc_sources').deleteMany({});

    process.env['RUN_SKELETON_CIPHER_KEY'] = 'ab'.repeat(32);
    assetDir = mkdtempSync(join(tmpdir(), 'skeleton-store-'));
    const assetStore = new LocalAssetStore(assetDir);

    process.env['CONNECTOR_JWT_SECRET'] = 'test-secret-connector';
    const authService = new AuthService(database, 'test-secret');
    const reg = await authService.register(
      'skeleton-user@test.com',
      'password123',
      'Skeleton User'
    );
    if (!reg.success || !reg.token) throw new Error('Failed to register test user');
    userToken = reg.token;

    app = express();
    app.use(express.json());
    app.use(
      '/api/ingest/v1',
      ingestV1Router({
        database,
        jwtSecret: 'test-secret',
        connectorJwtSecret: 'test-secret-connector',
        assetStore,
      })
    );
    app.use(createErrorHandler());
  });

  afterAll(async () => {
    await mongoClient.close();
    rmSync(assetDir, { recursive: true, force: true });
  });

  it('stores encrypted skeleton metadata for a started run', async () => {
    const start = await request(app).post('/api/ingest/v1/device/start').send({});
    const approve = await request(app)
      .post('/api/ingest/v1/device/approve')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ userCode: start.body.userCode });
    expect(approve.status).toBe(200);
    const poll = await request(app)
      .post('/api/ingest/v1/device/poll')
      .send({ deviceCode: start.body.deviceCode });
    const connectorToken = poll.body.connectorToken as string;

    await request(app)
      .post('/api/ingest/v1/sources')
      .set('Authorization', `Bearer ${connectorToken}`)
      .send({
        sourceId: 'src-skel',
        provider: 'canvas',
        adapterId: 'canvas',
        displayName: 'Canvas',
      });

    const run = await request(app)
      .post('/api/ingest/v1/runs')
      .set('Authorization', `Bearer ${connectorToken}`)
      .send({ sourceId: 'src-skel' });
    const runId = run.body.runId as string;

    const skeleton = JSON.stringify({ v: 1, step: 'canvas.extract', r: { t: 'html' } });
    const payload = {
      step: 'canvas.extract',
      capturedAt: new Date().toISOString(),
      skeleton,
      byteLength: skeleton.length,
      sha256: 'a'.repeat(64),
    };

    const upload = await request(app)
      .post(`/api/ingest/v1/runs/${runId}/skeletons`)
      .set('Authorization', `Bearer ${connectorToken}`)
      .send(payload);
    expect(upload.status).toBe(200);
    expect(upload.body.storageKey).toContain('skeletons/');
    expect(upload.body.storageKey).toContain(runId);

    const record = await database.collection('slc_run_skeletons').findOne({ runId });
    expect(record).toBeTruthy();
    expect(record?.['storageKey']).toBe(upload.body.storageKey);

    const store = new LocalAssetStore(assetDir);
    const stored = await store.get(upload.body.storageKey);
    const chunks: Buffer[] = [];
    for await (const chunk of stored.stream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    const enc = JSON.parse(Buffer.concat(chunks).toString('utf8')) as {
      encrypted: string;
      iv: string;
    };
    const plain = decryptRunSkeleton(enc);
    expect(plain).toContain('canvas.extract');
    expect(plain).not.toContain('Emma Johnson');
  });
});
