/**
 * The demo household repairs itself at sign-in when a private demo password is configured,
 * and stays untouched when it is not. Real routers on an in-memory MongoDB.
 */

import request from 'supertest';
import express, { type Express } from 'express';
import { MongoClient, type Db } from 'mongodb';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { AuthService } from '@scholaracle/auth';
import { UserRepository } from '@scholaracle/database';
import { authRouter } from '../../routes/auth/auth';
import { createAccountRouter } from '../../routes/account/account';
import { authMiddleware } from '../../middleware/auth';
import { createErrorHandler } from '../../middleware/errorHandler';
import {
  DEMO_CONTACT_JESSICA,
  DEMO_STUDENT_USER_EMMA,
  DEMO_STUDENTS,
  DEMO_USER,
} from '../../routes/seed/demo-data';
import { ensureDemoHousehold } from '../../routes/seed/seed';
import {
  DEMO_ACCOUNT_PASSWORD_ENV,
  DEMO_ACCOUNT_PASSWORD_MIN_LENGTH,
  configuredDemoPassword,
  createDemoSignInRepair,
  isDemoParentEmail,
} from './demoSignInRepair';

// Built at run time so no password literal sits in the repo for the private value.
const PRIVATE_PASSWORD = `Review-${'x'.repeat(DEMO_ACCOUNT_PASSWORD_MIN_LENGTH)}-7`;
const JWT_SECRET = 'test-secret';

describe('configuredDemoPassword', () => {
  it('is off when the variable is missing, empty or too short', () => {
    expect(configuredDemoPassword({})).toBeNull();
    expect(configuredDemoPassword({ [DEMO_ACCOUNT_PASSWORD_ENV]: '' })).toBeNull();
    expect(configuredDemoPassword({ [DEMO_ACCOUNT_PASSWORD_ENV]: 'short-one' })).toBeNull();
  });

  it('returns the value when it is long enough', () => {
    expect(configuredDemoPassword({ [DEMO_ACCOUNT_PASSWORD_ENV]: PRIVATE_PASSWORD })).toBe(
      PRIVATE_PASSWORD
    );
  });
});

describe('isDemoParentEmail', () => {
  it('matches the demo parent only, ignoring case and outer spaces', () => {
    expect(isDemoParentEmail(DEMO_USER.email)).toBe(true);
    expect(isDemoParentEmail(`  ${DEMO_USER.email.toUpperCase()} `)).toBe(true);
    expect(isDemoParentEmail(DEMO_STUDENT_USER_EMMA.email)).toBe(false);
    expect(isDemoParentEmail('someone@example.com')).toBe(false);
  });
});

