import { MongoClient, type Db } from 'mongodb';
import { AgendaOverrideRepository } from './AgendaOverrideRepository';

describe('AgendaOverrideRepository', () => {
  let client: MongoClient;
  let database: Db;
  let repo: AgendaOverrideRepository;

  beforeAll(async () => {
    const uri = process.env['MONGODB_URI'] ?? 'mongodb://localhost:27017';
    client = new MongoClient(uri);
    await client.connect();
    database = client.db('scholaracle_test');
    repo = new AgendaOverrideRepository(database);
  });

  afterAll(async () => {
    await client.close();
  });

  beforeEach(async () => {
    await database.collection('agenda_overrides').deleteMany({});
  });

  it('upserts a snooze and lists active snoozes', async () => {
    const snoozedUntil = new Date(Date.now() + 60_000);
    await repo.upsertSnooze({
      userId: 'user-1',
      itemType: 'event_occurrence',
      itemKey: 'k1',
      scope: 'occurrence',
      snoozedUntil,
    });

    const active = await repo.listActiveSnoozes({ userId: 'user-1' });
    expect(active.length).toBe(1);
    expect(active[0]?.itemKey).toBe('k1');
  });
});


