import { MongoClient, type Db } from 'mongodb';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { SmsDigestPendingRepository } from './SmsDigestPendingRepository';

describe('SmsDigestPendingRepository', () => {
  const NOON = new Date('2026-11-27T18:00:00Z');
  const MINUTE = 60_000;
  let mongoServer: MongoMemoryServer;
  let client: MongoClient;
  let database: Db;
  let repo: SmsDigestPendingRepository;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    client = new MongoClient(mongoServer.getUri());
    await client.connect();
    database = client.db('sms_digest_pending_test');
    repo = new SmsDigestPendingRepository(database);
  });

  afterAll(async () => {
    await client.close();
    await mongoServer.stop();
  });

  beforeEach(async () => {
    await database.collection('sms_digest_pending').deleteMany({});
  });

  const waits = (userId: string, minutesBeforeNoon: number): Promise<void> =>
    repo.add({
      userId,
      phone: '+15125550100',
      subject: `alert ${minutesBeforeNoon}`,
      body: 'body',
      createdAt: new Date(NOON.getTime() - minutesBeforeNoon * MINUTE),
    });

  it("lists a person's waiting alerts oldest first, and nobody else's", async () => {
    await waits('owner', 10);
    await waits('owner', 30);
    await waits('other', 20);

    const items = await repo.findByUserId('owner');

    expect(items.map((item) => item.subject)).toEqual(['alert 30', 'alert 10']);
    expect((await repo.getDistinctUserIds()).sort()).toEqual(['other', 'owner']);
  });

  it("removes all of a person's waiting alerts, and nobody else's", async () => {
    await waits('owner', 10);
    await waits('owner', 30);
    await waits('other', 20);

    const removed = await repo.deleteByUserId('owner');

    expect(removed).toBe(2);
    expect(await repo.findByUserId('owner')).toHaveLength(0);
    expect(await repo.findByUserId('other')).toHaveLength(1);
  });

  it('removes only the alerts up to a given moment when one is given', async () => {
    await waits('owner', 30);
    await waits('owner', 10);
    await waits('owner', -5); // arrived after the summary was put together

    const removed = await repo.deleteByUserId('owner', new Date(NOON.getTime() - 10 * MINUTE));

    expect(removed).toBe(2);
    expect((await repo.findByUserId('owner')).map((item) => item.subject)).toEqual(['alert -5']);
  });
});
