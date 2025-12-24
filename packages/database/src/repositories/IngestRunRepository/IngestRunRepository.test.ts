import { MongoClient, type Db } from 'mongodb';
import { IngestRunRepository } from './IngestRunRepository';

describe('IngestRunRepository', () => {
  let client: MongoClient;
  let database: Db;
  let repo: IngestRunRepository;

  beforeAll(async () => {
    const uri = process.env['MONGODB_URI'] ?? 'mongodb://localhost:27017';
    client = new MongoClient(uri);
    await client.connect();
    database = client.db('scholaracle_test');
    repo = new IngestRunRepository(database);
  });

  afterAll(async () => {
    await client.close();
  });

  beforeEach(async () => {
    await database.collection('slc_runs').deleteMany({});
  });

  it('starts and commits a run and can fetch last cursor', async () => {
    await repo.startRun({
      userId: 'user-1',
      sourceId: 'src-1',
      runId: 'run-1',
      lastCursor: null,
    });

    await repo.commitRun({ userId: 'user-1', runId: 'run-1', newCursor: { type: 'opaque', value: 'c1' } });

    const cursor = await repo.findLastCommittedCursor('user-1', 'src-1');
    expect(cursor?.value).toBe('c1');
  });
});


