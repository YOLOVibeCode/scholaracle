import { MongoClient, type Db } from 'mongodb';
import { CommunicationTemplateRepository } from './CommunicationTemplateRepository';
import { CommunicationTemplate, type ICommunicationTemplateData } from '../../models/CommunicationTemplate';

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

    const ok = await repo.update(created._id!.toString(), { subject: 'Updated', content: 'New content' });
    expect(ok).toBe(true);

    const found = await repo.findById(created._id!.toString());
    expect(found?.subject).toBe('Updated');
    expect(found?.content).toBe('New content');
  });
});


