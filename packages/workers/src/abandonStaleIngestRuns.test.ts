import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient, ObjectId, type Db } from 'mongodb';
import { abandonStaleStartedRuns } from './abandonStaleIngestRuns';

describe('abandonStaleStartedRuns', () => {
  jest.setTimeout(60_000);
  let mongoServer: MongoMemoryServer;
  let client: MongoClient;
  let database: Db;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    client = new MongoClient(mongoServer.getUri());
    await client.connect();
    database = client.db('abandon-stale-test');
  });

  afterAll(async () => {
    await client.close();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    await database.collection('slc_runs').deleteMany({});
  });

  it('marks started runs older than 60 minutes as abandoned, leaves newer started runs', async () => {
    const now = new Date('2025-06-15T12:00:00.000Z');
    const oldStarted = new Date(now.getTime() - 61 * 60 * 1000);
    const recentStarted = new Date(now.getTime() - 30 * 60 * 1000);
    const uid = new ObjectId();

    await database.collection('slc_runs').insertMany([
      {
        userId: uid,
        sourceId: 's1',
        runId: 'run-old',
        mode: 'delta',
        status: 'started',
        startedAt: oldStarted,
        error: null,
      },
      {
        userId: uid,
        sourceId: 's1',
        runId: 'run-recent',
        mode: 'delta',
        status: 'started',
        startedAt: recentStarted,
        error: null,
      },
    ]);

    await abandonStaleStartedRuns(database, now);

    const oldDoc = await database.collection('slc_runs').findOne({ runId: 'run-old' });
    const recentDoc = await database.collection('slc_runs').findOne({ runId: 'run-recent' });

    expect(oldDoc?.['status']).toBe('abandoned');
    expect((oldDoc?.['abandonedAt'] as Date).toISOString()).toBe(now.toISOString());
    expect(recentDoc?.['status']).toBe('started');
  });
});
