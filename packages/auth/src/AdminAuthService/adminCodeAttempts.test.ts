import jwt from 'jsonwebtoken';
import speakeasy from 'speakeasy';
import { MongoClient, type Db } from 'mongodb';
import { AdminUserRepository } from '@scholaracle/database';
import { AdminAuthService } from './AdminAuthService';
import { AttemptLimiter } from '../AttemptLimiter';
import { MFAService } from '../MFAService';

const PASSWORD = 'AdminPass123!';
const MINUTE = 60_000;

/** A six-digit code that is not valid for `secret` now or in the steps the service accepts. */
function wrongCodeFor(secret: string): string {
  const valid = new Set<string>();
  const nowSeconds = Math.floor(Date.now() / 1000);
  for (let step = -4; step <= 4; step += 1) {
    valid.add(speakeasy.totp({ secret, encoding: 'base32', time: nowSeconds + step * 30 }));
  }
  let candidate = 0;
  while (valid.has(String(candidate).padStart(6, '0'))) candidate += 1;
  return String(candidate).padStart(6, '0');
}

function rightCodeFor(secret: string): string {
  return speakeasy.totp({ secret, encoding: 'base32' });
}

describe('AdminAuthService: tries at the authenticator code', () => {
  let client: MongoClient;
  let database: Db;
  let adminRepository: AdminUserRepository;
  let mfaService: MFAService;
  let now: number;
  let authService: AdminAuthService;

  async function createAdmin(email: string): Promise<{ adminId: string; secret: string }> {
    const { secret } = mfaService.generateSecret(email);
    const admin = await adminRepository.create({
      email,
      passwordHash: await AdminUserRepository.hashPassword(PASSWORD),
      name: 'Code Attempts',
      role: 'admin',
      mfaEnabled: true,
      mfaSecret: secret,
    });
    return { adminId: admin._id!.toString(), secret };
  }

  /** Password step: returns the short-lived token the code step needs. */
  async function passwordStep(email: string): Promise<string> {
    const result = await authService.login(email, PASSWORD);
    if (!result.requiresMFA || !result.mfaToken) {
      throw new Error(`expected the code step, got ${JSON.stringify(result)}`);
    }
    return result.mfaToken;
  }

  beforeAll(async () => {
    const uri = process.env['MONGODB_URI'] ?? 'mongodb://localhost:27017';
    client = new MongoClient(uri);
    await client.connect();
    database = client.db('scholaracle_test');
    adminRepository = new AdminUserRepository(database);
    mfaService = new MFAService();
  });

  afterAll(async () => {
    await client.close();
  });

  beforeEach(async () => {
    await database.collection('admin_users').deleteMany({ email: /@code-attempts\.test$/ });
    now = Date.now();
    authService = new AdminAuthService(
      database,
      'test-secret',
      undefined,
      mfaService,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      new AttemptLimiter({ maxFailures: 5, windowMs: 15 * MINUTE, now: () => now })
    );
  });

  describe('at sign-in', () => {
    it('refuses the right code once five wrong ones have been tried', async () => {
      const { secret } = await createAdmin('five@code-attempts.test');
      const mfaToken = await passwordStep('five@code-attempts.test');
      const wrong = wrongCodeFor(secret);

      for (let i = 0; i < 5; i += 1) {
        const result = await authService.verifyMFAToken(mfaToken, wrong);
        expect(result).toMatchObject({ success: false, error: 'Invalid MFA code' });
        expect(result.tooManyAttempts).toBeUndefined();
      }

      const sixth = await authService.verifyMFAToken(mfaToken, rightCodeFor(secret));
      expect(sixth.success).toBe(false);
      expect(sixth.token).toBeUndefined();
      expect(sixth.tooManyAttempts).toBe(true);
      expect(sixth.retryAfterSeconds).toBe(15 * 60);
      expect(sixth.error).toMatch(/too many wrong codes/i);
    });

    it('gives no new tries for signing in again with the password', async () => {
      const { secret } = await createAdmin('again@code-attempts.test');
      const first = await passwordStep('again@code-attempts.test');
      const wrong = wrongCodeFor(secret);
      for (let i = 0; i < 5; i += 1) await authService.verifyMFAToken(first, wrong);

      const second = await passwordStep('again@code-attempts.test');
      const result = await authService.verifyMFAToken(second, rightCodeFor(secret));

      expect(result.success).toBe(false);
      expect(result.tooManyAttempts).toBe(true);
    });

    it('signs in with the right code inside the allowance, and starts counting afresh', async () => {
      const { secret } = await createAdmin('inside@code-attempts.test');
      const wrong = wrongCodeFor(secret);
      const first = await passwordStep('inside@code-attempts.test');
      for (let i = 0; i < 4; i += 1) await authService.verifyMFAToken(first, wrong);

      const signedIn = await authService.verifyMFAToken(first, rightCodeFor(secret));
      expect(signedIn.success).toBe(true);
      expect(signedIn.token).toBeDefined();

      const second = await passwordStep('inside@code-attempts.test');
      for (let i = 0; i < 5; i += 1) {
        const result = await authService.verifyMFAToken(second, wrong);
        expect(result.tooManyAttempts).toBeUndefined();
        expect(result.error).toBe('Invalid MFA code');
      }
    });

    it('counts afresh when fifteen minutes have passed', async () => {
      const { secret } = await createAdmin('later@code-attempts.test');
      const wrong = wrongCodeFor(secret);
      const first = await passwordStep('later@code-attempts.test');
      for (let i = 0; i < 5; i += 1) await authService.verifyMFAToken(first, wrong);
      expect((await authService.verifyMFAToken(first, wrong)).tooManyAttempts).toBe(true);

      now += 15 * MINUTE;
      const second = await passwordStep('later@code-attempts.test');
      const result = await authService.verifyMFAToken(second, rightCodeFor(secret));

      expect(result.success).toBe(true);
    });

    it('uses no try for a token it does not accept', async () => {
      const { adminId, secret } = await createAdmin('forged@code-attempts.test');
      const forged = jwt.sign(
        { adminId, type: 'mfa', expiresAt: Date.now() + 5 * MINUTE },
        'not-the-server-secret',
        { expiresIn: '5m' }
      );
      const unknown = jwt.sign(
        { adminId, type: 'mfa', expiresAt: Date.now() + 5 * MINUTE },
        'test-secret',
        { expiresIn: '5m' }
      );
      for (let i = 0; i < 10; i += 1) {
        expect(
          (await authService.verifyMFAToken(forged, '000000')).tooManyAttempts
        ).toBeUndefined();
        expect(
          (await authService.verifyMFAToken(unknown, '000000')).tooManyAttempts
        ).toBeUndefined();
      }

      const mfaToken = await passwordStep('forged@code-attempts.test');
      const result = await authService.verifyMFAToken(mfaToken, rightCodeFor(secret));

      expect(result.success).toBe(true);
    });

    it("does not count one admin's wrong codes against another", async () => {
      const blocked = await createAdmin('blocked@code-attempts.test');
      const other = await createAdmin('other@code-attempts.test');
      const blockedToken = await passwordStep('blocked@code-attempts.test');
      for (let i = 0; i < 5; i += 1) {
        await authService.verifyMFAToken(blockedToken, wrongCodeFor(blocked.secret));
      }

      const otherToken = await passwordStep('other@code-attempts.test');
      const result = await authService.verifyMFAToken(otherToken, rightCodeFor(other.secret));

      expect(result.success).toBe(true);
    });

    it('checks at most five of fifty wrong codes sent at the same moment', async () => {
      const { secret } = await createAdmin('burst@code-attempts.test');
      const mfaToken = await passwordStep('burst@code-attempts.test');
      const wrong = wrongCodeFor(secret);

      const results = await Promise.all(
        Array.from({ length: 50 }, () => authService.verifyMFAToken(mfaToken, wrong))
      );

      expect(results.filter((r) => r.error === 'Invalid MFA code')).toHaveLength(5);
      expect(results.filter((r) => r.tooManyAttempts === true)).toHaveLength(45);
    });
  });

  describe('checkAuthenticatorCode (step-up for sensitive actions)', () => {
    it('accepts the right code and refuses a wrong one', async () => {
      const { adminId, secret } = await createAdmin('stepup@code-attempts.test');

      expect(await authService.checkAuthenticatorCode(adminId, wrongCodeFor(secret))).toEqual({
        status: 'invalid',
      });
      expect(await authService.checkAuthenticatorCode(adminId, rightCodeFor(secret))).toEqual({
        status: 'ok',
      });
    });

    it('refuses the right code once five wrong ones have been tried', async () => {
      const { adminId, secret } = await createAdmin('stepup-five@code-attempts.test');
      const wrong = wrongCodeFor(secret);
      for (let i = 0; i < 5; i += 1) await authService.checkAuthenticatorCode(adminId, wrong);

      const result = await authService.checkAuthenticatorCode(adminId, rightCodeFor(secret));

      expect(result).toEqual({ status: 'tooManyAttempts', retryAfterSeconds: 15 * 60 });
    });

    it('counts wrong codes at sign-in and at step-up together', async () => {
      const { adminId, secret } = await createAdmin('shared@code-attempts.test');
      const wrong = wrongCodeFor(secret);
      const mfaToken = await passwordStep('shared@code-attempts.test');
      for (let i = 0; i < 3; i += 1) await authService.verifyMFAToken(mfaToken, wrong);
      for (let i = 0; i < 2; i += 1) await authService.checkAuthenticatorCode(adminId, wrong);

      const atSignIn = await authService.verifyMFAToken(mfaToken, rightCodeFor(secret));
      const atStepUp = await authService.checkAuthenticatorCode(adminId, rightCodeFor(secret));

      expect(atSignIn.tooManyAttempts).toBe(true);
      expect(atStepUp.status).toBe('tooManyAttempts');
    });

    it('answers unavailable for an admin without an authenticator, and for nobody', async () => {
      const admin = await adminRepository.create({
        email: 'nomfa@code-attempts.test',
        passwordHash: await AdminUserRepository.hashPassword(PASSWORD),
        name: 'No MFA',
        role: 'admin',
      });

      expect(await authService.checkAuthenticatorCode(admin._id!.toString(), '123456')).toEqual({
        status: 'unavailable',
      });
      expect(
        await authService.checkAuthenticatorCode('0123456789abcdef01234567', '123456')
      ).toEqual({ status: 'unavailable' });
    });
  });
});
