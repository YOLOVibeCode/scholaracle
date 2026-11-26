import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import speakeasy from 'speakeasy';
import { MongoClient, type Db } from 'mongodb';
import { AdminUserRepository, type IAdminRevokedTokenStore } from '@scholaracle/database';
import { AdminAuthService } from './AdminAuthService';
import { MFAService } from '../MFAService';

/**
 * Signing out records the token as revoked, and every later check of that token must see it.
 *
 * The record was kept and checked only by a service that had been handed a store for it.
 * The server handed one to the sign-in routes and to nothing else, so each other admin area,
 * which builds its own service, went on accepting a signed-out token until it expired.
 * Now a service that is given no store keeps the record in the database it already has.
 */

const PASSWORD = 'AdminPass123!';
const EMAIL = 'sign-out@admin-revocation.test';
const EMAIL_PATTERN = /@admin-revocation\.test$/;

const claims = (token: string): { jti: string; exp: number } =>
  JSON.parse(Buffer.from(token.split('.')[1] ?? '', 'base64url').toString()) as {
    jti: string;
    exp: number;
  };
const tokenId = (token: string): string => claims(token).jti;
/** When the token expires, in milliseconds. */
const expiry = (token: string): number => claims(token).exp * 1000;

describe('AdminAuthService: a signed-out token is refused everywhere', () => {
  let client: MongoClient;
  let database: Db;
  let mfaService: MFAService;
  let mfaSecret: string;
  const issuedTokenIds: string[] = [];

  /** A service built the way the admin routers build theirs: a database and a secret. */
  const plainService = (): AdminAuthService => new AdminAuthService(database, 'test-secret');

  async function signIn(service: AdminAuthService): Promise<string> {
    const passwordStep = await service.login(EMAIL, PASSWORD);
    const codeStep = await service.verifyMFAToken(
      passwordStep.mfaToken ?? '',
      speakeasy.totp({ secret: mfaSecret, encoding: 'base32' })
    );
    expect(codeStep).toMatchObject({ success: true });
    const token = codeStep.token ?? '';
    issuedTokenIds.push(tokenId(token));
    return token;
  }

  beforeAll(async () => {
    const uri = process.env['MONGODB_URI'] ?? 'mongodb://localhost:27017';
    client = new MongoClient(uri);
    await client.connect();
    database = client.db('scholaracle_test');
    mfaService = new MFAService();
    await database.collection('admin_users').deleteMany({ email: EMAIL_PATTERN });

    mfaSecret = mfaService.generateSecret(EMAIL).secret;
    await new AdminUserRepository(database).create({
      email: EMAIL,
      passwordHash: await AdminUserRepository.hashPassword(PASSWORD),
      name: 'Sign Out',
      role: 'admin',
      mfaEnabled: true,
      mfaSecret,
    });
  });

  afterAll(async () => {
    await database.collection('admin_users').deleteMany({ email: EMAIL_PATTERN });
    await database.collection('admin_revoked_tokens').deleteMany({ jti: { $in: issuedTokenIds } });
    await client.close();
  });

  it('is refused by the service that signed it out', async () => {
    const service = plainService();
    const token = await signIn(service);
    expect(await service.verifyToken(token)).toMatchObject({ email: EMAIL });

    expect(await service.logout(token)).toBe(true);

    expect(await service.verifyToken(token)).toBeNull();
  });

  it('is refused by every other service on the same database', async () => {
    const signInService = plainService();
    const anotherArea = plainService();
    const token = await signIn(signInService);
    expect(await anotherArea.verifyToken(token)).toMatchObject({ email: EMAIL });

    await signInService.logout(token);

    expect(await anotherArea.verifyToken(token)).toBeNull();
    expect((await anotherArea.refreshToken(token)).success).toBe(false);
  });

  it('leaves the same admin signed in elsewhere', async () => {
    const service = plainService();
    const signedOut = await signIn(service);
    const kept = await signIn(service);

    await service.logout(signedOut);

    expect(await service.verifyToken(signedOut)).toBeNull();
    expect(await service.verifyToken(kept)).toMatchObject({ email: EMAIL });
  });

  describe('a token that was refreshed', () => {
    it('keeps its id, so it stays the same session', async () => {
      const service = plainService();
      const token = await signIn(service);

      const refreshed = await service.refreshToken(token);

      expect(refreshed.success).toBe(true);
      expect(tokenId(refreshed.token ?? '')).toBe(tokenId(token));
    });

    it('is ended by signing out with the token it replaced', async () => {
      const service = plainService();
      const token = await signIn(service);
      const refreshed = (await service.refreshToken(token)).token ?? '';
      expect(await service.verifyToken(refreshed)).toMatchObject({ email: EMAIL });

      await service.logout(token);

      expect(await service.verifyToken(refreshed)).toBeNull();
    });

    it('is covered by the sign-out record for as long as it can live', async () => {
      const service = plainService();
      const admin = await service.verifyToken(await signIn(service));
      // The same admin four hours into a session: the first token has four hours left, and
      // the one it is refreshed into has eight.
      const fourHoursAgo = Math.floor(Date.now() / 1000) - 4 * 60 * 60;
      const firstToken = jwt.sign(
        { adminId: admin?.adminId, email: EMAIL, role: 'admin', type: 'admin', iat: fourHoursAgo },
        'test-secret',
        { expiresIn: '8h', jwtid: `four-hours-in-${crypto.randomUUID()}` }
      );
      issuedTokenIds.push(tokenId(firstToken));
      const refreshed = (await service.refreshToken(firstToken)).token ?? '';
      expect(expiry(refreshed)).toBeGreaterThan(expiry(firstToken));

      await service.logout(firstToken);

      const record = await database
        .collection('admin_revoked_tokens')
        .findOne({ jti: tokenId(firstToken) });
      expect((record?.['expiresAt'] as Date).getTime()).toBeGreaterThanOrEqual(expiry(refreshed));
      expect(await service.verifyToken(refreshed)).toBeNull();
    });

    it('is not outlived by a token from the days of longer lifetimes', async () => {
      // Tokens used to last 30 days, say, and now last 8 hours. Signing out with an old one
      // must cover the old one's own expiry, not only today's shorter lifetime.
      const service = plainService();
      const admin = await service.verifyToken(await signIn(service));
      const oldToken = jwt.sign(
        { adminId: admin?.adminId, email: EMAIL, role: 'admin', type: 'admin' },
        'test-secret',
        { expiresIn: '30d', jwtid: `long-lived-${crypto.randomUUID()}` }
      );
      issuedTokenIds.push(tokenId(oldToken));

      await service.logout(oldToken);

      const record = await database
        .collection('admin_revoked_tokens')
        .findOne({ jti: tokenId(oldToken) });
      expect((record?.['expiresAt'] as Date).getTime()).toBeGreaterThanOrEqual(expiry(oldToken));
    });
  });

  describe('ending a token by its id, without holding the token', () => {
    it('ends it in every service on the same database', async () => {
      const service = plainService();
      const token = await signIn(service);

      await plainService().revokeTokenId(tokenId(token));

      expect(await service.verifyToken(token)).toBeNull();
    });

    it('can be done twice', async () => {
      const service = plainService();
      const token = await signIn(service);

      await service.revokeTokenId(tokenId(token));
      await expect(service.revokeTokenId(tokenId(token))).resolves.toBeUndefined();

      expect(await service.verifyToken(token)).toBeNull();
    });

    it('does nothing without an id', async () => {
      const service = plainService();
      const token = await signIn(service);

      await service.revokeTokenId('');

      expect(await service.verifyToken(token)).toMatchObject({ email: EMAIL });
    });
  });

  it('still uses a store it is handed, in place of the database', async () => {
    const revoked = new Set<string>();
    const store: IAdminRevokedTokenStore = {
      revoke: (jti: string): Promise<void> => {
        revoked.add(jti);
        return Promise.resolve();
      },
      isRevoked: (jti: string): Promise<boolean> => Promise.resolve(revoked.has(jti)),
    };
    const service = new AdminAuthService(database, 'test-secret', undefined, mfaService, store);
    const token = await signIn(service);

    await service.logout(token);

    expect(revoked.size).toBe(1);
    expect(await service.verifyToken(token)).toBeNull();
    // The record went to the store, not the database: a plain service still accepts the token.
    expect(await plainService().verifyToken(token)).toMatchObject({ email: EMAIL });
  });
});
