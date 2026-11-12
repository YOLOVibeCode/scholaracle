import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient, ObjectId, type Db } from 'mongodb';
import { alertStudentIdOnBoot, rewriteAlertStudentIds } from './alertStudentIdOnBoot';

describe('alertStudentIdOnBoot (sharing S3: legacy portal ids -> Mongo ids)', () => {
  let server: MongoMemoryServer;
  let client: MongoClient;
  let db: Db;
  const log = { info: jest.fn() };

  const ownerA = new ObjectId();
  const ownerB = new ObjectId();
  const ownerC = new ObjectId();
  const ava = new ObjectId(); // skyward:1001
  const gideon = new ObjectId(); // aeries:1001 (sibling, same bare id, other portal)
  const bea = new ObjectId(); // bare 2002
  const already = new ObjectId();

  beforeAll(async () => {
    server = await MongoMemoryServer.create();
    client = new MongoClient(server.getUri());
    await client.connect();
    db = client.db('alert_student_id_on_boot');
  }, 60_000);

  afterAll(async () => {
    delete process.env['ALERT_STUDENT_ID_MIGRATION'];
    await client.close();
    await server.stop();
  });

  beforeEach(async () => {
    await db.dropDatabase();
    log.info.mockClear();
    delete process.env['ALERT_STUDENT_ID_MIGRATION'];
    const now = new Date();
    await db.collection('students').insertMany([
      { _id: ava, userId: ownerA, name: 'Ava', studentId: 'skyward:1001', createdAt: now },
      { _id: gideon, userId: ownerA, name: 'Gideon', studentId: 'aeries:1001', createdAt: now },
      { _id: bea, userId: ownerB, name: 'Bea', studentId: '2002', createdAt: now },
    ]);
    await db.collection('alerts').insertMany([
      // Owner A: prefixed ids resolve; the bare id is shared by two siblings -> ambiguous.
      { userId: ownerA.toString(), studentId: 'skyward:1001', type: 'grade_drop', tag: 'a-ava' },
      { userId: ownerA.toString(), studentId: 'aeries:1001', type: 'deadline', tag: 'a-gideon' },
      { userId: ownerA.toString(), studentId: '1001', type: 'test', tag: 'a-ambiguous' },
      // Owner B: bare id resolves; an unknown id does not.
      { userId: ownerB.toString(), studentId: '2002', type: 'test', tag: 'b-bea' },
      { userId: ownerB.toString(), studentId: 'unknown-student', type: 'test', tag: 'b-unknown' },
      // Owner C has no student 2002: scoped by owner, this must NOT become Bea's.
      { userId: ownerC.toString(), studentId: '2002', type: 'test', tag: 'c-foreign' },
      // Already a Mongo id: never selected.
      { userId: ownerA.toString(), studentId: already.toString(), type: 'test', tag: 'mongo' },
    ]);
  });

  async function studentIdOf(tag: string): Promise<unknown> {
    return (await db.collection('alerts').findOne({ tag }))?.['studentId'];
  }

  it('does nothing when the variable is unset', async () => {
    expect(await alertStudentIdOnBoot(db, log)).toBe('disabled');
    expect(log.info).not.toHaveBeenCalled();
    expect(await studentIdOf('a-ava')).toBe('skyward:1001');
  });

  it('dry-run reports the plan and changes nothing', async () => {
    process.env['ALERT_STUDENT_ID_MIGRATION'] = 'dry-run';
    expect(await alertStudentIdOnBoot(db, log)).toBe('dry-run');
    expect(log.info).toHaveBeenCalledWith(
      expect.objectContaining({
        migration: 'alert-student-id',
        mode: 'dry-run',
        stats: { scanned: 6, rewritten: 3, ambiguous: 1, unresolved: 2 },
      }),
      'one-time migration result'
    );
    expect(await studentIdOf('a-ava')).toBe('skyward:1001');
    expect(await db.collection('one_time_migrations').countDocuments()).toBe(0);
  });

  it('apply rewrites resolvable rows, leaves ambiguous and foreign rows alone, then marks itself done', async () => {
    process.env['ALERT_STUDENT_ID_MIGRATION'] = 'apply';
    expect(await alertStudentIdOnBoot(db, log)).toBe('applied');

    expect(await studentIdOf('a-ava')).toBe(ava.toString());
    expect(await studentIdOf('a-gideon')).toBe(gideon.toString());
    expect(await studentIdOf('b-bea')).toBe(bea.toString());
    // Sibling collision: not guessed.
    expect(await studentIdOf('a-ambiguous')).toBe('1001');
    // Unknown and other-owner rows: untouched.
    expect(await studentIdOf('b-unknown')).toBe('unknown-student');
    expect(await studentIdOf('c-foreign')).toBe('2002');
    expect(await studentIdOf('mongo')).toBe(already.toString());

    const marker = await db
      .collection('one_time_migrations')
      .findOne({ _id: 'alert-student-id' as never });
    expect(marker?.['stats']).toEqual({ scanned: 6, rewritten: 3, ambiguous: 1, unresolved: 2 });

    // Second boot skips; the rewrite itself is idempotent (rewritten rows are Mongo ids now).
    expect(await alertStudentIdOnBoot(db, log)).toBe('already-applied');
    expect(await rewriteAlertStudentIds(db, true)).toEqual({
      scanned: 3,
      rewritten: 0,
      ambiguous: 1,
      unresolved: 2,
    });
  });

  it('two replicas booting at once: exactly one applies', async () => {
    process.env['ALERT_STUDENT_ID_MIGRATION'] = 'apply';
    const results = await Promise.all([
      alertStudentIdOnBoot(db, log),
      alertStudentIdOnBoot(db, log),
    ]);
    expect(results.sort()).toEqual(['already-applied', 'applied']);
    expect(await studentIdOf('a-ava')).toBe(ava.toString());
  });
});
