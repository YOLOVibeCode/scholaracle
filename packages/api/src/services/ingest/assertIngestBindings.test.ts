import { MongoClient, ObjectId, type Db } from 'mongodb';
import { SlcBindingRepository } from '@scholaracle/database';
import { assertIngestBindingsForOps } from './assertIngestBindings';
import { IngestMissingBindingError } from './IngestMissingBindingError';

describe('assertIngestBindingsForOps', () => {
  let client: MongoClient;
  let database: Db;

  beforeAll(async () => {
    client = new MongoClient(process.env['MONGODB_URI'] ?? 'mongodb://localhost:27017');
    await client.connect();
    database = client.db('scholaracle_test_assert_bindings');
  });

  afterAll(async () => {
    await client.close();
  });

  beforeEach(async () => {
    await database.collection('slc_bindings').deleteMany({});
  });

  it('throws when no binding exists', async () => {
    await expect(
      assertIngestBindingsForOps({
        database,
        userId: 'user-1',
        sourceId: 'src-1',
        ops: [
          {
            op: 'upsert',
            entity: 'assignment',
            key: {
              provider: 'canvas',
              adapterId: 'canvas',
              externalId: 'a1',
              studentExternalId: 'stu-a',
              institutionExternalId: 'x.com',
              courseExternalId: 'c1',
            },
            observedAt: new Date().toISOString(),
            record: { title: 'HW' },
          },
        ],
      })
    ).rejects.toBeInstanceOf(IngestMissingBindingError);
  });

  it('passes when binding matches source and student', async () => {
    const repo = new SlcBindingRepository(database);
    await repo.upsert({
      userId: 'user-1',
      portalAccountId: 'pa-1',
      studentId: new ObjectId().toHexString(),
      sourceId: 'src-1',
      studentExternalId: 'stu-a',
    });
    await expect(
      assertIngestBindingsForOps({
        database,
        userId: 'user-1',
        sourceId: 'src-1',
        ops: [
          {
            op: 'upsert',
            entity: 'assignment',
            key: {
              provider: 'canvas',
              adapterId: 'canvas',
              externalId: 'a1',
              studentExternalId: 'stu-a',
              institutionExternalId: 'x.com',
              courseExternalId: 'c1',
            },
            observedAt: new Date().toISOString(),
            record: { title: 'HW' },
          },
        ],
      })
    ).resolves.toBeUndefined();
  });
});
