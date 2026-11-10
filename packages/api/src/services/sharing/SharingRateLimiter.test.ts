import { MongoClient, type Collection, type Db, type Document } from 'mongodb';
import { createIndexes } from '@scholaracle/database';
import { INVITES_PER_USER_PER_DAY, SharingRateLimiter } from './SharingRateLimiter';

describe('SharingRateLimiter', () => {
  let client: MongoClient;
  let database: Db;

  beforeAll(async () => {
    const uri = process.env['MONGODB_URI'] ?? 'mongodb://localhost:27017';
    client = new MongoClient(uri);
    await client.connect();
    database = client.db('scholaracle_test_sharing_rate_limit');
    await database.dropDatabase();
    await createIndexes(database);
  });

  afterAll(async () => {
    await database.dropDatabase();
    await client.close();
  });

  beforeEach(async () => {
    await database.collection('sharing_rate_limits').deleteMany({});
  });

  it('upserts one counter per (scope, day) even under concurrent calls, with the unique index present', async () => {
    const limiter = new SharingRateLimiter(database);
    const outcomes = await Promise.allSettled(
      Array.from({ length: INVITES_PER_USER_PER_DAY + 5 }, () => limiter.takeInvite('user-1'))
    );

    const refused = outcomes.filter((o) => o.status === 'rejected');
    expect(refused).toHaveLength(5);
    expect(
      refused.every((o) => o.status === 'rejected' && o.reason?.name === 'RateLimitError')
    ).toBe(true);

    const rows = await database.collection('sharing_rate_limits').find({}).toArray();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.['count']).toBe(INVITES_PER_USER_PER_DAY + 5);
    expect(rows[0]?.['key']).toMatch(/^invite:user-1:\d{4}-\d{2}-\d{2}$/);
    expect(rows[0]?.['expiresAt']).toBeInstanceOf(Date);
  });

  it('keeps resend and invite scopes, and different days, apart', async () => {
    let now = new Date('2026-11-09T23:59:00Z');
    const limiter = new SharingRateLimiter(database, () => now);
    await limiter.takeResend('grp-1');
    await limiter.takeInvite('user-1');
    now = new Date('2026-11-10T00:01:00Z');
    await limiter.takeInvite('user-1');

    const keys = (await database.collection('sharing_rate_limits').find({}).toArray())
      .map((r) => r['key'] as string)
      .sort();
    expect(keys).toEqual([
      'invite:user-1:2026-11-09',
      'invite:user-1:2026-11-10',
      'resend:grp-1:2026-11-09',
    ]);
  });

  it('retries index creation after a failed first attempt and never blocks the counter', async () => {
    const real = database.collection('sharing_rate_limits');
    let attempts = 0;
    const flaky = new Proxy(real, {
      get(target, prop, receiver) {
        if (prop === 'createIndex') {
          return async (...args: Parameters<Collection<Document>['createIndex']>) => {
            attempts += 1;
            if (attempts === 1) throw new Error('index boom');
            return target.createIndex(...args);
          };
        }
        return Reflect.get(target, prop, receiver);
      },
    });
    const flakyDb = { collection: () => flaky } as unknown as Db;
    const spy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const limiter = new SharingRateLimiter(flakyDb);
      await limiter.takeInvite('user-2'); // first round fails, counter still taken
      expect(attempts).toBe(1);
      await limiter.takeInvite('user-2'); // retried: both indexes created
      expect(attempts).toBe(3);
      await limiter.takeInvite('user-2'); // ready: no further attempts
      expect(attempts).toBe(3);
      const row = await real.findOne({ key: { $regex: /^invite:user-2:/ } });
      expect(row?.['count']).toBe(3);
    } finally {
      spy.mockRestore();
    }
  });
});
