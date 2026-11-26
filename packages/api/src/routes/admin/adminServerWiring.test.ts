/**
 * The admin API as the server wires it.
 *
 * Each admin router has its own tests, and those build the router by hand and give it a
 * secret. Nothing checked what `createApp` gives each one. Three things were off:
 *
 * 1. Six admin routers (subscriptions, payments, coupons, analytics, reports, notes) were
 *    mounted without the server's token secret. They checked admin tokens with
 *    ADMIN_JWT_SECRET, then JWT_SECRET, then a built-in default, while admin sign-in signs
 *    with the server's secret. On Railway both come out as JWT_SECRET, so it worked. With
 *    ADMIN_JWT_SECRET set, or wherever the server's secret came from its config, those six
 *    areas answered 401 to a signed-in admin.
 * 2. Signing out was recorded and checked by the sign-in routes alone. Every other admin
 *    area builds its own auth service, without the record, and went on accepting the token.
 * 3. The admin address allowlist (ADMIN_IP_ALLOWLIST) was written and tested but never
 *    mounted, so setting it restricted nothing.
 */

import { once } from 'node:events';
import type { Server } from 'node:http';
import request from 'supertest';
import speakeasy from 'speakeasy';
import { MongoClient, ObjectId, type Db } from 'mongodb';

jest.mock('@sendgrid/mail', () => {
  const mockSend = jest
    .fn()
    .mockResolvedValue([{ statusCode: 202, body: { message_id: 'email-123' } }]);
  return {
    __esModule: true,
    default: { setApiKey: jest.fn(), send: mockSend },
  };
});

jest.mock('firebase-admin', () => ({
  __esModule: true,
  messaging: jest.fn(() => ({ send: jest.fn().mockResolvedValue('fcm-message-id') })),
  initializeApp: jest.fn(),
}));

import { createApp } from '../../server';
import { createTestAdmin } from '../../test-utils/admin-test-helper';

const SERVER_SECRET = 'admin-wiring-server-secret-do-not-use-in-prod';
const OTHER_SECRET = 'admin-wiring-other-secret-do-not-use-in-prod';
const ADMIN_EMAIL = 'admin-wiring@test.com';
const OTHER_ADMIN_EMAIL = 'admin-wiring-other@test.com';
const PASSWORD = 'AdminWiring!Passw0rd';

const LISTED_ADDRESS = '203.0.113.8';
const UNLISTED_ADDRESS = '198.51.100.1';
const ALLOWLIST = `203.0.113.7, ${LISTED_ADDRESS}`;
const NOT_LISTED = 'Access denied: IP address not in allowlist';

/** One read-only route from every admin router the server used to mount without a secret. */
const ADMIN_AREAS: ReadonlyArray<readonly [string, string]> = [
  ['subscriptions', '/api/admin/subscriptions'],
  ['payments', '/api/admin/payments'],
  ['coupons', '/api/admin/coupons'],
  ['analytics', '/api/admin/analytics/overview'],
  ['reports', '/api/admin/reports/export/customers'],
  ['notes', `/api/admin/customers/${new ObjectId().toHexString()}/notes`],
];
/** Those six and one router that always had the secret. */
const EVERY_AREA: readonly string[] = ['/api/admin/customers', ...ADMIN_AREAS.map(([, p]) => p)];

const APP_CONFIG = {
  jwtSecret: SERVER_SECRET,
  sendGridApiKey: 'SG.test-key',
  sendGridFromEmail: 'test@example.com',
  sendGridFromName: 'Test',
};

