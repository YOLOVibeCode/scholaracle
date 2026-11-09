/**
 * Integration tests for the phone app's Sign in with Apple route and Apple-proof account deletion.
 * Needs MongoDB (skips without one, like the rest of the auth tests).
 */
import request from 'supertest';
import express, { type Express } from 'express';
import crypto from 'node:crypto';
import { MongoClient, type Db } from 'mongodb';
import {
  OAuthAccountRepository,
  PasswordResetTokenRepository,
  RefreshTokenRepository,
  UserRepository,
} from '@scholaracle/database';
import { authRouter } from './auth';
import { createAccountRouter } from '../account/account';
import { createErrorHandler } from '../../middleware/errorHandler';
import { APPLE_ISSUER, resetAppleJwksCacheForTests } from './appleIdentityToken';

const b64 = (buf: Buffer): string =>
  buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const b64json = (o: unknown): string => b64(Buffer.from(JSON.stringify(o), 'utf8'));

const EMAIL_NEW = 'apple.native.new@example.com';
const EMAIL_PW = 'apple.native.pw@example.com';
const EMAIL_OTHER = 'apple.native.other@example.com';

describe('native Apple login + Apple-proof deletion', () => {
  let app: Express;
  let database: Db;
  let mongo: MongoClient | undefined;
  let signer: { privateKey: crypto.KeyObject; jwk: crypto.JsonWebKey & { kid: string } };
  let currentUserId = '';
  const oldFetch = global.fetch;

  const appleToken = (claims: Record<string, unknown>, rawNonce = 'raw-nonce'): string => {
    const now = Math.floor(Date.now() / 1000);
    const header = b64json({ alg: 'ES256', kid: signer.jwk.kid });
    const payload = b64json({
      iss: APPLE_ISSUER,
      aud: 'com.scholarmancy.app',
      exp: now + 3600,
      iat: now,
      nonce: crypto.createHash('sha256').update(rawNonce, 'utf8').digest('hex'),
      ...claims,
    });
    const sig = crypto.sign('sha256', Buffer.from(`${header}.${payload}`, 'utf8'), {
      key: signer.privateKey,
      dsaEncoding: 'ieee-p1363',
    });
    return `${header}.${payload}.${b64(sig)}`;
  };

  beforeAll(async () => {
    try {
      mongo = new MongoClient(process.env['MONGODB_URI'] ?? 'mongodb://localhost:27017');
      await mongo.connect();
      database = mongo.db(process.env['MONGODB_DB_NAME'] ?? 'scholaracle_test');
    } catch {
      // eslint-disable-next-line no-console
      console.warn('MongoDB not available, skipping integration tests');
      mongo = undefined;
      return;
    }
    const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
    signer = {
      privateKey,
      jwk: { ...(publicKey.export({ format: 'jwk' }) as crypto.JsonWebKey), kid: 'native-kid' },
    };
    app = express();
    app.use(express.json());
    app.use(
      '/api/auth',
      authRouter({
        database,
        jwtSecret: 'test-secret',
        jwtExpiresIn: '15m',
        passwordResetTokenStore: new PasswordResetTokenRepository(database),
        passwordResetEmailSender: { sendResetLink: async (): Promise<void> => {} },
        baseUrl: 'http://localhost:2800',
        refreshTokenStore: new RefreshTokenRepository(database),
        refreshTokenExpiresIn: '30d',
        oauthAccountRepository: new OAuthAccountRepository(database),
      })
    );
    // Stand-in for the JWT middleware: the signed-in user for the account routes.
    app.use('/api/account', (req, _res, next) => {
      Object.assign(req, { userId: currentUserId, userRole: 'parent' });
      next();
    });
    app.use('/api/account', createAccountRouter({ database, baseUrl: 'http://localhost:2800' }));
    app.use(createErrorHandler());
  });

  afterAll(async () => {
    global.fetch = oldFetch;
    await mongo?.close();
  });

  beforeEach(async () => {
    if (!mongo) return;
    resetAppleJwksCacheForTests();
    global.fetch = jest
      .fn()
      .mockImplementation(async (url: string) =>
        url.includes('/auth/keys')
          ? ({ ok: true, json: async () => ({ keys: [signer.jwk] }) } as Response)
          : ({ ok: false, status: 404 } as Response)
      );
    const users = await database
      .collection('users')
      .find({ email: { $in: [EMAIL_NEW, EMAIL_PW, EMAIL_OTHER] } })
      .toArray();
    const ids = users.map((u) => String(u._id));
    await database.collection('oauth_accounts').deleteMany({ userId: { $in: ids } });
    await database.collection('oauth_accounts').deleteMany({ providerAccountId: /^native-/ });
    await database
      .collection('users')
      .deleteMany({ email: { $in: [EMAIL_NEW, EMAIL_PW, EMAIL_OTHER] } });
  });

  describe('POST /api/auth/oauth/apple', () => {
    it('needs no shared secret and rejects a missing token', async () => {
      if (!mongo) return;
      const res = await request(app).post('/api/auth/oauth/apple').send({});
      expect(res.status).toBe(400);
    });

    it('rejects a token with a forged signature', async () => {
      if (!mongo) return;
      const good = appleToken({ sub: 'native-forged', email: EMAIL_NEW });
      const forged = `${good.split('.').slice(0, 2).join('.')}.${b64(crypto.randomBytes(64))}`;
      const res = await request(app)
        .post('/api/auth/oauth/apple')
        .send({ appleIdentityToken: forged, appleNonce: 'raw-nonce' });
      expect(res.status).toBe(401);
    });

    it('creates the account from the VERIFIED email, ignoring any email or id in the body', async () => {
      if (!mongo) return;
      const res = await request(app)
        .post('/api/auth/oauth/apple')
        .send({
          appleIdentityToken: appleToken({ sub: 'native-new', email: EMAIL_NEW }),
          appleNonce: 'raw-nonce',
          name: 'Native Parent',
          email: 'victim@example.com',
          providerAccountId: 'attacker-chosen',
        });
      expect(res.status).toBe(200);
      expect(res.body.token).toBeDefined();
      expect(res.body.user.email).toBe(EMAIL_NEW);
      const link = await database
        .collection('oauth_accounts')
        .findOne({ providerAccountId: 'native-new' });
      expect(link).not.toBeNull();
      expect(
        await database.collection('users').findOne({ email: 'victim@example.com' })
      ).toBeNull();
    });

    it('will not create or link an account when the token carries no email', async () => {
      if (!mongo) return;
      const res = await request(app)
        .post('/api/auth/oauth/apple')
        .send({
          appleIdentityToken: appleToken({ sub: 'native-noemail' }),
          appleNonce: 'raw-nonce',
          email: EMAIL_PW,
        });
      expect(res.status).toBe(400);
      expect(String(res.body.error)).toMatch(/email/i);
      expect(await database.collection('users').findOne({ email: EMAIL_PW })).toBeNull();
    });

    it('signs an existing linked user in even when later tokens omit the email', async () => {
      if (!mongo) return;
      await request(app)
        .post('/api/auth/oauth/apple')
        .send({
          appleIdentityToken: appleToken({ sub: 'native-return', email: EMAIL_NEW }),
          appleNonce: 'raw-nonce',
        });
      const again = await request(app)
        .post('/api/auth/oauth/apple')
        .send({
          appleIdentityToken: appleToken({ sub: 'native-return' }),
          appleNonce: 'raw-nonce',
        });
      expect(again.status).toBe(200);
      expect(again.body.user.email).toBe(EMAIL_NEW);
    });
  });

  describe('DELETE /api/account with an Apple proof', () => {
    const signInApple = async (sub: string, email: string): Promise<string> => {
      const res = await request(app)
        .post('/api/auth/oauth/apple')
        .send({ appleIdentityToken: appleToken({ sub, email }), appleNonce: 'raw-nonce' });
      return String(res.body.user.id);
    };

    it('deletes the account when the fresh Apple token belongs to that user', async () => {
      if (!mongo) return;
      currentUserId = await signInApple('native-del', EMAIL_NEW);
      const res = await request(app)
        .delete('/api/account')
        .send({ appleIdentityToken: appleToken({ sub: 'native-del' }), appleNonce: 'raw-nonce' });
      expect(res.status).toBe(200);
      expect(await database.collection('users').findOne({ email: EMAIL_NEW })).toBeNull();
    });

    it("refuses another person's Apple token", async () => {
      if (!mongo) return;
      currentUserId = await signInApple('native-mine', EMAIL_NEW);
      await signInApple('native-theirs', EMAIL_OTHER);
      const res = await request(app)
        .delete('/api/account')
        .send({
          appleIdentityToken: appleToken({ sub: 'native-theirs' }),
          appleNonce: 'raw-nonce',
        });
      expect(res.status).toBe(401);
      expect(await database.collection('users').findOne({ email: EMAIL_NEW })).not.toBeNull();
    });

    it('refuses a bad token, and an empty request', async () => {
      if (!mongo) return;
      currentUserId = await signInApple('native-bad', EMAIL_NEW);
      const bad = await request(app)
        .delete('/api/account')
        .send({ appleIdentityToken: 'not.a.jwt', appleNonce: 'raw-nonce' });
      expect(bad.status).toBe(401);
      const empty = await request(app).delete('/api/account').send({});
      expect(empty.status).toBe(400);
      expect(await database.collection('users').findOne({ email: EMAIL_NEW })).not.toBeNull();
    });

    it('still requires the right password for password accounts', async () => {
      if (!mongo) return;
      const hash = await UserRepository.hashPassword('correct-horse-1');
      const created = await new UserRepository(database).create({
        email: EMAIL_PW,
        passwordHash: hash,
        name: 'Pw',
        role: 'parent',
      });
      currentUserId = String(created._id);
      const wrong = await request(app).delete('/api/account').send({ password: 'nope' });
      expect(wrong.status).toBe(401);
      const ok = await request(app).delete('/api/account').send({ password: 'correct-horse-1' });
      expect(ok.status).toBe(200);
    });
  });
});
