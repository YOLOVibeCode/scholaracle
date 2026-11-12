/**
 * DELETE /api/account revokes the user's Sign in with Apple tokens (App Review 5.1.1(v)).
 * Real auth and account routers on an in-memory MongoDB; Apple's key set and the revoker
 * are stand-ins, so Apple is never called.
 */

import request from 'supertest';
import express, { type Express } from 'express';
import crypto from 'node:crypto';
import { MongoClient, type Db } from 'mongodb';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { AuthService } from '@scholaracle/auth';
import { OAuthAccountRepository } from '@scholaracle/database';
import { authRouter } from '../auth/auth';
import { createAccountRouter } from './account';
import { authMiddleware } from '../../middleware/auth';
import { createErrorHandler } from '../../middleware/errorHandler';
import { APPLE_ISSUER, resetAppleJwksCacheForTests } from '../auth/appleIdentityToken';
import type {
  AppleRevocationOutcome,
  IAppleTokenRevoker,
} from '../../services/apple/appleTokenRevocation';

const JWT_SECRET = 'test-secret';
const BUNDLE_ID = 'com.scholarmancy.app';
const SUB = 'revocation-sub-1';
const EMAIL = 'apple.revocation@example.com';

const b64 = (buf: Buffer): string => buf.toString('base64url');
const b64json = (o: unknown): string => b64(Buffer.from(JSON.stringify(o), 'utf8'));