describe('demo sign-in repair', () => {
  jest.setTimeout(120_000);
  let mongoServer: MongoMemoryServer;
  let client: MongoClient;
  let database: Db;
  let app: Express;
  const env: NodeJS.ProcessEnv = {};

  const login = (email: string, password: string): request.Test =>
    request(app).post('/api/auth/login').send({ email, password });

  const demoParent = (): Promise<{ _id?: unknown; passwordHash: string } | null> =>
    database.collection<{ passwordHash: string }>('users').findOne({ email: DEMO_USER.email });

  const demoStudentNames = async (): Promise<string[]> => {
    const parent = await demoParent();
    if (!parent?._id) return [];
    const rows = await database
      .collection('students')
      .find({ userId: { $in: [parent._id, String(parent._id)] } })
      .toArray();
    return rows.map((r) => String(r['name'])).sort();
  };

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    client = new MongoClient(mongoServer.getUri());
    await client.connect();
    database = client.db('demo-sign-in-repair');
    const authService = new AuthService(database, JWT_SECRET);

    app = express();
    app.use(express.json());
    app.use(
      '/api/auth',
      authRouter({
        database,
        jwtSecret: JWT_SECRET,
        authService,
        beforeLogin: createDemoSignInRepair({ database, jwtSecret: JWT_SECRET, env }),
      })
    );
    app.use(
      '/api/account',
      authMiddleware(authService),
      createAccountRouter({ database, baseUrl: 'http://test.example' })
    );
    app.use(createErrorHandler());
  });

  afterAll(async () => {
    await client.close();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    delete env[DEMO_ACCOUNT_PASSWORD_ENV];
    await database.dropDatabase();
  });

  describe('without DEMO_ACCOUNT_PASSWORD (every server until the owner sets it)', () => {
    it('creates nothing: a sign-in to a missing demo account just fails', async () => {
      const res = await login(DEMO_USER.email, DEMO_USER.password);
      expect(res.status).toBe(401);
      expect(await demoParent()).toBeNull();
    });

    it('leaves a seeded demo household and its documented password alone', async () => {
      await ensureDemoHousehold({ database, jwtSecret: JWT_SECRET });
      const before = await demoParent();

      const res = await login(DEMO_USER.email, DEMO_USER.password);
      expect(res.status).toBe(200);
      expect((await demoParent())?.passwordHash).toBe(before?.passwordHash);
    });
  });

  describe('with DEMO_ACCOUNT_PASSWORD', () => {
    beforeEach(() => {
      env[DEMO_ACCOUNT_PASSWORD_ENV] = PRIVATE_PASSWORD;
    });

    it('creates the household on the first sign-in with the private password', async () => {
      const res = await login(DEMO_USER.email, PRIVATE_PASSWORD);

      expect(res.status).toBe(200);
      expect(res.body.token).toEqual(expect.any(String));
      expect(await demoStudentNames()).toEqual(DEMO_STUDENTS.map((s) => s.name).sort());
      const parent = await demoParent();
      expect(
        await database.collection('slc_assignments').countDocuments({ userId: String(parent?._id) })
      ).toBeGreaterThan(0);
    });

    it('moves every demo login to the private password: the public one stops working', async () => {
      await ensureDemoHousehold({ database, jwtSecret: JWT_SECRET });
      expect((await login(DEMO_USER.email, DEMO_USER.password)).status).toBe(200);

      expect((await login(DEMO_USER.email, PRIVATE_PASSWORD)).status).toBe(200);

      expect((await login(DEMO_USER.email, DEMO_USER.password)).status).toBe(401);
      expect(
        (await login(DEMO_STUDENT_USER_EMMA.email, DEMO_STUDENT_USER_EMMA.password)).status
      ).toBe(401);
      expect((await login(DEMO_CONTACT_JESSICA, DEMO_USER.password)).status).toBe(401);
      expect((await login(DEMO_CONTACT_JESSICA, PRIVATE_PASSWORD)).status).toBe(200);
    });

    it('a reviewer can really delete the account, and the same sign-in works again', async () => {
      const first = await login(DEMO_USER.email, PRIVATE_PASSWORD);
      expect(first.status).toBe(200);

      const del = await request(app)
        .delete('/api/account')
        .set('Authorization', `Bearer ${first.body.token as string}`)
        .send({ password: PRIVATE_PASSWORD });
      expect(del.status).toBe(200);
      expect(await demoParent()).toBeNull();
      expect(await database.collection('students').countDocuments({})).toBe(0);

      const again = await login(DEMO_USER.email, PRIVATE_PASSWORD);
      expect(again.status).toBe(200);
      expect(await demoStudentNames()).toEqual(DEMO_STUDENTS.map((s) => s.name).sort());
    });

    it('puts back a changed password and lifts a suspension', async () => {
      expect((await login(DEMO_USER.email, PRIVATE_PASSWORD)).status).toBe(200);
      const parent = await demoParent();
      await database.collection('users').updateOne(
        { email: DEMO_USER.email },
        {
          $set: {
            passwordHash: await UserRepository.hashPassword('Someone-Else-Changed-It-1'),
            isSuspended: true,
          },
        }
      );

      const res = await login(DEMO_USER.email, PRIVATE_PASSWORD);

      expect(res.status).toBe(200);
      expect(String((await demoParent())?._id)).toBe(String(parent?._id));
    });

    it('does not add students or sample data twice', async () => {
      await login(DEMO_USER.email, PRIVATE_PASSWORD);
      const parent = await demoParent();
      const count = (): Promise<number> =>
        database.collection('slc_assignments').countDocuments({ userId: String(parent?._id) });
      const assignments = await count();

      await Promise.all([
        login(DEMO_USER.email, PRIVATE_PASSWORD),
        login(DEMO_USER.email, PRIVATE_PASSWORD),
      ]);

      expect(await demoStudentNames()).toHaveLength(DEMO_STUDENTS.length);
      expect(await count()).toBe(assignments);
    });

    it('a wrong password repairs nothing and fails like any sign-in', async () => {
      const res = await login(DEMO_USER.email, `${PRIVATE_PASSWORD}-wrong`);
      expect(res.status).toBe(401);
      expect(await demoParent()).toBeNull();
    });

    it('the public demo password does not trigger a repair', async () => {
      const res = await login(DEMO_USER.email, DEMO_USER.password);
      expect(res.status).toBe(401);
      expect(await demoParent()).toBeNull();
    });

    it('other accounts are never touched, even with the same password', async () => {
      const authService = new AuthService(database, JWT_SECRET);
      await authService.register('parent@example.com', PRIVATE_PASSWORD, 'Real Parent');

      const res = await login('parent@example.com', PRIVATE_PASSWORD);

      expect(res.status).toBe(200);
      expect(await demoParent()).toBeNull();
      expect(await database.collection('students').countDocuments({})).toBe(0);
    });
  });

  it('a failing repair never blocks the sign-in', async () => {
    env[DEMO_ACCOUNT_PASSWORD_ENV] = PRIVATE_PASSWORD;
    const hook = createDemoSignInRepair({
      database,
      env,
      ensure: async () => {
        throw new Error('database unavailable');
      },
    });

    await expect(hook(DEMO_USER.email, PRIVATE_PASSWORD)).resolves.toBeUndefined();
  });
});
