import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient, type Db } from 'mongodb';
import { alertAckByOnBoot, backfillAcknowledgedBy } from './alertAckByOnBoot';
import { BULK_BATCH_SIZE } from './oneTimeMigrationMarker';

describe('alertAckByOnBoot (sharing S3: acknowledgedBy backfill)', () => {
  let server: MongoMemoryServer;
  let client: MongoClient;
  let db: Db;
  const log = { info: jest.fn() };
  const ackedAt = new Date('2026-11-01T12:00:00.000Z');
  const createdAt = new Date('2026-10-30T08:00:00.000Z');

  beforeAll(async () => {
    server = await MongoMemoryServer.create();
    client = new MongoClient(server.getUri());
    await client.connect();
    db = client.db('alert_ack_by_on_boot');
  }, 60_000);

  afterAll(async () => {
    delete process.env['ALERT_ACK_BY_MIGRATION'];
    await client.close();
    await server.stop();
  });

  beforeEach(async () => {
    await db.dropDatabase();
    log.info.mockClear();
    delete process.env['ALERT_ACK_BY_MIGRATION'];
    await db.collection('alerts').insertMany([
      // Legacy owner acknowledgement with a timestamp.
      {
        userId: 'owner-1',
        studentId: 's1',
        type: 'grade_drop',
        acknowledged: true,
        acknowledgedAt: ackedAt,
        createdAt,
      },
      // Legacy acknowledgement without a timestamp: falls back to createdAt.
      { userId: 'owner-1', studentId: 's1', type: 'deadline', acknowledged: true, createdAt },
      // Already migrated: left alone.
      {
        userId: 'owner-2',
        studentId: 's2',
        type: 'test',
        acknowledged: true,
        acknowledgedAt: ackedAt,
        acknowledgedBy: {
          'owner-2': '2026-11-02T00:00:00.000Z',
          'member-9': '2026-11-03T00:00:00.000Z',
        },
      },
      // Unacknowledged: never touched.
      { userId: 'owner-1', studentId: 's1', type: 'missing_assignment', acknowledged: false },
      // No usable owner id: skipped, not crashed.
      { studentId: 's3', type: 'test', acknowledged: true },
    ]);
  });

  it('does nothing when the variable is unset', async () => {
    expect(await alertAckByOnBoot(db, log)).toBe('disabled');
    expect(log.info).not.toHaveBeenCalled();
    expect(
      await db.collection('alerts').countDocuments({ acknowledgedBy: { $exists: true } })
    ).toBe(1);
  });

  it('dry-run reports the plan and changes nothing', async () => {
    process.env['ALERT_ACK_BY_MIGRATION'] = 'dry-run';
    expect(await alertAckByOnBoot(db, log)).toBe('dry-run');
    expect(log.info).toHaveBeenCalledWith(
      expect.objectContaining({
        migration: 'alert-ack-by',
        mode: 'dry-run',
        stats: { scanned: 4, updated: 2, skipped: 2 },
      }),
      'one-time migration result'
    );
    expect(
      await db.collection('alerts').countDocuments({ acknowledgedBy: { $exists: true } })
    ).toBe(1);
    expect(await db.collection('one_time_migrations').countDocuments()).toBe(0);
  });

  it("apply copies the owner acknowledgement, keeps legacy fields and other people's entries, then marks itself done", async () => {
    process.env['ALERT_ACK_BY_MIGRATION'] = 'apply';
    expect(await alertAckByOnBoot(db, log)).toBe('applied');

    const alerts = db.collection('alerts');
    const withTime = await alerts.findOne({ type: 'grade_drop' });
    expect(withTime?.['acknowledgedBy']).toEqual({ 'owner-1': ackedAt.toISOString() });
    expect(withTime?.['acknowledged']).toBe(true);
    expect(withTime?.['acknowledgedAt']).toEqual(ackedAt);

    const withoutTime = await alerts.findOne({ type: 'deadline' });
    expect(withoutTime?.['acknowledgedBy']).toEqual({ 'owner-1': createdAt.toISOString() });

    const already = await alerts.findOne({ type: 'test', userId: 'owner-2' });
    expect(already?.['acknowledgedBy']).toEqual({
      'owner-2': '2026-11-02T00:00:00.000Z',
      'member-9': '2026-11-03T00:00:00.000Z',
    });

    expect(
      (await alerts.findOne({ type: 'missing_assignment' }))?.['acknowledgedBy']
    ).toBeUndefined();
    expect((await alerts.findOne({ studentId: 's3' }))?.['acknowledgedBy']).toBeUndefined();

    const marker = await db
      .collection('one_time_migrations')
      .findOne({ _id: 'alert-ack-by' as never });
    expect(marker?.['startedAt']).toBeInstanceOf(Date);
    expect(marker?.['appliedAt']).toBeInstanceOf(Date);
    expect(marker?.['stats']).toEqual({ scanned: 4, updated: 2, skipped: 2 });

    // A second boot with the variable still set skips; the backfill itself is idempotent too.
    expect(await alertAckByOnBoot(db, log)).toBe('already-applied');
    expect(await backfillAcknowledgedBy(db, true)).toEqual({ scanned: 4, updated: 0, skipped: 4 });
  });

  it('two replicas booting at once: exactly one applies, the other skips, no duplicate-key error', async () => {
    process.env['ALERT_ACK_BY_MIGRATION'] = 'apply';
    const results = await Promise.all([alertAckByOnBoot(db, log), alertAckByOnBoot(db, log)]);
    expect(results.sort()).toEqual(['already-applied', 'applied']);
    expect(await db.collection('one_time_migrations').countDocuments()).toBe(1);
    expect(
      (await db.collection('alerts').findOne({ type: 'grade_drop' }))?.['acknowledgedBy']
    ).toEqual({ 'owner-1': ackedAt.toISOString() });
  });

  it('writes in bulk batches and still covers every row past the batch size', async () => {
    const extra = BULK_BATCH_SIZE + 7;
    await db.collection('alerts').insertMany(
      Array.from({ length: extra }, (_, i) => ({
        userId: 'owner-bulk',
        studentId: 's-bulk',
        type: 'test',
        acknowledged: true,
        acknowledgedAt: ackedAt,
        createdAt,
        seq: i,
      }))
    );
    const stats = await backfillAcknowledgedBy(db, true);
    expect(stats).toEqual({ scanned: 4 + extra, updated: 2 + extra, skipped: 2 });
    expect(
      await db.collection('alerts').countDocuments({
        userId: 'owner-bulk',
        'acknowledgedBy.owner-bulk': ackedAt.toISOString(),
      })
    ).toBe(extra);
  });
});
