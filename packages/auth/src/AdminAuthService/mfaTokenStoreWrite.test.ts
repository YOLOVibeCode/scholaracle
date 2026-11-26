import speakeasy from 'speakeasy';
import { MongoClient, type Db } from 'mongodb';
import { AdminUserRepository, type IAdminMFATokenStore } from '@scholaracle/database';
import { AdminAuthService } from './AdminAuthService';
import { MFAService } from '../MFAService';

/**
 * Admin sign-in has two steps: the password, which answers with a short-lived token, and the
 * authenticator code, sent with that token. With a token store (the server always has one)
 * the password step wrote the token to the store without waiting for the write. A code sent
 * straight after could arrive first and was refused with "Invalid MFA token", and a write
 * that failed still handed out a token that could never be accepted.
 */

const PASSWORD = 'AdminPass123!';
const EMAIL_PATTERN = /@mfa-token-store\.test$/;

type StoredToken = { adminId: string; secret: string };

/** A store that takes `delayMs` to finish a write, like a database under load. */
function slowStore(delayMs: number): IAdminMFATokenStore & { readonly writes: number } {
  const tokens = new Map<string, StoredToken>();
  let writes = 0;
  return {
    get writes(): number {
      return writes;
    },
    async create(mfaToken: string, adminId: string, secret: string): Promise<void> {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      tokens.set(mfaToken, { adminId, secret });
      writes += 1;
    },
    get(mfaToken: string): Promise<StoredToken | null> {
      return Promise.resolve(tokens.get(mfaToken) ?? null);
    },
    delete(mfaToken: string): Promise<void> {
      tokens.delete(mfaToken);
      return Promise.resolve();
    },
  };
}

/** A store whose writes fail, like a database that is not reachable. */
function failingStore(): IAdminMFATokenStore {
  return {
    create(): Promise<void> {
      return Promise.reject(new Error('token store is not reachable'));
    },
    get(): Promise<StoredToken | null> {
      return Promise.resolve(null);
    },
    delete(): Promise<void> {
      return Promise.resolve();
    },
  };
}

describe('AdminAuthService: the second-step token is stored before sign-in answers', () => {
  let client: MongoClient;
  let database: Db;
  let adminRepository: AdminUserRepository;
  let mfaService: MFAService;

  async function createAdmin(email: string): Promise<string> {
    const { secret } = mfaService.generateSecret(email);
    await adminRepository.create({
      email,
      passwordHash: await AdminUserRepository.hashPassword(PASSWORD),
      name: 'Token Store',
      role: 'admin',
      mfaEnabled: true,
      mfaSecret: secret,
    });
    return secret;
  }

  function serviceWith(store: IAdminMFATokenStore): AdminAuthService {
    return new AdminAuthService(database, 'test-secret', undefined, mfaService, undefined, store);
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
    await database.collection('admin_users').deleteMany({ email: EMAIL_PATTERN });
    await client.close();
  });

  beforeEach(async () => {
    await database.collection('admin_users').deleteMany({ email: EMAIL_PATTERN });
  });

  it('accepts a code sent straight after the password step, however slow the store is', async () => {
    const secret = await createAdmin('slow@mfa-token-store.test');
    const store = slowStore(50);
    const authService = serviceWith(store);

    const passwordStep = await authService.login('slow@mfa-token-store.test', PASSWORD);

    expect(passwordStep.requiresMFA).toBe(true);
    expect(store.writes).toBe(1);

    const codeStep = await authService.verifyMFAToken(
      passwordStep.mfaToken ?? '',
      speakeasy.totp({ secret, encoding: 'base32' })
    );

    expect(codeStep).toMatchObject({ success: true });
    expect(typeof codeStep.token).toBe('string');
  });

  it('fails the sign-in when the token cannot be stored, and hands out no token', async () => {
    await createAdmin('failing@mfa-token-store.test');
    const authService = serviceWith(failingStore());

    const passwordStep = await authService.login('failing@mfa-token-store.test', PASSWORD);

    expect(passwordStep.success).toBe(false);
    expect(passwordStep.requiresMFA).toBeUndefined();
    expect(passwordStep.mfaToken).toBeUndefined();
    expect(passwordStep.error).toBe('token store is not reachable');
  });
});
