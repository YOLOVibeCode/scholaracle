import { MongoClient, type Db } from 'mongodb';
import { IngestSourceRepository } from './IngestSourceRepository';

describe('IngestSourceRepository', () => {
  let client: MongoClient;
  let database: Db;
  let repo: IngestSourceRepository;

  beforeAll(async () => {
    const uri = process.env['MONGODB_URI'] ?? 'mongodb://localhost:27017';
    client = new MongoClient(uri);
    await client.connect();
    database = client.db('scholaracle_test');
    repo = new IngestSourceRepository(database);
  });

  afterAll(async () => {
    await client.close();
  });

  beforeEach(async () => {
    await database.collection('slc_sources').deleteMany({});
  });

  it('upserts and lists sources by user', async () => {
    await repo.upsert({
      userId: 'user-1',
      sourceId: 'src-1',
      provider: 'skyward',
      adapterId: 'com.hobbyist.skyward-x',
      displayName: 'District X',
      portalBaseUrl: 'https://example.edu',
    });

    const sources = await repo.listByUserId('user-1');
    expect(sources.length).toBe(1);
    expect(sources[0]?.sourceId).toBe('src-1');
  });

  it('updates existing source on re-upsert', async () => {
    await repo.upsert({
      userId: 'user-1',
      sourceId: 'src-1',
      provider: 'skyward',
      adapterId: 'com.hobbyist.skyward-x',
      displayName: 'District X',
      portalBaseUrl: 'https://example.edu',
    });

    await repo.upsert({
      userId: 'user-1',
      sourceId: 'src-1',
      provider: 'skyward',
      adapterId: 'com.hobbyist.skyward-x',
      displayName: 'District Y',
      portalBaseUrl: 'https://example.edu',
    });

    const sources = await repo.listByUserId('user-1');
    expect(sources.length).toBe(1);
    expect(sources[0]?.displayName).toBe('District Y');
  });

  it('finds source by userId and sourceId', async () => {
    await repo.upsert({
      userId: 'user-1',
      sourceId: 'src-1',
      provider: 'skyward',
      adapterId: 'com.hobbyist.skyward-x',
      displayName: 'District X',
      portalBaseUrl: 'https://example.edu',
    });

    const found = await repo.findByUserIdAndSourceId('user-1', 'src-1');
    expect(found).not.toBeNull();
    expect(found!.userId).toBe('user-1');
    expect(found!.sourceId).toBe('src-1');
    expect(found!.provider).toBe('skyward');
    expect(found!.adapterId).toBe('com.hobbyist.skyward-x');
    expect(found!.displayName).toBe('District X');
    expect(found!.portalBaseUrl).toBe('https://example.edu');
    expect(found!.createdAt).toBeInstanceOf(Date);
    expect(found!.updatedAt).toBeInstanceOf(Date);
  });

  it('returns null for non-existent source', async () => {
    const result = await repo.findByUserIdAndSourceId('no-such-user', 'no-such-source');
    expect(result).toBeNull();
  });

  it('returns empty array when user has no sources', async () => {
    const sources = await repo.listByUserId('no-such-user');
    expect(sources).toEqual([]);
  });

  it('lists multiple sources for same user', async () => {
    await repo.upsert({
      userId: 'user-1',
      sourceId: 'src-a',
      provider: 'skyward',
      adapterId: 'com.hobbyist.skyward-a',
      displayName: 'District A',
    });

    await repo.upsert({
      userId: 'user-1',
      sourceId: 'src-b',
      provider: 'skyward',
      adapterId: 'com.hobbyist.skyward-b',
      displayName: 'District B',
    });

    await repo.upsert({
      userId: 'user-1',
      sourceId: 'src-c',
      provider: 'skyward',
      adapterId: 'com.hobbyist.skyward-c',
      displayName: 'District C',
    });

    const sources = await repo.listByUserId('user-1');
    expect(sources.length).toBe(3);
    const sourceIds = sources.map((s) => s.sourceId).sort();
    expect(sourceIds).toEqual(['src-a', 'src-b', 'src-c']);
  });

  it('persists and returns schedule, dataTypes, and enabled', async () => {
    await repo.upsert({
      userId: 'user-1',
      sourceId: 'src-1',
      provider: 'canvas',
      adapterId: 'com.instructure.canvas',
      displayName: 'Canvas LMS',
      portalBaseUrl: 'https://school.instructure.com',
      schedule: 'hourly',
      dataTypes: ['grades', 'assignments', 'calendar'],
      enabled: false,
    });

    const found = await repo.findByUserIdAndSourceId('user-1', 'src-1');
    expect(found).not.toBeNull();
    expect(found!.schedule).toBe('hourly');
    expect(found!.dataTypes).toEqual(['grades', 'assignments', 'calendar']);
    expect(found!.enabled).toBe(false);
  });

  it('isolates sources between users', async () => {
    await repo.upsert({
      userId: 'user-1',
      sourceId: 'src-1',
      provider: 'skyward',
      adapterId: 'com.hobbyist.skyward-x',
      displayName: 'User 1 Source',
    });

    await repo.upsert({
      userId: 'user-2',
      sourceId: 'src-2',
      provider: 'skyward',
      adapterId: 'com.hobbyist.skyward-y',
      displayName: 'User 2 Source',
    });

    const user1Sources = await repo.listByUserId('user-1');
    expect(user1Sources.length).toBe(1);
    expect(user1Sources[0]?.sourceId).toBe('src-1');
    expect(user1Sources[0]?.displayName).toBe('User 1 Source');
  });
});
