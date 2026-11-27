import { MongoClient, type Db } from 'mongodb';
import { RefreshTokenRepository } from '@scholaracle/database';
import { AuthService } from './AuthService';

/**
 * One device signs another out by the session's family id: it does not hold the other
 * device's refresh token. Every refresh token of that family must stop working, and no
 * other family may be touched.
 */

const EMAIL = 'family@session-family-revocation.test';
const PASSWORD = 'FamilyRevocation!Passw0rd';

describe('AuthService: ending a session by its family id', () => {
  let client: MongoClient;
  let database: Db;

  const serviceWithRefreshTokens = (): AuthService =>
    new AuthService(
      database,
      'test-secret',
      '15m',
      undefined,
      undefined,
      undefined,
      new RefreshTokenRepository(database),
      '30d',
      '24h'
    );

  const removeTestUser = async (): Promise<void> => {
    const user = await database.collection('users').findOne({ email: EMAIL });
    if (!user) return;
    await database.collection('refresh_tokens').deleteMany({ userId: user._id });
    await database.collection('users').deleteOne({ _id: user._id });
  };

  beforeAll(async () => {
    const uri = process.env['MONGODB_URI'] ?? 'mongodb://localhost:27017';
    client = new MongoClient(uri);
    await client.connect();
    database = client.db('scholaracle_test');
  });

  beforeEach(removeTestUser);

  afterAll(async () => {
    await removeTestUser();
    await client.close();
  });

  it("stops the family's refresh token from working", async () => {
    const service = serviceWithRefreshTokens();
    const device = await service.register(EMAIL, PASSWORD, 'Family');
    expect(typeof device.familyId).toBe('string');

    await service.revokeRefreshTokenFamily(device.familyId ?? '');

    const refreshed = await service.refreshAccessToken(device.refreshToken ?? '');
    expect(refreshed).toHaveProperty('error');
    expect(refreshed).not.toHaveProperty('token');
  });

  it('stops a token the family was given by an earlier refresh, too', async () => {
    const service = serviceWithRefreshTokens();
    const device = await service.register(EMAIL, PASSWORD, 'Family');
    const rotated = await service.refreshAccessToken(device.refreshToken ?? '');
    if ('error' in rotated) throw new Error(rotated.error);

    await service.revokeRefreshTokenFamily(device.familyId ?? '');

    expect(await service.refreshAccessToken(rotated.refreshToken)).toHaveProperty('error');
  });

  it('leaves the same account signed in on its other devices', async () => {
    const service = serviceWithRefreshTokens();
    const first = await service.register(EMAIL, PASSWORD, 'Family');
    const second = await service.login(EMAIL, PASSWORD);
    expect(second.familyId).not.toBe(first.familyId);

    await service.revokeRefreshTokenFamily(first.familyId ?? '');

    const refreshed = await service.refreshAccessToken(second.refreshToken ?? '');
    expect(refreshed).toHaveProperty('token');
  });

  it('does nothing when there is no family to end', async () => {
    const service = serviceWithRefreshTokens();
    const device = await service.register(EMAIL, PASSWORD, 'Family');

    await service.revokeRefreshTokenFamily('');
    await service.revokeRefreshTokenFamily('no-such-family');

    expect(await service.refreshAccessToken(device.refreshToken ?? '')).toHaveProperty('token');
  });

  it('does nothing in a service that keeps no refresh tokens', async () => {
    const service = new AuthService(database, 'test-secret');

    await expect(service.revokeRefreshTokenFamily('any-family')).resolves.toBeUndefined();
    await expect(
      service.revokeOtherRefreshTokenFamilies('65f000000000000000000001', 'any-family')
    ).resolves.toBeUndefined();
  });

  describe('all other sessions at once', () => {
    it('ends every family of the account but the one that asked', async () => {
      const service = serviceWithRefreshTokens();
      const asking = await service.register(EMAIL, PASSWORD, 'Family');
      const second = await service.login(EMAIL, PASSWORD);
      const third = await service.login(EMAIL, PASSWORD);

      await service.revokeOtherRefreshTokenFamilies(asking.user?.id ?? '', asking.familyId ?? '');

      expect(await service.refreshAccessToken(second.refreshToken ?? '')).toHaveProperty('error');
      expect(await service.refreshAccessToken(third.refreshToken ?? '')).toHaveProperty('error');
      expect(await service.refreshAccessToken(asking.refreshToken ?? '')).toHaveProperty('token');
    });
  });
});
