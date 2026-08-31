/**
 * After demo seed, GET /api/assets/:id returns real PDF bytes and an ETag
 * matching the seeded contentHash — not metadata-only.
 */

import { Readable } from 'node:stream';
import request from 'supertest';
import express, { type Express } from 'express';
import type { Db } from 'mongodb';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient } from 'mongodb';
import { AuthService } from '@scholaracle/auth';
import { seedRouter } from './seed';
import { createAssetServeRouter } from '../assets/assets';
import { createErrorHandler } from '../../middleware/errorHandler';
import type { IAssetStore } from '../../services/assets/IAssetStore';
import {
  DEMO_USER,
  DEMO_MINIMAL_PDF,
  DEMO_LAB_SAFETY_ASSET_ID,
  DEMO_LAB_SAFETY_HASH,
  DEMO_LAB_SAFETY_STORAGE_KEY,
} from './demo-data';

function makeMemoryStore(): IAssetStore & { files: Map<string, Buffer> } {
  const files = new Map<string, Buffer>();
  return {
    files,
    put: async (key, stream) => {
      const chunks: Buffer[] = [];
      for await (const chunk of stream) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      files.set(key, Buffer.concat(chunks));
    },
    get: async (key) => {
      const bytes = files.get(key);
      if (bytes === undefined) {
        throw new Error(`missing asset ${key}`);
      }
      return {
        stream: Readable.from(bytes),
        metadata: { contentType: 'application/pdf', contentLength: bytes.length },
      };
    },
    delete: async (key) => {
      files.delete(key);
    },
    exists: async (key) => files.has(key),
    getSignedUrl: async () => '',
  };
}

describe('Demo seed — asset bytes', () => {
  jest.setTimeout(60_000);
  let app: Express;
  let database: Db;
  let mongoServer: MongoMemoryServer;
  let client: MongoClient;
  let authService: AuthService;
  let store: ReturnType<typeof makeMemoryStore>;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    client = new MongoClient(mongoServer.getUri());
    await client.connect();
    database = client.db('demo-asset-bytes');
    authService = new AuthService(database);
    store = makeMemoryStore();

    app = express();
    app.use(express.json());
    app.use('/api/seed', seedRouter({ database, jwtSecret: 'test-secret', assetStore: store }));
    app.use(
      '/api/assets',
      createAssetServeRouter({
        database,
        jwtSecret: 'test-secret',
        assetStore: store,
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

  it('GET /api/assets/:id after seed returns 200, PDF bytes, and ETag matching contentHash', async () => {
    const seedRes = await request(app).post('/api/seed/demo');
    expect(seedRes.status).toBe(200);
    expect(store.files.get(DEMO_LAB_SAFETY_STORAGE_KEY)).toEqual(DEMO_MINIMAL_PDF);

    const login = await authService.login(DEMO_USER.email, DEMO_USER.password);
    expect(login.success).toBe(true);
    expect(login.token).toBeDefined();

    const res = await request(app)
      .get(`/api/assets/${DEMO_LAB_SAFETY_ASSET_ID}`)
      .set('Authorization', `Bearer ${login.token}`)
      .buffer(true)
      .parse((incoming, callback) => {
        const chunks: Buffer[] = [];
        incoming.on('data', (chunk: Buffer) => {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        });
        incoming.on('end', () => {
          callback(null, Buffer.concat(chunks));
        });
      });

    expect(res.status).toBe(200);
    expect(res.headers['etag']).toBe(`"${DEMO_LAB_SAFETY_HASH}"`);
    expect(res.headers['content-type']).toMatch(/pdf/);
    expect(Buffer.isBuffer(res.body)).toBe(true);
    expect((res.body as Buffer).equals(DEMO_MINIMAL_PDF)).toBe(true);
    expect((res.body as Buffer).toString('utf8')).toContain('Goggles');

    const cached = await request(app)
      .get(`/api/assets/${DEMO_LAB_SAFETY_ASSET_ID}`)
      .set('Authorization', `Bearer ${login.token}`)
      .set('If-None-Match', `"${DEMO_LAB_SAFETY_HASH}"`);
    expect(cached.status).toBe(304);
  });
});
