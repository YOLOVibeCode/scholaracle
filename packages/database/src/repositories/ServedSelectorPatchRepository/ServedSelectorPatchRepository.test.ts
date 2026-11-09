import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient, type Db } from 'mongodb';
import { ServedSelectorPatchRepository } from './ServedSelectorPatchRepository';

const KEY = {
  portalHost: 'district.aeries.net',
  recipeId: 'aeries',
  step: 'aeries.gradebook.assignments',
  skeletonHash: 'a'.repeat(64),
  gapKind: 'no_assignments' as const,
};

describe('ServedSelectorPatchRepository', () => {
  let mongod: MongoMemoryServer;
  let client: MongoClient;
  let database: Db;
  let repo: ServedSelectorPatchRepository;

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    client = new MongoClient(mongod.getUri());
    await client.connect();
    database = client.db('served_patches');
  });

  afterAll(async () => {
    await client.close();
    await mongod.stop();
  });

  beforeEach(async () => {
    await database.collection('served_selector_patches').deleteMany({});
    repo = new ServedSelectorPatchRepository(database);
  });

  it('marks served and lists by portal host', async () => {
    const patchId = await repo.markServed({
      key: KEY,
      selectors: { gradebook_row_class_tableView: 'TableView' },
      proposalCreatedAt: new Date(),
    });
    const rows = await repo.listServedForPortalHost(KEY.portalHost);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.patchId).toBe(patchId);
    expect(rows[0]!.status).toBe('served');
  });

  it('marks verified only from served', async () => {
    const patchId = await repo.markServed({
      key: KEY,
      selectors: {},
      proposalCreatedAt: new Date(),
    });
    const isOk = await repo.markVerified(patchId);
    expect(isOk).toBe(true);
    const row = await repo.findByPatchId(patchId);
    expect(row?.status).toBe('verified');
  });
});
