import { MongoClient, type Db } from 'mongodb';
import { CommunicationBatchRepository } from './CommunicationBatchRepository';

describe('CommunicationBatchRepository', () => {
  let client: MongoClient;
  let database: Db;
  let repo: CommunicationBatchRepository;

  beforeAll(async () => {
    const uri = process.env['MONGODB_URI'] ?? 'mongodb://localhost:27017';
    client = new MongoClient(uri);
    await client.connect();
    database = client.db('scholaracle_test');
    repo = new CommunicationBatchRepository(database);
  });

  afterAll(async () => {
    await client.close();
  });

  beforeEach(async () => {
    await database.collection('communication_batches').deleteMany({});
  });

  it('should create and fetch a batch', async () => {
    const created = await repo.create({
      status: 'pending',
      criteria: { role: 'parent' },
      channel: 'email',
      type: 'support',
      subject: 'Hello',
      content: 'Body',
      totalRecipients: 2,
      sentCount: 0,
      failedCount: 0,
      createdByAdminId: 'admin1',
      createdByAdminEmail: 'admin@test.com',
    });

    expect(created._id).toBeDefined();
    const found = await repo.findById(created._id!.toString());
    expect(found).not.toBeNull();
    expect(found?.subject).toBe('Hello');
    expect(found?.criteria.role).toBe('parent');
  });

  it('should update batch fields', async () => {
    const created = await repo.create({
      status: 'pending',
      criteria: { emails: ['a@test.com'] },
      channel: 'email',
      type: 'support',
      subject: 'Hello',
      content: 'Body',
      totalRecipients: 1,
    });

    const ok = await repo.update(created._id!.toString(), { status: 'completed', sentCount: 1, failedCount: 0, completedAt: new Date() });
    expect(ok).toBe(true);

    const found = await repo.findById(created._id!.toString());
    expect(found?.status).toBe('completed');
    expect(found?.sentCount).toBe(1);
  });
});


