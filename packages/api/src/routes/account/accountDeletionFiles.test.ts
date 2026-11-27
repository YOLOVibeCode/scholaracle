/**
 * DELETE /api/account also removes what the household left in file storage.
 * Real auth and account routers on an in-memory MongoDB; files live in a temp directory.
 */

import request from 'supertest';
import express, { type Express } from 'express';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Readable } from 'node:stream';
import { MongoClient, type Db } from 'mongodb';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { AuthService } from '@scholaracle/auth';
import { createAccountRouter } from './account';
import { authMiddleware } from '../../middleware/auth';
import { createErrorHandler } from '../../middleware/errorHandler';
import { LocalAssetStore } from '../../services/assets/LocalAssetStore';

const PASSWORD = 'DeleteFiles123!';
const META = { contentType: 'application/pdf', contentLength: 0 };

describe('account deletion removes the household’s stored files', () => {
  jest.setTimeout(120_000);
  let mongoServer: MongoMemoryServer;
  let client: MongoClient;
  let database: Db;
  let authService: AuthService;
  let store: LocalAssetStore;
  let app: Express;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    client = new MongoClient(mongoServer.getUri());
    await client.connect();
    database = client.db('account-deletion-files');
    authService = new AuthService(database, 'test-secret');
    store = new LocalAssetStore(mkdtempSync(join(tmpdir(), 'account-route-files-')));

    app = express();
    app.use(express.json());
    app.use(
      '/api/account',
      authMiddleware(authService),
      createAccountRouter({ database, baseUrl: 'http://test.example', assetStore: store })
    );
    app.use(createErrorHandler());
  });

  afterAll(async () => {
    await client.close();
    await mongoServer.stop();
  });

  /** A signed-in parent with one synced worksheet in storage. */
  async function parentWithWorksheet(email: string): Promise<{ token: string; key: string }> {
    const reg = await authService.register(email, PASSWORD, 'Parent');
    const login = await authService.login(email, PASSWORD);
    if (!reg.user?.id || !login.token) {
      throw new Error('could not sign the test parent in');
    }
    const key = `source-${reg.user.id}/worksheet-1`;
    await store.put(key, Readable.from(['worksheet']), META);
    await database.collection('slc_assets').insertOne({
      userId: reg.user.id,
      sourceId: `source-${reg.user.id}`,
      assetId: 'worksheet-1',
      storageKey: key,
      deletedAt: null,
    });
    return { token: login.token, key };
  }

  const deleteAccount = (token: string, password: string): request.Test =>
    request(app).delete('/api/account').set('Authorization', `Bearer ${token}`).send({ password });

  it('removes the file when the parent deletes the account', async () => {
    const { token, key } = await parentWithWorksheet('files-route@test.com');
    expect(await store.exists(key)).toBe(true);

    const res = await deleteAccount(token, PASSWORD);

    expect(res.status).toBe(200);
    expect(await store.exists(key)).toBe(false);
    expect(await database.collection('slc_assets').countDocuments({ storageKey: key })).toBe(0);
  });

  it('leaves the file when the password is wrong and nothing is deleted', async () => {
    const { token, key } = await parentWithWorksheet('files-route-wrong@test.com');

    const res = await deleteAccount(token, 'not-the-password');

    expect(res.status).toBe(401);
    expect(await store.exists(key)).toBe(true);
    expect(await database.collection('slc_assets').countDocuments({ storageKey: key })).toBe(1);
  });

  it('is given the file store by the server', () => {
    // The route can only remove files from a store the server hands it.
    const server = readFileSync(resolve(__dirname, '../../server.ts'), 'utf8');
    const start = server.indexOf('createAccountRouter({');
    const wiring = server.slice(start, server.indexOf('})', start));
    expect(start).toBeGreaterThan(-1);
    expect(wiring).toContain('assetStore: createAssetStore()');
  });
});
