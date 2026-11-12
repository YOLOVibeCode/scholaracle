import { MongoClient, type Db } from 'mongodb';
import { createIndexes } from './indexes';

interface IIndexInfo {
  readonly name: string;
  readonly key: Record<string, number>;
  readonly unique?: boolean;
  readonly sparse?: boolean;
  readonly expireAfterSeconds?: number;
}

describe('createIndexes', () => {
  let client: MongoClient;
  let database: Db;

  beforeAll(async () => {
    const uri = process.env['MONGODB_URI'] ?? 'mongodb://localhost:27017';
    client = new MongoClient(uri);
    await client.connect();
    database = client.db('scholaracle_test_indexes');
    await database.dropDatabase();
    await createIndexes(database);
  });

  afterAll(async () => {
    await database.dropDatabase();
    await client.close();
  });

  async function indexesOf(collection: string): Promise<readonly IIndexInfo[]> {
    return (await database.collection(collection).indexes()) as IIndexInfo[];
  }

  it('indexes the sharing lookups on students (pending invites by email, invite groups)', async () => {
    const indexes = await indexesOf('students');
    const byEmail = indexes.find((i) => i.key['sharedWith.email'] === 1);
    const byGroup = indexes.find((i) => i.key['sharedWith.inviteGroupId'] === 1);
    expect(byEmail).toBeDefined();
    expect(byGroup?.sparse).toBe(true);
  });

  it('gives the sharing rate-limit counters a unique key and a TTL on expiresAt', async () => {
    const indexes = await indexesOf('sharing_rate_limits');
    const key = indexes.find((i) => i.key['key'] === 1);
    const ttl = indexes.find((i) => i.key['expiresAt'] === 1);
    expect(key?.unique).toBe(true);
    expect(ttl?.expireAfterSeconds).toBe(60 * 60);
  });

  it('is idempotent', async () => {
    await expect(createIndexes(database)).resolves.toBeUndefined();
  });
});
