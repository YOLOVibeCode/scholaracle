import { createHash } from 'node:crypto';
import { MongoClient, type Db } from 'mongodb';
import { ObjectId } from 'mongodb';
import { StudentMagicTokenRepository } from './StudentMagicTokenRepository';

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

describe('StudentMagicTokenRepository', () => {
  let client: MongoClient;
  let database: Db;
  let repository: StudentMagicTokenRepository;

  beforeAll(async () => {
    const uri = process.env['MONGODB_URI'] ?? 'mongodb://localhost:27017';
    client = new MongoClient(uri);
    await client.connect();
    database = client.db('scholaracle_student_magic_token_test');
    repository = new StudentMagicTokenRepository(database);
  });

  afterAll(async () => {
    await client.close();
  });

  beforeEach(async () => {
    await database.collection('student_magic_tokens').deleteMany({});
  });

  it('stores the hash, not the raw token, and consumeValid returns the user once', async () => {
    const userId = new ObjectId().toString();
    const raw = 'once-only-raw-token';
    const tokenHash = sha256(raw);
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

    await repository.create(userId, tokenHash, expiresAt);

    const stored = await database.collection('student_magic_tokens').findOne({ tokenHash });
    expect(stored).not.toBeNull();
    expect(stored?.['token']).toBeUndefined();
    expect(JSON.stringify(stored)).not.toContain(raw);

    const first = await repository.consumeValid(tokenHash);
    expect(first?.userId).toBe(userId);

    const second = await repository.consumeValid(tokenHash);
    expect(second).toBeNull();
  });

  it('returns null for expired or unknown hashes', async () => {
    const userId = new ObjectId().toString();
    await repository.create(userId, sha256('expired'), new Date(Date.now() - 1000));

    expect(await repository.consumeValid(sha256('expired'))).toBeNull();
    expect(await repository.consumeValid(sha256('never-issued'))).toBeNull();
  });

  it('invalidateUnusedForUser deletes unused tokens and leaves used ones', async () => {
    const userId = new ObjectId().toString();
    const otherUser = new ObjectId().toString();
    await repository.create(userId, sha256('live'), new Date(Date.now() + 3600000));
    await repository.create(otherUser, sha256('other'), new Date(Date.now() + 3600000));
    await database.collection('student_magic_tokens').insertOne({
      userId: new ObjectId(userId),
      tokenHash: sha256('already-used'),
      expiresAt: new Date(Date.now() + 3600000),
      createdAt: new Date(),
      usedAt: new Date(),
    });

    await repository.invalidateUnusedForUser(userId);

    expect(await repository.consumeValid(sha256('live'))).toBeNull();
    expect(await repository.consumeValid(sha256('other'))).not.toBeNull();
    const used = await database
      .collection('student_magic_tokens')
      .findOne({ tokenHash: sha256('already-used') });
    expect(used).not.toBeNull();
  });
});
