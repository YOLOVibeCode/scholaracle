import { MongoClient, type Db } from 'mongodb';
import { IngestSourceRepository } from './IngestSourceRepository';

describe('IngestSourceRepository', () => {
  let client: MongoClient;
  let database: Db;
  let repo: IngestSourceRepository;

  beforeAll(async () => {
    const uri = process.env['MONGODB_URI'] ?? 'mongodb://localhost:27017';
    client = new MongoClient(uri);
    await client.connect();
    database = client.db('scholaracle_test');
    repo = new IngestSourceRepository(database);
  });

  afterAll(async () => {
    await client.close();
  });

  beforeEach(async () => {
    await database.collection('slc_sources').deleteMany({});
  });

  it('upserts and lists sources by user', async () => {
    await repo.upsert({
      userId: 'user-1',
      sourceId: 'src-1',
      provider: 'skyward',
      adapterId: 'com.hobbyist.skyward-x',
      displayName: 'District X',
      portalBaseUrl: 'https://example.edu',
    });

    const sources = await repo.listByUserId('user-1');
    expect(sources.length).toBe(1);
    expect(sources[0]?.sourceId).toBe('src-1');
  });
});


