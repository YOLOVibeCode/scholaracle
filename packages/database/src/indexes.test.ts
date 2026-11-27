import { MongoClient, type Db } from 'mongodb';
import { JOB_RECORD_TTL_SECONDS, createIndexes, jobRecordTtlSeconds } from './indexes';

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

/**
 * The queue (`jobs`) carries every notification. The index on `scheduledFor` used to remove a
 * job the moment it was due, so anything the workers had not picked up within a minute was
 * deleted, and so was the record of a job being retried or one that had failed.
 */
describe('createIndexes: how long a queue job is kept', () => {
  const DAY_SECONDS = 24 * 60 * 60;
  let client: MongoClient;
  const created: Db[] = [];

  beforeAll(async () => {
    client = new MongoClient(process.env['MONGODB_URI'] ?? 'mongodb://localhost:27017');
    await client.connect();
  });

  afterAll(async () => {
    for (const database of created) {
      await database.dropDatabase();
    }
    await client.close();
  });

  async function emptyDatabase(name: string): Promise<Db> {
    const database = client.db(`scholaracle_test_job_ttl_${name}`);
    await database.dropDatabase();
    created.push(database);
    return database;
  }

  async function dueTimeIndex(database: Db): Promise<IIndexInfo | undefined> {
    const indexes = (await database.collection('jobs').indexes()) as IIndexInfo[];
    return indexes.find((i) => Object.keys(i.key).join(',') === 'scheduledFor');
  }

  async function namesLeft(database: Db): Promise<string[]> {
    const jobs = await database.collection('jobs').find({}).toArray();
    return jobs.map((job) => String(job['name'])).sort();
  }

  it('keeps a job for a day after it was due', async () => {
    const database = await emptyDatabase('new');

    await createIndexes(database);

    expect(JOB_RECORD_TTL_SECONDS).toBe(DAY_SECONDS);
    expect((await dueTimeIndex(database))?.expireAfterSeconds).toBe(DAY_SECONDS);
    expect(await jobRecordTtlSeconds(database)).toBe(DAY_SECONDS);
  });

  it('changes the index in place on a database that removes a job the moment it is due', async () => {
    const database = await emptyDatabase('old');
    const jobs = database.collection('jobs');
    // What every database has had until now.
    await jobs.createIndex({ scheduledFor: 1 }, { expireAfterSeconds: 0 });
    await jobs.insertOne({
      name: 'waiting',
      type: 'guidance',
      status: 'pending',
      scheduledFor: new Date(Date.now() + 60 * 60 * 1000),
    });
    expect(await jobRecordTtlSeconds(database)).toBe(0);

    await createIndexes(database);

    const index = await dueTimeIndex(database);
    expect(index?.expireAfterSeconds).toBe(DAY_SECONDS);
    expect(index?.name).toBe('scheduledFor_1');
    expect(await namesLeft(database)).toEqual(['waiting']);
    // The next start finds nothing to change.
    await expect(createIndexes(database)).resolves.toBeUndefined();
    expect((await dueTimeIndex(database))?.expireAfterSeconds).toBe(DAY_SECONDS);
  });

  it('gives a plain index on the due time the same limit', async () => {
    const database = await emptyDatabase('plain');
    await database.collection('jobs').createIndex({ scheduledFor: 1 });
    expect(await jobRecordTtlSeconds(database)).toBeNull();

    await createIndexes(database);

    expect((await dueTimeIndex(database))?.expireAfterSeconds).toBe(DAY_SECONDS);
  });

  it('reports no limit for a database that has no queue yet', async () => {
    const database = await emptyDatabase('none');

    expect(await jobRecordTtlSeconds(database)).toBeNull();
  });

  it('leaves a job that is due for the workers, and removes one that is over a day old', async () => {
    const admin = client.db('admin');
    const before = (await admin.command({ getParameter: 1, ttlMonitorSleepSecs: 1 })) as {
      ttlMonitorSleepSecs: number;
    };
    // The database looks for records to remove once a minute; for this test, every second.
    await admin.command({ setParameter: 1, ttlMonitorSleepSecs: 1 });
    try {
      const database = await emptyDatabase('sweep');
      await createIndexes(database);
      const jobs = database.collection('jobs');
      const now = Date.now();
      await jobs.insertMany([
        { name: 'due-now', type: 'deliver', status: 'pending', scheduledFor: new Date(now) },
        {
          name: 'being-sent',
          type: 'deliver',
          status: 'processing',
          scheduledFor: new Date(now - 90 * 1000),
        },
        {
          name: 'failed-an-hour-ago',
          type: 'notify',
          status: 'failed',
          scheduledFor: new Date(now - 60 * 60 * 1000),
        },
        {
          name: 'over-a-day-old',
          type: 'deliver',
          status: 'pending',
          scheduledFor: new Date(now - (DAY_SECONDS + 60) * 1000),
        },
      ]);

      // Once the day-old job is gone, the database has made a pass over all four.
      const deadline = Date.now() + 20_000;
      while ((await jobs.countDocuments({ name: 'over-a-day-old' })) > 0 && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 200));
      }

      expect(await namesLeft(database)).toEqual(['being-sent', 'due-now', 'failed-an-hour-ago']);
    } finally {
      await admin.command({ setParameter: 1, ttlMonitorSleepSecs: before.ttlMonitorSleepSecs });
    }
  }, 30_000);
});
