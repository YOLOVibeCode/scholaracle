import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient, type Db } from 'mongodb';
import { rekeyAdapterIdsOnBoot } from './rekeyAdapterIdsOnBoot';

describe('rekeyAdapterIdsOnBoot', () => {
  let server: MongoMemoryServer;
  let client: MongoClient;
  let db: Db;
  const log = { info: jest.fn() };

  beforeAll(async () => {
    server = await MongoMemoryServer.create();
    client = new MongoClient(server.getUri());
    await client.connect();
    db = client.db('rekey_on_boot');
  }, 60_000);

  afterAll(async () => {
    await client.close();
    await server.stop();
  });

  beforeEach(async () => {
    await db.dropDatabase();
    log.info.mockClear();
    delete process.env['REKEY_ADAPTER_IDS'];
    await db.collection('slc_courses').insertOne({
      userId: 'u1',
      provider: 'canvas',
      adapterId: 'com.instructure.canvas',
      externalId: 'c1',
      studentExternalId: 's1',
    });
  });

  afterAll(() => {
    delete process.env['REKEY_ADAPTER_IDS'];
  });

  it('does nothing when the variable is unset', async () => {
    expect(await rekeyAdapterIdsOnBoot(db, log)).toBe('disabled');
    expect(log.info).not.toHaveBeenCalled();
  });

  it('dry-run logs the plan and changes nothing', async () => {
    process.env['REKEY_ADAPTER_IDS'] = 'dry-run';
    expect(await rekeyAdapterIdsOnBoot(db, log)).toBe('dry-run');
    const doc = await db.collection('slc_courses').findOne({ externalId: 'c1' });
    expect(doc?.['adapterId']).toBe('com.instructure.canvas');
    expect(await db.collection('one_time_migrations').countDocuments()).toBe(0);
  });

  it('apply re-keys once and a second boot skips it', async () => {
    process.env['REKEY_ADAPTER_IDS'] = 'apply';
    expect(await rekeyAdapterIdsOnBoot(db, log)).toBe('applied');
    const doc = await db.collection('slc_courses').findOne({ externalId: 'c1' });
    expect(doc?.['adapterId']).toBe('canvas');
    expect(await rekeyAdapterIdsOnBoot(db, log)).toBe('already-applied');
  });
});