describe('Admin API as the server wires it', () => {
  let mongoClient: MongoClient;
  let database: Db;
  let token: string;
  let tokenFromOtherSecret: string;
  let mfaSecret: string;
  const servers: Server[] = [];
  const signedInTokenIds: string[] = [];
  const savedAllowlist = process.env['ADMIN_IP_ALLOWLIST'];
  const savedAdminSecret = process.env['ADMIN_JWT_SECRET'];

  const setOrUnset = (name: string, value: string | undefined): void => {
    if (value === undefined) {
      delete process.env[name];
    } else {
      process.env[name] = value;
    }
  };

  /**
   * Builds the app with the environment as it is now and starts it on 127.0.0.1.
   *
   * The tests hand supertest this server, not the app. Given an app, supertest listens on
   * every interface, and macOS may give it a port number that another program on the machine
   * already holds on 127.0.0.1. The request goes to 127.0.0.1 and that other program answers
   * it: a stray 401, a 404, or no answer at all. Listening on 127.0.0.1 ourselves rules that
   * out.
   */
  const startServer = async (): Promise<Server> => {
    const server = createApp(APP_CONFIG, database).listen(0, '127.0.0.1');
    await once(server, 'listening');
    servers.push(server);
    return server;
  };

  /** A server built with ADMIN_IP_ALLOWLIST set to `allowlist`, or unset. */
  const serverWithAllowlist = (allowlist: string | undefined): Promise<Server> => {
    setOrUnset('ADMIN_IP_ALLOWLIST', allowlist);
    return startServer();
  };

  const removeTestAdmins = async (): Promise<void> => {
    const admins = database.collection('admin_users');
    const emails = [ADMIN_EMAIL, OTHER_ADMIN_EMAIL];
    const ids = (await admins.find({ email: { $in: emails } }).toArray()).map((a) => a._id);
    await database.collection('sessions').deleteMany({ userType: 'admin', userId: { $in: ids } });
    await database
      .collection('admin_revoked_tokens')
      .deleteMany({ jti: { $in: signedInTokenIds } });
    await admins.deleteMany({ email: { $in: emails } });
  };

  /** Signs the test admin in through the API's own routes and returns the token it issues. */
  const signInThroughTheApi = async (server: Server): Promise<string> => {
    const login = await request(server)
      .post('/api/admin/auth/login')
      .send({ email: ADMIN_EMAIL, password: PASSWORD });
    expect(login.body.requiresMFA).toBe(true);

    const verify = await request(server)
      .post('/api/admin/auth/mfa/verify')
      .send({
        mfaToken: login.body.mfaToken,
        token: speakeasy.totp({ secret: mfaSecret, encoding: 'base32' }),
      });
    expect({ status: verify.status, error: verify.body.error }).toEqual({ status: 200 });

    const signedIn = verify.body.token as string;
    const payload = JSON.parse(
      Buffer.from(signedIn.split('.')[1] ?? '', 'base64url').toString()
    ) as { jti: string };
    signedInTokenIds.push(payload.jti);
    return signedIn;
  };

  beforeAll(async () => {
    const uri = process.env['MONGODB_URI'] ?? 'mongodb://localhost:27017';
    const dbName = process.env['MONGODB_DB_NAME'] ?? 'scholaracle_test';
    mongoClient = new MongoClient(uri);
    await mongoClient.connect();
    database = mongoClient.db(dbName);
    await removeTestAdmins();

    const admin = await createTestAdmin(database, SERVER_SECRET, {
      email: ADMIN_EMAIL,
      password: PASSWORD,
      name: 'Admin Wiring',
      role: 'admin',
    });
    token = admin.token;
    mfaSecret = admin.mfaSecret;

    const other = await createTestAdmin(database, OTHER_SECRET, {
      email: OTHER_ADMIN_EMAIL,
      password: PASSWORD,
      name: 'Admin Wiring Other',
      role: 'admin',
    });
    tokenFromOtherSecret = other.token;
  });

  afterEach(() => {
    setOrUnset('ADMIN_IP_ALLOWLIST', savedAllowlist);
    setOrUnset('ADMIN_JWT_SECRET', savedAdminSecret);
  });

  afterAll(async () => {
    await Promise.all(
      servers.map(
        (server) =>
          new Promise<void>((resolve) => {
            server.close(() => resolve());
            server.closeAllConnections();
          })
      )
    );
    await removeTestAdmins();
    await mongoClient.close();
  });

  describe('token secret', () => {
    let server: Server;

    beforeAll(async () => {
      server = await serverWithAllowlist(undefined);
    });

    it('the token is one the admin API accepts (customers)', async () => {
      const res = await request(server)
        .get('/api/admin/customers')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
    });

    it.each(ADMIN_AREAS)('%s accepts that same token', async (_area, path) => {
      const res = await request(server).get(path).set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
    });

    it.each(ADMIN_AREAS)('%s turns away a token signed with another secret', async (_a, path) => {
      const res = await request(server)
        .get(path)
        .set('Authorization', `Bearer ${tokenFromOtherSecret}`);

      expect(res.status).toBe(401);
    });

    it.each(ADMIN_AREAS)('%s turns away a request with no token', async (_area, path) => {
      const res = await request(server).get(path);

      expect(res.status).toBe(401);
    });

    it('a token from admin sign-in itself works in every admin area', async () => {
      const signedIn = await signInThroughTheApi(server);

      for (const path of EVERY_AREA) {
        const res = await request(server).get(path).set('Authorization', `Bearer ${signedIn}`);

        expect({ path, status: res.status }).toEqual({ path, status: 200 });
      }
    });

    it('and still does when ADMIN_JWT_SECRET is set to something else', async () => {
      // Sign-in and every admin area must agree on one secret, whatever this variable holds.
      process.env['ADMIN_JWT_SECRET'] = 'admin-wiring-a-third-secret-do-not-use-in-prod';
      const serverWithAdminSecret = await startServer();

      const signedIn = await signInThroughTheApi(serverWithAdminSecret);

      for (const path of EVERY_AREA) {
        const res = await request(serverWithAdminSecret)
          .get(path)
          .set('Authorization', `Bearer ${signedIn}`);

        expect({ path, status: res.status }).toEqual({ path, status: 200 });
      }
    });
  });

  describe('sign-out', () => {
    it('ends the token in every admin area, not only where sign-in lives', async () => {
      const server = await serverWithAllowlist(undefined);
      const signedIn = await signInThroughTheApi(server);
      const withToken = (path: string): Promise<request.Response> =>
        request(server).get(path).set('Authorization', `Bearer ${signedIn}`);

      expect((await withToken('/api/admin/customers')).status).toBe(200);

      const signOut = await request(server)
        .post('/api/admin/auth/logout')
        .set('Authorization', `Bearer ${signedIn}`);
      expect(signOut.status).toBe(200);

      for (const path of EVERY_AREA) {
        const res = await withToken(path);

        expect({ path, status: res.status }).toEqual({ path, status: 401 });
      }

      const repair = await request(server)
        .post('/api/scrapers/repair')
        .set('Authorization', `Bearer ${signedIn}`)
        .send({});
      expect(repair.status).toBe(401);
    });

    it('leaves another sign-in of the same admin working', async () => {
      const server = await serverWithAllowlist(undefined);
      const first = await signInThroughTheApi(server);
      const second = await signInThroughTheApi(server);

      await request(server).post('/api/admin/auth/logout').set('Authorization', `Bearer ${first}`);

      const res = await request(server)
        .get('/api/admin/customers')
        .set('Authorization', `Bearer ${second}`);
      expect(res.status).toBe(200);
    });
  });

  describe('address allowlist (ADMIN_IP_ALLOWLIST)', () => {
    const signIn = (server: Server, address: string): Promise<request.Response> =>
      request(server)
        .post('/api/admin/auth/login')
        .set('X-Forwarded-For', address)
        .send({ email: 'nobody-admin-wiring@test.com', password: 'not-a-real-password' });

    it('unset: any address reaches admin sign-in', async () => {
      const server = await serverWithAllowlist(undefined);

      const res = await signIn(server, UNLISTED_ADDRESS);

      // Wrong credentials, so 401 from the sign-in handler: the request got that far.
      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Invalid email or password');
    });

    it('set: an address that is not listed is refused before sign-in is looked at', async () => {
      const server = await serverWithAllowlist(ALLOWLIST);

      const res = await signIn(server, UNLISTED_ADDRESS);

      expect({ status: res.status, success: res.body.success, error: res.body.error }).toEqual({
        status: 403,
        success: false,
        error: NOT_LISTED,
      });
    });

    it('set: an unlisted address is refused on every admin area, valid token or not', async () => {
      const server = await serverWithAllowlist(ALLOWLIST);

      for (const path of EVERY_AREA) {
        const res = await request(server)
          .get(path)
          .set('X-Forwarded-For', UNLISTED_ADDRESS)
          .set('Authorization', `Bearer ${token}`);

        expect({ path, status: res.status, error: res.body.error }).toEqual({
          path,
          status: 403,
          error: NOT_LISTED,
        });
      }
    });

    it('set: the scraper repair route, which also takes an admin token, is covered too', async () => {
      const server = await serverWithAllowlist(ALLOWLIST);
      const repair = (address: string): Promise<request.Response> =>
        request(server)
          .post('/api/scrapers/repair')
          .set('X-Forwarded-For', address)
          .set('Authorization', `Bearer ${token}`)
          .send({});

      const unlisted = await repair(UNLISTED_ADDRESS);
      expect({ status: unlisted.status, error: unlisted.body.error }).toEqual({
        status: 403,
        error: NOT_LISTED,
      });

      // A listed address gets as far as the route's own check of the request body.
      const listed = await repair(LISTED_ADDRESS);
      expect(listed.status).toBe(400);
    });

    it('set: a listed address works as before', async () => {
      const server = await serverWithAllowlist(ALLOWLIST);

      const signInRes = await signIn(server, LISTED_ADDRESS);
      expect(signInRes.status).toBe(401);
      expect(signInRes.body.error).toBe('Invalid email or password');

      const dataRes = await request(server)
        .get('/api/admin/customers')
        .set('X-Forwarded-For', LISTED_ADDRESS)
        .set('Authorization', `Bearer ${token}`);
      expect(dataRes.status).toBe(200);
    });

    it('set: a request that names no address is checked by where it came from', async () => {
      const server = await serverWithAllowlist(ALLOWLIST);

      // No X-Forwarded-For, so the address is the test's own (127.0.0.1), which is not listed.
      const res = await request(server)
        .get('/api/admin/customers')
        .set('Authorization', `Bearer ${token}`);

      expect({ status: res.status, error: res.body.error }).toEqual({
        status: 403,
        error: NOT_LISTED,
      });
    });

    it('set: the rest of the API is not restricted', async () => {
      const server = await serverWithAllowlist(ALLOWLIST);

      const health = await request(server)
        .get('/api/health')
        .set('X-Forwarded-For', UNLISTED_ADDRESS);
      expect(health.status).toBe(200);

      const parentSignIn = await request(server)
        .post('/api/auth/login')
        .set('X-Forwarded-For', UNLISTED_ADDRESS)
        .send({ email: 'nobody-admin-wiring@test.com', password: 'not-a-real-password' });
      expect(parentSignIn.status).toBe(401);
    });
  });
});
