import { MongoClient, type Db } from 'mongodb';
import { AdminRevokedTokenRepository } from './AdminRevokedTokenRepository';

describe('AdminRevokedTokenRepository', () => {
  let client: MongoClient;
  let database: Db;
  let repository: AdminRevokedTokenRepository;
  const PREFIX = 'revoked-repo-test-';

  const inHours = (hours: number): Date => new Date(Date.now() + hours * 60 * 60 * 1000);

  beforeAll(async () => {
    const uri = process.env['MONGODB_URI'] ?? 'mongodb://localhost:27017';
    client = new MongoClient(uri);
    await client.connect();
    database = client.db('scholaracle_test');
    repository = new AdminRevokedTokenRepository(database);
    // The index production has (indexes.ts): one record per token id.
    await database.collection('admin_revoked_tokens').createIndex({ jti: 1 }, { unique: true });
  });

  afterEach(async () => {
    await database.collection('admin_revoked_tokens').deleteMany({ jti: { $regex: `^${PREFIX}` } });
  });

  afterAll(async () => {
    await client.close();
  });

  it('does not know a token id nobody revoked', async () => {
    expect(await repository.isRevoked(`${PREFIX}unknown`)).toBe(false);
  });

  it('knows a revoked token id until the record runs out', async () => {
    await repository.revoke(`${PREFIX}live`, inHours(8));
    await repository.revoke(`${PREFIX}lapsed`, inHours(-1));

    expect(await repository.isRevoked(`${PREFIX}live`)).toBe(true);
    expect(await repository.isRevoked(`${PREFIX}lapsed`)).toBe(false);
  });

  it('can be told about the same token id twice', async () => {
    await repository.revoke(`${PREFIX}twice`, inHours(8));

    await expect(repository.revoke(`${PREFIX}twice`, inHours(8))).resolves.toBeUndefined();

    expect(await repository.isRevoked(`${PREFIX}twice`)).toBe(true);
    expect(
      await database.collection('admin_revoked_tokens').countDocuments({ jti: `${PREFIX}twice` })
    ).toBe(1);
  });

  it('keeps the later of two expiry times, whichever comes first', async () => {
    const later = inHours(8);
    await repository.revoke(`${PREFIX}later-first`, later);
    await repository.revoke(`${PREFIX}later-first`, inHours(1));
    await repository.revoke(`${PREFIX}later-second`, inHours(1));
    await repository.revoke(`${PREFIX}later-second`, later);

    const records = await database
      .collection('admin_revoked_tokens')
      .find({ jti: { $in: [`${PREFIX}later-first`, `${PREFIX}later-second`] } })
      .toArray();
    expect(records.map((r) => (r['expiresAt'] as Date).getTime())).toEqual([
      later.getTime(),
      later.getTime(),
    ]);
  });
});
