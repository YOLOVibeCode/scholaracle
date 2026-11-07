import { MongoClient, type Db } from 'mongodb';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { RepairCandidateRepository } from './RepairCandidateRepository';

describe('RepairCandidateRepository', () => {
  let memoryServer: MongoMemoryServer;
  let client: MongoClient;
  let database: Db;
  let repository: RepairCandidateRepository;

  beforeAll(async () => {
    memoryServer = await MongoMemoryServer.create();
    client = new MongoClient(memoryServer.getUri());
    await client.connect();
    database = client.db('repair-candidate-test');
  }, 60_000);

  afterAll(async () => {
    await client.close();
    await memoryServer.stop();
  });

  beforeEach(async () => {
    await database.collection('repair_candidates').deleteMany({});
    await database.collection('repair_candidates').createIndex(
      {
        portalHost: 1,
        recipeId: 1,
        step: 1,
        skeletonHash: 1,
        gapKind: 1,
      },
      { unique: true }
    );
    repository = new RepairCandidateRepository(database);
  });

  it('increments seenCount for duplicate district keys', async () => {
    const key = {
      portalHost: 'district.aeries.net',
      recipeId: 'aeries',
      step: 'aeries.gradebook.assignments',
      skeletonHash: 'a'.repeat(64),
      gapKind: 'no_grade_no_assignments' as const,
    };
    await repository.recordSightings([key]);
    await repository.recordSightings([key]);
    const row = await repository.findByKey(key);
    expect(row?.seenCount).toBe(2);
    const count = await database.collection('repair_candidates').countDocuments();
    expect(count).toBe(1);
  });
});
