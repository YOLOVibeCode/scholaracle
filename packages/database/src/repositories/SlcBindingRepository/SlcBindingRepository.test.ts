import { MongoClient, ObjectId, type Db } from 'mongodb';
import { SlcBindingRepository } from './SlcBindingRepository';

describe('SlcBindingRepository', () => {
  let client: MongoClient;
  let database: Db;
  let repo: SlcBindingRepository;

  beforeAll(async () => {
    const uri = process.env['MONGODB_URI'] ?? 'mongodb://localhost:27017';
    client = new MongoClient(uri);
    await client.connect();
    database = client.db('scholaracle_test_bindings');
    repo = new SlcBindingRepository(database);
  });

  afterAll(async () => {
    await client.close();
  });

  beforeEach(async () => {
    await database.collection('slc_bindings').deleteMany({});
  });

  it('upserts and finds bindings by student and source', async () => {
    const studentId = new ObjectId();
    await repo.upsert({
      userId: 'user-1',
      portalAccountId: 'pa-1',
      studentId: studentId.toHexString(),
      sourceId: 'src-a',
      studentExternalId: 'stu-a',
    });
    await repo.upsert({
      userId: 'user-1',
      portalAccountId: 'pa-1',
      studentId: new ObjectId().toHexString(),
      sourceId: 'src-b',
      studentExternalId: 'stu-b',
    });

    const byStudent = await repo.findByStudentId('user-1', studentId.toHexString());
    expect(byStudent).toHaveLength(1);
    expect(byStudent[0]?.sourceId).toBe('src-a');

    const hasBinding = await repo.hasBindingForSourceStudent('user-1', 'src-b', 'stu-b');
    expect(hasBinding).toBe(true);
    const missing = await repo.hasBindingForSourceStudent('user-1', 'src-b', 'wrong');
    expect(missing).toBe(false);
  });
});
