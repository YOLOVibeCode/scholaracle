import request from 'supertest';
import express, { type Express } from 'express';
import { Readable } from 'node:stream';
import type { Db } from 'mongodb';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient } from 'mongodb';
import { AuthService, ConnectorTokenService } from '@scholaracle/auth';
import { createAssetServeRouter, createAssetUploadRouter } from './assets';
import { createErrorHandler } from '../../middleware/errorHandler';
import type { IAssetStore } from '../../services/assets/IAssetStore';
import { signAssetUrl } from '../../services/assets/signedUrl';

// ---------------------------------------------------------------------------
// Shared test helpers
// ---------------------------------------------------------------------------

/** Minimal in-memory IAssetStore that records what was put. */
function makeMemoryStore(): IAssetStore & { lastPut: { key: string; bytes: Buffer } | null } {
  const store = {
    lastPut: null as { key: string; bytes: Buffer } | null,
    put: async (key: string, stream: Readable) => {
      const chunks: Buffer[] = [];
      for await (const chunk of stream)
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      store.lastPut = { key, bytes: Buffer.concat(chunks) };
    },
    get: async () => ({
      stream: Readable.from(['x']),
      metadata: { contentType: 'application/pdf', contentLength: 1 },
    }),
    delete: async () => {},
    exists: async () => true,
    getSignedUrl: async () => '',
  };
  return store;
}

// ---------------------------------------------------------------------------
// Asset serve router — HTTP caching
// ---------------------------------------------------------------------------

describe('Asset serve router — HTTP caching', () => {
  let app: Express;
  let database: Db;
  let mongoServer: MongoMemoryServer;
  let client: MongoClient;
  let testToken: string;
  let testUserId: string;
  const assetId = 'test-asset-id';
  const contentHash = 'sha256-abc123';
  const storageKey = 'src-1/test-asset-id';

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const uri = mongoServer.getUri();
    client = new MongoClient(uri);
    await client.connect();
    database = client.db('test');

    const authService = new AuthService(database);
    const registerResult = await authService.register(
      'asset-cache-test@example.com',
      'password',
      'Asset User'
    );
    if (!registerResult.success || !registerResult.user || !registerResult.token) {
      throw new Error('Failed to register test user');
    }
    testToken = registerResult.token;
    testUserId = registerResult.user.id;

    const inMemoryStore: IAssetStore = {
      put: async () => {},
      get: async () => ({
        stream: Readable.from(['x']),
        metadata: { contentType: 'application/pdf', contentLength: 1 },
      }),
      delete: async () => {},
      exists: async () => true,
      getSignedUrl: async () => '',
    };

    app = express();
    app.use(
      '/api/assets',
      createAssetServeRouter({
        database,
        jwtSecret: 'test-secret',
        assetStore: inMemoryStore,
        baseUrl: 'http://test.example',
        authService,
      })
    );
    app.use(createErrorHandler());
  });

  afterAll(async () => {
    await client.close();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    await database.collection('slc_assets').deleteMany({});
    await database.collection('slc_assets').insertOne({
      assetId,
      sourceId: 'src-1',
      userId: testUserId,
      originalUrl: 'https://example.com/file.pdf',
      storageKey,
      fileName: 'file.pdf',
      mimeType: 'application/pdf',
      fileSize: 1,
      contentHash,
      uploadedAt: new Date('2025-01-15T12:00:00Z'),
      lastAccessedAt: new Date(),
      entityType: 'courseMaterial',
      entityExternalId: 'canvas-file-1',
    });
  });

  it('should set ETag header to quoted contentHash', async () => {
    const res = await request(app)
      .get(`/api/assets/${assetId}`)
      .set('Authorization', `Bearer ${testToken}`);
    expect(res.status).toBe(200);
    expect(res.headers['etag']).toBe(`"${contentHash}"`);
  });

  it('should set Cache-Control header', async () => {
    const res = await request(app)
      .get(`/api/assets/${assetId}`)
      .set('Authorization', `Bearer ${testToken}`);
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('private, max-age=60, must-revalidate');
  });

  it('serves the same bytes on /file (signed-ticket path, cache-bust from bare /:id)', async () => {
    const res = await request(app)
      .get(`/api/assets/${assetId}/file`)
      .set('Authorization', `Bearer ${testToken}`);
    expect(res.status).toBe(200);
    expect(res.headers['etag']).toBe(`"${contentHash}"`);
  });

  it('allows the web origin to read bytes (CORP cross-origin)', async () => {
    const res = await request(app)
      .get(`/api/assets/${assetId}`)
      .set('Authorization', `Bearer ${testToken}`);
    expect(res.status).toBe(200);
    expect(res.headers['cross-origin-resource-policy']).toBe('cross-origin');
  });

  it('should set Last-Modified header', async () => {
    const res = await request(app)
      .get(`/api/assets/${assetId}`)
      .set('Authorization', `Bearer ${testToken}`);
    expect(res.status).toBe(200);
    expect(res.headers['last-modified']).toBeDefined();
  });

  it('should return 304 when If-None-Match matches ETag', async () => {
    const res = await request(app)
      .get(`/api/assets/${assetId}`)
      .set('Authorization', `Bearer ${testToken}`)
      .set('If-None-Match', `"${contentHash}"`);
    expect(res.status).toBe(304);
  });

  it('should return 404 with NOT_FOUND code for unknown asset', async () => {
    const res = await request(app)
      .get('/api/assets/does-not-exist')
      .set('Authorization', `Bearer ${testToken}`);
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Asset not found');
    expect(res.body.code).toBe('NOT_FOUND');
  });

  it('lets a student JWT download an asset in the parent owner partition', async () => {
    const { StudentRepository, UserRepository } = await import('@scholaracle/database');
    const studentRepo = new StudentRepository(database);
    const profile = await studentRepo.create({
      userId: testUserId,
      name: 'Emma Asset',
      studentId: 'demo-emma-asset',
    });
    const studentMongoId = profile._id!.toString();
    const passwordHash = await UserRepository.hashPassword('password');
    const studentUser = await new UserRepository(database).create({
      email: 'emma.asset@example.com',
      passwordHash,
      name: 'Emma Asset',
      role: 'student',
      studentId: studentMongoId,
    });
    await studentRepo.update(studentMongoId, {
      studentLogin: {
        userId: studentUser._id!.toString(),
        showGrades: false,
        createdAt: new Date(),
      },
    });

    const login = await new AuthService(database).login('emma.asset@example.com', 'password');
    expect(login.success).toBe(true);

    const res = await request(app)
      .get(`/api/assets/${assetId}`)
      .set('Authorization', `Bearer ${login.token}`);
    expect(res.status).toBe(200);
  });

  it('rejects an expired signed URL', async () => {
    const expired = signAssetUrl('http://test.example', assetId, 'test-secret', -30);
    const path = expired.replace('http://test.example', '');
    const res = await request(app).get(path);
    expect(res.status).toBe(403);
    expect(String(res.body.error)).toMatch(/expired|invalid/i);
  });
});

