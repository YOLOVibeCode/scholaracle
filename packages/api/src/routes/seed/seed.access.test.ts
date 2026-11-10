import request from 'supertest';
import express, { type Express } from 'express';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient, type Db } from 'mongodb';
import { ObjectId } from 'mongodb';
import { UserRepository, StudentRepository } from '@scholaracle/database';
import { seedRouter } from './seed';
import { createErrorHandler } from '../../middleware/errorHandler';
import { DEMO_USER } from './demo-data';

const SEED_TOKEN = 'seed-token-for-tests-0123456789';
const ENV_KEYS = [
  'RAILWAY_ENVIRONMENT_ID',
  'RAILWAY_ENVIRONMENT_NAME',
  'SEED_TOKEN',
  'SEED_ADMIN_PASSWORD',
  'SEED_ADMIN_MFA_SECRET',
  'NODE_ENV',
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

    it.each(['/', '/demo', '/demo/reset', '/set-password', '/add-parent'])(
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

    it('lets the matching seed token through set-password (missing body)', async () => {
      process.env['SEED_TOKEN'] = SEED_TOKEN;
      const res = await request(app)
        .post('/api/seed/set-password')
        .set('X-Seed-Token', SEED_TOKEN)
        .send({});
      expect(res.status).toBe(400);
    });

    it('lets POST /demo through with matching seed token', async () => {
      process.env['SEED_TOKEN'] = SEED_TOKEN;
      process.env['NODE_ENV'] = 'development';
      const res = await request(app)
        .post('/api/seed/demo')
        .set('X-Seed-Token', SEED_TOKEN)
        .send({});
      expect(res.status).toBe(200);
    });

    it('rejects set-password for non-fixture email domains', async () => {
      process.env['SEED_TOKEN'] = SEED_TOKEN;
      process.env['NODE_ENV'] = 'development';
      const unique = `victim-${Date.now()}@evil.test`;
      const userRepo = new UserRepository(database);
      await userRepo.create({
        email: unique,
        passwordHash: await UserRepository.hashPassword('SomePass123!'),
        name: 'Victim',
        role: 'parent',
      });
      const res = await request(app)
        .post('/api/seed/set-password')
        .set('X-Seed-Token', SEED_TOKEN)
        .send({ email: unique, password: 'NewPass456!' });
      expect(res.status).toBe(403);
    });

    it('rejects set-password for @example.com emails', async () => {
      process.env['SEED_TOKEN'] = SEED_TOKEN;
      process.env['NODE_ENV'] = 'development';
      const unique = `fixture.user.${Date.now()}@example.com`;
      const userRepo = new UserRepository(database);
      await userRepo.create({
        email: unique,
        passwordHash: await UserRepository.hashPassword('OldPass123!'),
        name: 'Fixture',
        role: 'parent',
      });
      const res = await request(app)
        .post('/api/seed/set-password')
        .set('X-Seed-Token', SEED_TOKEN)
        .send({ email: unique, password: 'NewPass456!' });
      expect(res.status).toBe(403);
    });

    it('allows set-password for demo@scholarmancy.com', async () => {
      process.env['SEED_TOKEN'] = SEED_TOKEN;
      process.env['NODE_ENV'] = 'development';
      const userRepo = new UserRepository(database);
      const existing = await userRepo.findByEmail(DEMO_USER.email);
      if (!existing) {
        await userRepo.create({
          email: DEMO_USER.email,
          passwordHash: await UserRepository.hashPassword('OldPass123!'),
          name: DEMO_USER.name,
          role: 'parent',
        });
      }
      const res = await request(app)
        .post('/api/seed/set-password')
        .set('X-Seed-Token', SEED_TOKEN)
        .send({ email: DEMO_USER.email, password: 'NewPass456!' });
      expect(res.status).toBe(200);
    });

    it('rejects add-parent for non-fixture email domains', async () => {
      process.env['SEED_TOKEN'] = SEED_TOKEN;
      process.env['NODE_ENV'] = 'development';
      const studentRepo = new StudentRepository(database);
      const inserted = await studentRepo.create({
        userId: new ObjectId(),
        name: 'Only',
        grade: 9,
        studentId: `stu-only-${Date.now()}`,
        sharedWith: [],
      });
      const res = await request(app)
        .post('/api/seed/add-parent')
        .set('X-Seed-Token', SEED_TOKEN)
        .send({
          studentId: inserted._id!.toString(),
          email: `bad-${Date.now()}@blended-e2e.test`,
          name: 'Bad',
        });
      expect(res.status).toBe(403);
    });

    it('allows add-parent for @scholarmancy.com emails', async () => {
      process.env['SEED_TOKEN'] = SEED_TOKEN;
      process.env['NODE_ENV'] = 'development';
      const userRepo = new UserRepository(database);
      const ownerEmail = `owner-${Date.now()}@scholarmancy.com`;
      const owner = await userRepo.create({
        email: ownerEmail,
        passwordHash: await UserRepository.hashPassword(DEMO_USER.password),
        name: DEMO_USER.name,
        role: 'parent',
      });
      const studentRepo = new StudentRepository(database);
      const student = await studentRepo.create({
        userId: owner._id!,
        name: 'Seed Child',
        grade: 8,
        studentId: `seed-child-${Date.now()}`,
        sharedWith: [],
      });
      const res = await request(app)
        .post('/api/seed/add-parent')
        .set('X-Seed-Token', SEED_TOKEN)
        .send({
          studentId: student._id!.toString(),
          email: `coparent-${Date.now()}@scholarmancy.com`,
          name: 'Co',
        });
      expect(res.status).toBe(200);
    });

    it('skips admin accounts when no admin credentials are configured', async () => {
      process.env['SEED_TOKEN'] = SEED_TOKEN;
      process.env['RAILWAY_ENVIRONMENT_ID'] = 'deployed-sim-no-admin-secrets';
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