describe('account deletion revokes Apple tokens', () => {
  jest.setTimeout(120_000);
  let mongoServer: MongoMemoryServer;
  let client: MongoClient;
  let database: Db;
  let app: Express;
  let signer: { privateKey: crypto.KeyObject; jwk: crypto.JsonWebKey & { kid: string } };
  const oldFetch = global.fetch;

  const revokeCalls: { code: string; clientId: string; sub: string }[] = [];
  let revokeBehaviour: () => Promise<AppleRevocationOutcome> = async () => ({ status: 'revoked' });
  const revoker: IAppleTokenRevoker = {
    revokeWithAuthorizationCode: async (code, clientId, sub) => {
      revokeCalls.push({ code, clientId, sub });
      return revokeBehaviour();
    },
  };

  const appleToken = (claims: Record<string, unknown>, rawNonce = 'raw-nonce'): string => {
    const now = Math.floor(Date.now() / 1000);
    const header = b64json({ alg: 'ES256', kid: signer.jwk.kid });
    const payload = b64json({
      iss: APPLE_ISSUER,
      aud: BUNDLE_ID,
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

  /** Sign in with Apple through the real route; returns the session token. */
  const signInWithApple = async (sub = SUB, email = EMAIL): Promise<string> => {
    const res = await request(app)
      .post('/api/auth/oauth/apple')
      .send({ appleIdentityToken: appleToken({ sub, email }), appleNonce: 'raw-nonce' });
    expect(res.status).toBe(200);
    return res.body.token as string;
  };

  const deleteAccount = (token: string, body: Record<string, unknown>): request.Test =>
    request(app).delete('/api/account').set('Authorization', `Bearer ${token}`).send(body);

  const userExists = async (email = EMAIL): Promise<boolean> =>
    (await database.collection('users').findOne({ email })) !== null;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    client = new MongoClient(mongoServer.getUri());
    await client.connect();
    database = client.db('account-apple-revocation');
    const oauthAccountRepository = new OAuthAccountRepository(database);
    const authService = new AuthService(
      database,
      JWT_SECRET,
      '15m',
      undefined,
      undefined,
      'http://test.example',
      undefined,
      '30d',
      '24h',
      oauthAccountRepository
    );

    const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
    signer = {
      privateKey,
      jwk: { ...(publicKey.export({ format: 'jwk' }) as crypto.JsonWebKey), kid: 'revocation-kid' },
    };

    app = express();
    app.use(express.json());
    app.use(
      '/api/auth',
      authRouter({ database, jwtSecret: JWT_SECRET, authService, oauthAccountRepository })
    );
    app.use(
      '/api/account',
      authMiddleware(authService),
      createAccountRouter({
        database,
        baseUrl: 'http://test.example',
        appleTokenRevoker: revoker,
      })
    );
    app.use(createErrorHandler());
  });

  afterAll(async () => {
    global.fetch = oldFetch;
    await client.close();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    resetAppleJwksCacheForTests();
    global.fetch = jest
      .fn()
      .mockImplementation(async (url: string) =>
        url.includes('/auth/keys')
          ? ({ ok: true, json: async () => ({ keys: [signer.jwk] }) } as Response)
          : ({ ok: false, status: 404 } as Response)
      );
    revokeCalls.length = 0;
    revokeBehaviour = async () => ({ status: 'revoked' });
    await database.dropDatabase();
  });

  it('revokes with the code, the app id from the token and the verified Apple account', async () => {
    const session = await signInWithApple();

    const res = await deleteAccount(session, {
      appleIdentityToken: appleToken({ sub: SUB, email: EMAIL }),
      appleNonce: 'raw-nonce',
      appleAuthorizationCode: '  fresh-code-1  ',
    });

    expect(res.status).toBe(200);
    expect(revokeCalls).toEqual([{ code: 'fresh-code-1', clientId: BUNDLE_ID, sub: SUB }]);
    expect(await userExists()).toBe(false);
  });

  it.each([
    [
      'Apple refuses the code',
      async (): Promise<AppleRevocationOutcome> => ({
        status: 'failed',
        step: 'exchange',
        reason: '400 invalid_grant',
      }),
    ],
    [
      'the server has no Apple key',
      async (): Promise<AppleRevocationOutcome> => ({
        status: 'not_configured',
      }),
    ],
    [
      'the revoker throws',
      async (): Promise<AppleRevocationOutcome> => {
        throw new Error('boom');
      },
    ],
  ])('still deletes the account when %s', async (_name, behaviour) => {
    revokeBehaviour = behaviour;
    const session = await signInWithApple();

    const res = await deleteAccount(session, {
      appleIdentityToken: appleToken({ sub: SUB, email: EMAIL }),
      appleNonce: 'raw-nonce',
      appleAuthorizationCode: 'fresh-code-1',
    });

    expect(res.status).toBe(200);
    expect(revokeCalls).toHaveLength(1);
    expect(await userExists()).toBe(false);
  });

  it('still deletes when an older app sends no code, and revokes nothing', async () => {
    const session = await signInWithApple();

    const res = await deleteAccount(session, {
      appleIdentityToken: appleToken({ sub: SUB, email: EMAIL }),
      appleNonce: 'raw-nonce',
    });

    expect(res.status).toBe(200);
    expect(revokeCalls).toHaveLength(0);
    expect(await userExists()).toBe(false);
  });

  it('revokes nothing when the Apple proof is for someone else’s account', async () => {
    const session = await signInWithApple();
    await signInWithApple('revocation-sub-2', 'apple.other@example.com');

    const res = await deleteAccount(session, {
      appleIdentityToken: appleToken({ sub: 'revocation-sub-2', email: 'apple.other@example.com' }),
      appleNonce: 'raw-nonce',
      appleAuthorizationCode: 'fresh-code-1',
    });

    expect(res.status).toBe(401);
    expect(revokeCalls).toHaveLength(0);
    expect(await userExists()).toBe(true);
    expect(await userExists('apple.other@example.com')).toBe(true);
  });

  it('revokes nothing when the Apple proof is invalid', async () => {
    const session = await signInWithApple();
    const good = appleToken({ sub: SUB, email: EMAIL });
    const forged = `${good.split('.').slice(0, 2).join('.')}.${b64(crypto.randomBytes(64))}`;

    const res = await deleteAccount(session, {
      appleIdentityToken: forged,
      appleNonce: 'raw-nonce',
      appleAuthorizationCode: 'fresh-code-1',
    });

    expect(res.status).toBe(401);
    expect(revokeCalls).toHaveLength(0);
    expect(await userExists()).toBe(true);
  });

  it('a password deletion does not call Apple', async () => {
    const authService = new AuthService(database, JWT_SECRET);
    const password = `Pw-${crypto.randomBytes(9).toString('hex')}`;
    const registered = await authService.register('password.parent@example.com', password, 'P');

    const res = await deleteAccount(registered.token as string, {
      password,
      appleAuthorizationCode: 'fresh-code-1',
    });

    expect(res.status).toBe(200);
    expect(revokeCalls).toHaveLength(0);
    expect(await userExists('password.parent@example.com')).toBe(false);
  });
});
