import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient, type Db } from 'mongodb';
import { RepairProposalRepository, ServedSelectorPatchRepository } from '@scholaracle/database';
import { verifyAndServeProposal } from './verifyAndServeProposal';
import { recordSelectorPatchVerification } from './recordSelectorPatchVerification';

jest.mock('@scholaracle/scraper-core', () => ({
  replaySelectorPatch: jest.fn(async () => ({ ok: true as const, counts: {} })),
}));

const KEY = {
  portalHost: 'district.aeries.net',
  recipeId: 'aeries',
  step: 'aeries.gradebook.assignments',
  skeletonHash: 'e'.repeat(64),
  gapKind: 'no_assignments' as const,
};

describe('selector patch lifecycle integration', () => {
  let mongod: MongoMemoryServer;
  let client: MongoClient;
  let database: Db;

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    client = new MongoClient(mongod.getUri());
    await client.connect();
    database = client.db('selector_lifecycle');
  });

  afterAll(async () => {
    await client.close();
    await mongod.stop();
  });

  beforeEach(async () => {
    await database.collection('repair_proposals').deleteMany({});
    await database.collection('served_selector_patches').deleteMany({});
  });

  it('serves after replay pass and verifies on clean coverage', async () => {
    const proposalRepo = new RepairProposalRepository(database);
    await proposalRepo.insertProposal(KEY, {
      selectors: {},
      confidence: 0.9,
      model: 'test',
    });
    const result = await verifyAndServeProposal(database, KEY, {});
    expect(result).toBe('served');

    const servedRepo = new ServedSelectorPatchRepository(database);
    const rows = await servedRepo.listServedForPortalHost(KEY.portalHost);
    expect(rows).toHaveLength(1);
    const patchId = rows[0]!.patchId;

    await recordSelectorPatchVerification({
      database,
      patchId,
      key: KEY,
      coverage: {
        students: [
          {
            studentExternalId: '1',
            courses: 2,
            coursesWithGrade: 2,
            coursesWithAssignments: 2,
            attendanceRows: 0,
            teacherEmails: 1,
            gaps: [],
          },
        ],
      },
    });
    const after = await servedRepo.findByPatchId(patchId);
    expect(after?.status).toBe('verified');
  });
});
