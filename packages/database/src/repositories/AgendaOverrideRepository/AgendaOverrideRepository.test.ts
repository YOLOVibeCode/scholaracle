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

  it('updates existing snooze on re-upsert with same composite key', async () => {
    const firstDate = new Date(Date.now() + 60_000);
    const secondDate = new Date(Date.now() + 120_000);

    await repo.upsertSnooze({
      userId: 'user-1',
      itemType: 'event_occurrence',
      itemKey: 'k1',
      scope: 'occurrence',
      snoozedUntil: firstDate,
    });

    await repo.upsertSnooze({
      userId: 'user-1',
      itemType: 'event_occurrence',
      itemKey: 'k1',
      scope: 'occurrence',
      snoozedUntil: secondDate,
    });

    const active = await repo.listActiveSnoozes({ userId: 'user-1' });
    expect(active.length).toBe(1);
    expect(active[0]?.snoozedUntil.getTime()).toBe(secondDate.getTime());

    // Verify only 1 record exists in the collection
    const count = await database.collection('agenda_overrides').countDocuments({});
    expect(count).toBe(1);
  });

  it('returns empty array when all snoozes have expired', async () => {
    const pastDate = new Date(Date.now() - 60_000);
    await repo.upsertSnooze({
      userId: 'user-1',
      itemType: 'event_occurrence',
      itemKey: 'k1',
      scope: 'occurrence',
      snoozedUntil: pastDate,
    });

    const active = await repo.listActiveSnoozes({ userId: 'user-1' });
    expect(active).toEqual([]);
  });

  it('filters by userId and ignores other users', async () => {
    const snoozedUntil = new Date(Date.now() + 60_000);

    await repo.upsertSnooze({
      userId: 'user-1',
      itemType: 'event_occurrence',
      itemKey: 'k1',
      scope: 'occurrence',
      snoozedUntil,
    });

    await repo.upsertSnooze({
      userId: 'user-2',
      itemType: 'event_occurrence',
      itemKey: 'k2',
      scope: 'occurrence',
      snoozedUntil,
    });

    const activeUser1 = await repo.listActiveSnoozes({ userId: 'user-1' });
    expect(activeUser1.length).toBe(1);
    expect(activeUser1[0]?.itemKey).toBe('k1');

    const activeUser2 = await repo.listActiveSnoozes({ userId: 'user-2' });
    expect(activeUser2.length).toBe(1);
    expect(activeUser2[0]?.itemKey).toBe('k2');
  });

  it('respects custom now parameter in listActiveSnoozes', async () => {
    const snoozedUntil = new Date(Date.now() + 30_000);
    await repo.upsertSnooze({
      userId: 'user-1',
      itemType: 'event_occurrence',
      itemKey: 'k1',
      scope: 'occurrence',
      snoozedUntil,
    });

    // With a future "now" that is past the snooze expiry, should return empty
    const futureNow = new Date(Date.now() + 60_000);
    const active = await repo.listActiveSnoozes({ userId: 'user-1', now: futureNow });
    expect(active).toEqual([]);

    // With default now (current time), snooze should still be active
    const stillActive = await repo.listActiveSnoozes({ userId: 'user-1' });
    expect(stillActive.length).toBe(1);
  });

  it('handles multiple snoozes for same user with different itemKeys', async () => {
    const snoozedUntil = new Date(Date.now() + 60_000);

    await repo.upsertSnooze({
      userId: 'user-1',
      itemType: 'event_occurrence',
      itemKey: 'k1',
      scope: 'occurrence',
      snoozedUntil,
    });

    await repo.upsertSnooze({
      userId: 'user-1',
      itemType: 'event_occurrence',
      itemKey: 'k2',
      scope: 'occurrence',
      snoozedUntil,
    });

    await repo.upsertSnooze({
      userId: 'user-1',
      itemType: 'assignment',
      itemKey: 'k3',
      scope: 'series',
      snoozedUntil,
    });

    const active = await repo.listActiveSnoozes({ userId: 'user-1' });
    expect(active.length).toBe(3);
    const keys = active.map((a) => a.itemKey).sort();
    expect(keys).toEqual(['k1', 'k2', 'k3']);
  });
});
