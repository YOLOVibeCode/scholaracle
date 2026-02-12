import { MongoClient, ObjectId, type Db } from 'mongodb';
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

    const isOk = await repo.update(created._id!.toString(), {
      status: 'completed',
      sentCount: 1,
      failedCount: 0,
      completedAt: new Date(),
    });
    expect(isOk).toBe(true);

    const found = await repo.findById(created._id!.toString());
    expect(found?.status).toBe('completed');
    expect(found?.sentCount).toBe(1);
  });

  it('should list all batches with findAll', async () => {
    await repo.create({
      status: 'pending',
      criteria: { role: 'parent' },
      channel: 'email',
      type: 'support',
      subject: 'Batch 1',
      content: 'Body 1',
      totalRecipients: 1,
    });
    await repo.create({
      status: 'pending',
      criteria: { role: 'parent' },
      channel: 'email',
      type: 'support',
      subject: 'Batch 2',
      content: 'Body 2',
      totalRecipients: 2,
    });
    await repo.create({
      status: 'completed',
      criteria: { role: 'parent' },
      channel: 'email',
      type: 'support',
      subject: 'Batch 3',
      content: 'Body 3',
      totalRecipients: 3,
    });

    const all = await repo.findAll();
    expect(all.length).toBe(3);
    const subjects = all.map((b) => b.subject);
    expect(subjects).toEqual(expect.arrayContaining(['Batch 1', 'Batch 2', 'Batch 3']));
  });

  it('should respect findAll limit parameter', async () => {
    await repo.create({
      status: 'pending',
      criteria: { role: 'parent' },
      channel: 'email',
      type: 'support',
      subject: 'B1',
      content: 'Body',
      totalRecipients: 1,
    });
    await repo.create({
      status: 'pending',
      criteria: { role: 'parent' },
      channel: 'email',
      type: 'support',
      subject: 'B2',
      content: 'Body',
      totalRecipients: 1,
    });
    await repo.create({
      status: 'pending',
      criteria: { role: 'parent' },
      channel: 'email',
      type: 'support',
      subject: 'B3',
      content: 'Body',
      totalRecipients: 1,
    });

    const limited = await repo.findAll(2);
    expect(limited.length).toBe(2);
  });

  it('should return null for findById with non-existent id', async () => {
    const fabricatedId = new ObjectId();
    const found = await repo.findById(fabricatedId.toString());
    expect(found).toBeNull();
  });

  it('should return false when updating non-existent batch', async () => {
    const fabricatedId = new ObjectId();
    const result = await repo.update(fabricatedId.toString(), { status: 'completed' });
    expect(result).toBe(false);
  });

  it('should sort findAll results by createdAt descending', async () => {
    const oldest = new Date('2024-01-01T00:00:00Z');
    const middle = new Date('2024-06-01T00:00:00Z');
    const newest = new Date('2024-12-01T00:00:00Z');

    await repo.create({
      status: 'pending',
      criteria: { role: 'parent' },
      channel: 'email',
      type: 'support',
      subject: 'Oldest',
      content: 'Body',
      totalRecipients: 1,
      createdAt: oldest,
    });
    await repo.create({
      status: 'pending',
      criteria: { role: 'parent' },
      channel: 'email',
      type: 'support',
      subject: 'Newest',
      content: 'Body',
      totalRecipients: 1,
      createdAt: newest,
    });
    await repo.create({
      status: 'pending',
      criteria: { role: 'parent' },
      channel: 'email',
      type: 'support',
      subject: 'Middle',
      content: 'Body',
      totalRecipients: 1,
      createdAt: middle,
    });

    const all = await repo.findAll();
    expect(all.length).toBe(3);
    expect(all[0]?.subject).toBe('Newest');
    expect(all[1]?.subject).toBe('Middle');
    expect(all[2]?.subject).toBe('Oldest');
  });
});
