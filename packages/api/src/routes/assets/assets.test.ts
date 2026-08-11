import request from 'supertest';
import express, { type Express } from 'express';
import { Readable } from 'node:stream';
import type { Db } from 'mongodb';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient } from 'mongodb';
import { AuthService } from '@scholaracle/auth';
import { createAssetServeRouter } from './assets';
import { createErrorHandler } from '../../middleware/errorHandler';
import type { IAssetStore } from '../../services/assets/IAssetStore';

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
    expect(res.headers['cache-control']).toBe('private, max-age=86400, immutable');
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
});
