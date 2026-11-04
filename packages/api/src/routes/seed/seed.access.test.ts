import request from 'supertest';
import express, { type Express } from 'express';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient, type Db } from 'mongodb';
import { seedRouter } from './seed';
import { createErrorHandler } from '../../middleware/errorHandler';

const SEED_TOKEN = 'seed-token-for-tests-0123456789';
const ENV_KEYS = [
  'RAILWAY_ENVIRONMENT_ID',
  'SEED_TOKEN',
  'SEED_ADMIN_PASSWORD',
  'SEED_ADMIN_MFA_SECRET',
] as const;

describe('Seed route access', () => {
  let mongod: MongoMemoryServer;
  let client: MongoClient;
  let database: Db;
  let app: Express;
  const savedEnv: Partial<Record<(typeof ENV_KEYS)[number], string>> = {};

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    client = new MongoClient(mongod.getUri());
    await client.connect();
    database = client.db('seed-access');
    app = express();
    app.use(express.json());
    app.use('/api/seed', seedRouter({ database, jwtSecret: 'test-secret' }));
    app.use(createErrorHandler());
    for (const key of ENV_KEYS) savedEnv[key] = process.env[key];
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      if (savedEnv[key] === undefined) delete process.env[key];
      else process.env[key] = savedEnv[key];
    }
  });

  afterAll(async () => {
    await client.close();
    await mongod.stop();
  });

  describe('on a deployed server', () => {
    beforeEach(() => {
      process.env['RAILWAY_ENVIRONMENT_ID'] = 'env-123';
    });

    it.each(['/', '/demo/reset', '/set-password', '/add-parent'])(
      'refuses POST %s without SEED_TOKEN configured',
      async (path) => {
        delete process.env['SEED_TOKEN'];
        const res = await request(app).post(`/api/seed${path}`).send({});
        expect(res.status).toBe(403);
      }
    );

    it('refuses a wrong seed token', async () => {
      process.env['SEED_TOKEN'] = SEED_TOKEN;
      const res = await request(app)
        .post('/api/seed/set-password')
        .set('X-Seed-Token', 'x'.repeat(SEED_TOKEN.length))
        .send({});
      expect(res.status).toBe(403);
    });

    it('lets the matching seed token through', async () => {
      process.env['SEED_TOKEN'] = SEED_TOKEN;
      const res = await request(app)
        .post('/api/seed/set-password')
        .set('X-Seed-Token', SEED_TOKEN)
        .send({});
      expect(res.status).toBe(400);
    });

    it('skips admin accounts when no admin credentials are configured', async () => {
      process.env['SEED_TOKEN'] = SEED_TOKEN;
      delete process.env['SEED_ADMIN_PASSWORD'];
      delete process.env['SEED_ADMIN_MFA_SECRET'];
      const res = await request(app)
        .post('/api/seed?force=true')
        .set('X-Seed-Token', SEED_TOKEN)
        .send({});
      expect(res.status).toBe(200);
      expect(res.body.results.admins.created).toEqual([]);
      expect(await database.collection('admin_users').countDocuments()).toBe(0);
    });

    it('seeds admin accounts from the environment', async () => {
      process.env['SEED_TOKEN'] = SEED_TOKEN;
      process.env['SEED_ADMIN_PASSWORD'] = 'env-admin-password-123';
      process.env['SEED_ADMIN_MFA_SECRET'] = 'ENVMFASECRETBASE32XYZ';
      const res = await request(app)
        .post('/api/seed?force=true')
        .set('X-Seed-Token', SEED_TOKEN)
        .send({});
      expect(res.status).toBe(200);
      const admins = await database.collection('admin_users').find({}).toArray();
      expect(admins.map((a) => a['email']).sort()).toEqual([
        'admin@scholarmancy.com',
        'analyst@scholarmancy.com',
      ]);
      expect(admins.every((a) => a['mfaSecret'] === 'ENVMFASECRETBASE32XYZ')).toBe(true);
    });
  });

  it('stays open on a local dev/test server', async () => {
    delete process.env['RAILWAY_ENVIRONMENT_ID'];
    delete process.env['SEED_TOKEN'];
    const res = await request(app).post('/api/seed/set-password').send({});
    expect(res.status).toBe(400);
  });
});
