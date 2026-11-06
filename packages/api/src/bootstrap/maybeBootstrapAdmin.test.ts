import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient, type Db } from 'mongodb';
import { AdminUserRepository } from '@scholaracle/database';
import { AdminAuthService } from '@scholaracle/auth';
import { maybeBootstrapFirstAdmin } from './maybeBootstrapAdmin';

const ORIGINAL_ENV = { ...process.env };

jest.mock('../logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    fatal: jest.fn(),
  },
}));

import { logger } from '../logger';

describe('maybeBootstrapFirstAdmin', () => {
  let mongod: MongoMemoryServer;
  let client: MongoClient;
  let database: Db;

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    client = new MongoClient(mongod.getUri());
    await client.connect();
    database = client.db('scholaracle_bootstrap_test');
  });

  afterAll(async () => {
    await client.close();
    await mongod.stop();
  });

  beforeEach(async () => {
    process.env = { ...ORIGINAL_ENV };
    jest.clearAllMocks();
    await database.collection('admin_users').deleteMany({});
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it('creates exactly one admin when collection is empty and both env vars are set', async () => {
    process.env['ADMIN_BOOTSTRAP_EMAIL'] = '  bootstrap@test.com  ';
    process.env['ADMIN_BOOTSTRAP_PASSWORD'] = '  BootstrapPass123!  ';
    process.env['JWT_SECRET'] = 'test-secret';

    await maybeBootstrapFirstAdmin(database);

    const users = await new AdminUserRepository(database).findAll();
    expect(users).toHaveLength(1);
    expect(users[0]?.email).toBe('bootstrap@test.com');
    const isMatch = await AdminUserRepository.verifyPassword(
      'BootstrapPass123!',
      users[0]!.passwordHash
    );
    expect(isMatch).toBe(true);
    expect(logger.info).toHaveBeenCalledTimes(1);
  });

  it('is a no-op when an admin already exists', async () => {
    process.env['ADMIN_BOOTSTRAP_EMAIL'] = 'bootstrap@test.com';
    process.env['ADMIN_BOOTSTRAP_PASSWORD'] = 'BootstrapPass123!';
    const passwordHash = await AdminUserRepository.hashPassword('ExistingPass123!');
    await new AdminUserRepository(database).create({
      email: 'existing@test.com',
      passwordHash,
      name: 'Existing',
      role: 'admin',
      createdBy: 'test',
    });

    await maybeBootstrapFirstAdmin(database);

    const users = await new AdminUserRepository(database).findAll();
    expect(users).toHaveLength(1);
    expect(users[0]?.email).toBe('existing@test.com');
    expect(logger.info).not.toHaveBeenCalled();
  });

  it('never runs when ADMIN_BOOTSTRAP_EMAIL is missing', async () => {
    delete process.env['ADMIN_BOOTSTRAP_EMAIL'];
    process.env['ADMIN_BOOTSTRAP_PASSWORD'] = 'BootstrapPass123!';

    await maybeBootstrapFirstAdmin(database);

    const count = await database.collection('admin_users').countDocuments({});
    expect(count).toBe(0);
    expect(logger.info).not.toHaveBeenCalled();
  });

  it('never runs when ADMIN_BOOTSTRAP_PASSWORD is missing', async () => {
    process.env['ADMIN_BOOTSTRAP_EMAIL'] = 'bootstrap@test.com';
    delete process.env['ADMIN_BOOTSTRAP_PASSWORD'];

    await maybeBootstrapFirstAdmin(database);

    const count = await database.collection('admin_users').countDocuments({});
    expect(count).toBe(0);
    expect(logger.info).not.toHaveBeenCalled();
  });

  it('never runs when a bootstrap var is only whitespace', async () => {
    process.env['ADMIN_BOOTSTRAP_EMAIL'] = '   ';
    process.env['ADMIN_BOOTSTRAP_PASSWORD'] = 'BootstrapPass123!';

    await maybeBootstrapFirstAdmin(database);

    expect(await database.collection('admin_users').countDocuments({})).toBe(0);
  });

  it('after bootstrap, login requires MFA setup', async () => {
    process.env['ADMIN_BOOTSTRAP_EMAIL'] = 'mfa-bootstrap@test.com';
    process.env['ADMIN_BOOTSTRAP_PASSWORD'] = 'MfaBootstrapPass123!';
    process.env['JWT_SECRET'] = 'test-secret';

    await maybeBootstrapFirstAdmin(database);

    const auth = new AdminAuthService(database, 'test-secret');
    const loginResult = await auth.login('mfa-bootstrap@test.com', 'MfaBootstrapPass123!');

    expect(loginResult.success).toBe(false);
    expect(loginResult.requiresMFASetup).toBe(true);
    expect(loginResult.mfaSetupToken).toBeDefined();
  });
});