// ---------------------------------------------------------------------------
// Asset upload router — POST /upload-base64
// ---------------------------------------------------------------------------

describe('Asset upload router — POST /upload-base64', () => {
  let app: Express;
  let database: Db;
  let mongoServer: MongoMemoryServer;
  let client: MongoClient;
  let connectorToken: string;
  let testUserId: string;
  let memStore: ReturnType<typeof makeMemoryStore>;

  const JWT_SECRET = 'upload-b64-test-secret';
  const SOURCE_ID = 'src-b64';
  const CONTENT_HASH = 'deadbeef01234567';
  // "hello" in base64
  const FILE_BASE64 = Buffer.from('hello').toString('base64');
  const VALID_BODY = {
    data: FILE_BASE64,
    sourceId: SOURCE_ID,
    provider: 'canvas',
    originalUrl: 'https://school.instructure.com/files/555/download',
    contentHash: CONTENT_HASH,
    fileName: 'worksheet.pdf',
    mimeType: 'application/pdf',
    entityType: 'courseMaterial',
    entityExternalId: 'canvas-file-555',
    courseExternalId: 'canvas-course-101',
  };

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    client = new MongoClient(mongoServer.getUri());
    await client.connect();
    database = client.db('test-b64');

    // Register a user then mint a connector token
    const authService = new AuthService(database);
    const reg = await authService.register('b64-test@example.com', 'pw', 'B64 User');
    if (!reg.success || !reg.user) throw new Error('Registration failed');
    testUserId = reg.user.id;

    const cts = new ConnectorTokenService(JWT_SECRET, '1h');
    connectorToken = cts.createToken(testUserId, 'jti-b64');

    memStore = makeMemoryStore();
    app = express();
    app.use(
      '/api/ingest/v1/assets',
      createAssetUploadRouter({
        database,
        jwtSecret: JWT_SECRET,
        assetStore: memStore,
        baseUrl: 'http://api.test',
      })
    );
    app.use(createErrorHandler());
  });

  afterAll(async () => {
    await client.close();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    await database.collection('slc_assets').deleteMany({});
    memStore.lastPut = null;
  });

  // ---- happy path --------------------------------------------------------

  it('returns 200 with assetId and serverUrl', async () => {
    const res = await request(app)
      .post('/api/ingest/v1/assets/upload-base64')
      .set('Authorization', `Bearer ${connectorToken}`)
      .send(VALID_BODY);

    expect(res.status).toBe(200);
    expect(typeof res.body.assetId).toBe('string');
    expect(res.body.serverUrl).toMatch(/\/api\/assets\//);
  });

  it('decodes base64 and persists the correct bytes to the store', async () => {
    await request(app)
      .post('/api/ingest/v1/assets/upload-base64')
      .set('Authorization', `Bearer ${connectorToken}`)
      .send(VALID_BODY);

    expect(memStore.lastPut).not.toBeNull();
    expect(memStore.lastPut!.bytes.toString()).toBe('hello');
  });

  it('inserts an asset record with the correct fields', async () => {
    await request(app)
      .post('/api/ingest/v1/assets/upload-base64')
      .set('Authorization', `Bearer ${connectorToken}`)
      .send(VALID_BODY);

    const doc = await database.collection('slc_assets').findOne({ contentHash: CONTENT_HASH });
    expect(doc).not.toBeNull();
    expect(doc!['sourceId']).toBe(SOURCE_ID);
    expect(doc!['entityType']).toBe('courseMaterial');
    expect(doc!['entityExternalId']).toBe('canvas-file-555');
    expect(doc!['mimeType']).toBe('application/pdf');
  });

  // ---- deduplication -----------------------------------------------------

  it('returns the existing serverUrl without re-uploading on duplicate contentHash', async () => {
    // First upload
    const first = await request(app)
      .post('/api/ingest/v1/assets/upload-base64')
      .set('Authorization', `Bearer ${connectorToken}`)
      .send(VALID_BODY);
    expect(first.status).toBe(200);
    const firstAssetId = first.body.assetId as string;
    memStore.lastPut = null;

    // Second upload with the same contentHash
    const second = await request(app)
      .post('/api/ingest/v1/assets/upload-base64')
      .set('Authorization', `Bearer ${connectorToken}`)
      .send(VALID_BODY);
    expect(second.status).toBe(200);
    expect(second.body.assetId).toBe(firstAssetId);
    // Store should NOT have been called again
    expect(memStore.lastPut).toBeNull();
  });

  // ---- auth errors -------------------------------------------------------

  it('returns 401 when no token is provided', async () => {
    const res = await request(app).post('/api/ingest/v1/assets/upload-base64').send(VALID_BODY);
    expect(res.status).toBe(401);
  });

  it('returns 401 for an invalid token', async () => {
    const res = await request(app)
      .post('/api/ingest/v1/assets/upload-base64')
      .set('Authorization', 'Bearer totally-invalid')
      .send(VALID_BODY);
    expect(res.status).toBe(401);
  });

  // ---- validation errors -------------------------------------------------

  it('returns 400 when required field data is missing', async () => {
    const { data: unusedData, ...rest } = VALID_BODY;
    void unusedData;
    const res = await request(app)
      .post('/api/ingest/v1/assets/upload-base64')
      .set('Authorization', `Bearer ${connectorToken}`)
      .send(rest);
    expect(res.status).toBe(400);
  });

  it('returns 400 when entityType is missing', async () => {
    const { entityType: unusedEntityType, ...rest } = VALID_BODY;
    void unusedEntityType;
    const res = await request(app)
      .post('/api/ingest/v1/assets/upload-base64')
      .set('Authorization', `Bearer ${connectorToken}`)
      .send(rest);
    expect(res.status).toBe(400);
  });

  it('returns 400 when contentHash is missing', async () => {
    const { contentHash: unusedContentHash, ...rest } = VALID_BODY;
    void unusedContentHash;
    const res = await request(app)
      .post('/api/ingest/v1/assets/upload-base64')
      .set('Authorization', `Bearer ${connectorToken}`)
      .send(rest);
    expect(res.status).toBe(400);
  });
});
