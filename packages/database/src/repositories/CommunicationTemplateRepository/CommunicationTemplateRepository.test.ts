import { MongoClient, ObjectId, type Db } from 'mongodb';
import { CommunicationTemplateRepository } from './CommunicationTemplateRepository';
import {
  CommunicationTemplate,
  type ICommunicationTemplateData,
} from '../../models/CommunicationTemplate';

describe('CommunicationTemplateRepository', () => {
  let client: MongoClient;
  let database: Db;
  let repo: CommunicationTemplateRepository;

  beforeAll(async () => {
    const uri = process.env['MONGODB_URI'] ?? 'mongodb://localhost:27017';
    client = new MongoClient(uri);
    await client.connect();
    database = client.db('scholaracle_test');
    repo = new CommunicationTemplateRepository(database);
  });

  afterAll(async () => {
    await client.close();
  });

  beforeEach(async () => {
    await database.collection('communication_templates').deleteMany({});
  });

  it('should create and fetch template', async () => {
    const data: ICommunicationTemplateData = {
      name: 'Welcome Template',
      channel: 'email',
      type: 'support',
      subject: 'Welcome',
      content: 'Hello there',
      createdByAdminId: 'admin1',
      createdByAdminEmail: 'admin@test.com',
    };

    const created = await repo.create(data);
    expect(created).toBeInstanceOf(CommunicationTemplate);
    expect(created._id).toBeDefined();
    expect(created.isActive).toBe(true);

    const found = await repo.findById(created._id!.toString());
    expect(found).not.toBeNull();
    expect(found?.name).toBe('Welcome Template');
    expect(found?.subject).toBe('Welcome');
  });

  it('should list templates', async () => {
    await repo.create({
      name: 'T1',
      channel: 'email',
      type: 'support',
      subject: 'S1',
      content: 'C1',
    });
    await repo.create({
      name: 'T2',
      channel: 'email',
      type: 'support',
      subject: 'S2',
      content: 'C2',
    });

    const all = await repo.findAll();
    expect(all.length).toBe(2);
    expect(all.map((x) => x.name)).toEqual(expect.arrayContaining(['T1', 'T2']));
  });

  it('should update template', async () => {
    const created = await repo.create({
      name: 'T1',
      channel: 'email',
      type: 'support',
      subject: 'S1',
      content: 'C1',
    });

    const isOk = await repo.update(created._id!.toString(), {
      subject: 'Updated',
      content: 'New content',
    });
    expect(isOk).toBe(true);

    const found = await repo.findById(created._id!.toString());
    expect(found?.subject).toBe('Updated');
    expect(found?.content).toBe('New content');
  });

  it('should return null for findById with non-existent id', async () => {
    const fabricatedId = new ObjectId();
    const found = await repo.findById(fabricatedId.toString());
    expect(found).toBeNull();
  });

  it('should return false when updating non-existent template', async () => {
    const fabricatedId = new ObjectId();
    const result = await repo.update(fabricatedId.toString(), { subject: 'Nope' });
    expect(result).toBe(false);
  });

  it('should deactivate a template via update', async () => {
    const created = await repo.create({
      name: 'Active Template',
      channel: 'email',
      type: 'support',
      subject: 'Hello',
      content: 'World',
    });

    expect(created.isActive).toBe(true);

    const isOk = await repo.update(created._id!.toString(), { isActive: false });
    expect(isOk).toBe(true);

    const found = await repo.findById(created._id!.toString());
    expect(found).not.toBeNull();
    expect(found?.isActive).toBe(false);
  });

  it('should sort findAll by updatedAt descending', async () => {
    const oldest = new Date('2024-01-01T00:00:00Z');
    const middle = new Date('2024-06-01T00:00:00Z');
    const newest = new Date('2024-12-01T00:00:00Z');

    await repo.create({
      name: 'Oldest',
      channel: 'email',
      type: 'support',
      subject: 'S1',
      content: 'C1',
      updatedAt: oldest,
    });
    await repo.create({
      name: 'Newest',
      channel: 'email',
      type: 'support',
      subject: 'S2',
      content: 'C2',
      updatedAt: newest,
    });
    await repo.create({
      name: 'Middle',
      channel: 'email',
      type: 'support',
      subject: 'S3',
      content: 'C3',
      updatedAt: middle,
    });

    const all = await repo.findAll();
    expect(all.length).toBe(3);
    expect(all[0]?.name).toBe('Newest');
    expect(all[1]?.name).toBe('Middle');
    expect(all[2]?.name).toBe('Oldest');
  });
});
