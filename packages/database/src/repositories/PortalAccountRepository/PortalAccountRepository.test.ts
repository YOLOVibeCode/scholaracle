import { MongoClient, type Db } from 'mongodb';
import { PortalAccountRepository } from './PortalAccountRepository';

describe('PortalAccountRepository', () => {
  let client: MongoClient;
  let database: Db;
  let repo: PortalAccountRepository;

  beforeAll(async () => {
    const uri = process.env['MONGODB_URI'] ?? 'mongodb://localhost:27017';
    client = new MongoClient(uri);
    await client.connect();
    database = client.db('scholaracle_test_portal_accounts');
    repo = new PortalAccountRepository(database);
  });

  afterAll(async () => {
    await client.close();
  });

  beforeEach(async () => {
    await database.collection('slc_portal_accounts').deleteMany({});
  });

  it('upserts by provider and institution host', async () => {
    const first = await repo.upsertByHost({
      userId: 'user-1',
      provider: 'canvas',
      adapterId: 'canvas',
      portalBaseUrl: 'https://school.instructure.com',
      institutionExternalId: 'school.instructure.com',
      displayName: 'Canvas',
    });
    const second = await repo.upsertByHost({
      userId: 'user-1',
      provider: 'canvas',
      adapterId: 'canvas',
      portalBaseUrl: 'https://school.instructure.com/',
      institutionExternalId: 'school.instructure.com',
      displayName: 'Canvas updated',
    });
    expect(second.portalAccountId).toBe(first.portalAccountId);
    expect(second.displayName).toBe('Canvas updated');
  });
});
