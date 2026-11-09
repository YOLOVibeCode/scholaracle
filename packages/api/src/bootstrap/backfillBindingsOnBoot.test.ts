import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient, ObjectId, type Db } from 'mongodb';
import { StudentRepository } from '@scholaracle/database';
import { backfillBindingsOnBoot } from './backfillBindingsOnBoot';
import { LEGACY_BACKFILL_PORTAL_ACCOUNT_ID } from './backfillBindingsLib';

describe('backfillBindingsOnBoot', () => {
  let server: MongoMemoryServer;
  let client: MongoClient;
  let db: Db;
  const log = { info: jest.fn() };

  beforeAll(async () => {
    server = await MongoMemoryServer.create();
    client = new MongoClient(server.getUri());
    await client.connect();
    db = client.db('backfill_bindings_boot');
  }, 60_000);

  afterAll(async () => {
    await client.close();
    await server.stop();
  });

  beforeEach(async () => {
    await db.dropDatabase();
    log.info.mockClear();
    delete process.env['BACKFILL_BINDINGS'];
  });

  afterAll(() => {
    delete process.env['BACKFILL_BINDINGS'];
  });

  it('does nothing when the variable is unset', async () => {
    expect(await backfillBindingsOnBoot(db, log)).toBe('disabled');
    expect(log.info).not.toHaveBeenCalled();
  });

  async function seedLegacyHappyPath(): Promise<{ userId: string; studentId: ObjectId }> {
    const userOid = new ObjectId();
    const userId = userOid.toHexString();
    const studentRepo = new StudentRepository(db);
    const student = await studentRepo.create({
      userId: userOid,
      name: 'Pat Sample',
      studentId: 'ext-alpha',
      dataSources: [
        {
          id: 'src-1',
          pluginId: 'canvas',
          enabled: true,
          provider: 'canvas',
        },
      ],
    });
    await db.collection('slc_courses').insertOne({
      userId,
      studentExternalId: 'ext-alpha',
      provider: 'canvas',
      adapterId: 'canvas',
      externalId: 'course-a',
    });
    return { userId, studentId: student._id! };
  }

  it('dry-run logs counts and changes nothing', async () => {
    await seedLegacyHappyPath();
    process.env['BACKFILL_BINDINGS'] = 'dry-run';
    expect(await backfillBindingsOnBoot(db, log)).toBe('dry-run');
    expect(await db.collection('slc_bindings').countDocuments()).toBe(0);
    expect(await db.collection('one_time_migrations').countDocuments()).toBe(0);
    expect(log.info).toHaveBeenCalledWith(
      expect.objectContaining({
        migration: 'backfill-bindings',
        mode: 'dry-run',
        stats: expect.objectContaining({ wouldUpsert: 1 }),
      }),
      'one-time migration result'
    );
  });

  it('apply upserts one binding and a second boot skips', async () => {
    const { userId, studentId } = await seedLegacyHappyPath();
    process.env['BACKFILL_BINDINGS'] = 'apply';
    expect(await backfillBindingsOnBoot(db, log)).toBe('applied');

    const bindings = await db.collection('slc_bindings').find({ userId }).toArray();
    expect(bindings).toHaveLength(1);
    expect(bindings[0]?.['sourceId']).toBe('src-1');
    expect(bindings[0]?.['studentExternalId']).toBe('ext-alpha');
    expect(bindings[0]?.['portalAccountId']).toBe(LEGACY_BACKFILL_PORTAL_ACCOUNT_ID);
    expect(String(bindings[0]?.['studentId'])).toBe(studentId.toHexString());

    expect(await backfillBindingsOnBoot(db, log)).toBe('already-applied');
    expect(await db.collection('slc_bindings').countDocuments()).toBe(1);
  });

  it('skips ambiguous mapping and counts only', async () => {
    const userOid = new ObjectId();
    const userId = userOid.toHexString();
    const studentRepo = new StudentRepository(db);
    await studentRepo.create({
      userId: userOid,
      name: 'Kid One',
      studentId: 'shared-ext',
      dataSources: [{ id: 'src-1', pluginId: 'canvas', enabled: true }],
    });
    await studentRepo.create({
      userId: userOid,
      name: 'Kid Two',
      studentId: 'shared-ext',
      dataSources: [{ id: 'src-1', pluginId: 'canvas', enabled: true }],
    });
    await db.collection('slc_courses').insertOne({
      userId,
      studentExternalId: 'shared-ext',
      provider: 'canvas',
      adapterId: 'canvas',
      externalId: 'course-b',
    });

    process.env['BACKFILL_BINDINGS'] = 'apply';
    expect(await backfillBindingsOnBoot(db, log)).toBe('applied');
    expect(await db.collection('slc_bindings').countDocuments()).toBe(0);
    expect(log.info).toHaveBeenCalledWith(
      expect.objectContaining({
        stats: expect.objectContaining({ skippedAmbiguous: 1, upserted: 0 }),
      }),
      'one-time migration result'
    );
  });
});
