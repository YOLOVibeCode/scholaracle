import { MongoClient, type Db } from 'mongodb';
import { ConflictError } from '@scholaracle/contracts';
import { IngestRunRepository } from './IngestRunRepository';

describe('IngestRunRepository', () => {
  let client: MongoClient;
  let database: Db;
  let repo: IngestRunRepository;

  beforeAll(async () => {
    const uri = process.env['MONGODB_URI'] ?? 'mongodb://localhost:27017';
    client = new MongoClient(uri);
    await client.connect();
    database = client.db('scholaracle_test');
    repo = new IngestRunRepository(database);
  });

  afterAll(async () => {
    await client.close();
  });

  beforeEach(async () => {
    await database.collection('slc_runs').deleteMany({});
  });

  it('starts and commits a run and can fetch last cursor', async () => {
    await repo.startRun({
      userId: 'user-1',
      sourceId: 'src-1',
      runId: 'run-1',
      lastCursor: null,
    });

    await repo.markUploaded('user-1', 'run-1', { opCount: 5 });
    await repo.commitRun({
      userId: 'user-1',
      runId: 'run-1',
      newCursor: { type: 'opaque', value: 'c1' },
    });

    const committed = await repo.findByUserIdAndRunId('user-1', 'run-1');
    expect(committed!.opCount).toBe(5);

    const cursor = await repo.findLastCommittedCursor('user-1', 'src-1');
    expect(cursor?.value).toBe('c1');
  });

  it('marks a run as uploaded', async () => {
    await repo.startRun({
      userId: 'user-1',
      sourceId: 'src-1',
      runId: 'run-upload',
      lastCursor: null,
    });

    await repo.markUploaded('user-1', 'run-upload', { opCount: 3 });

    const run = await repo.findByUserIdAndRunId('user-1', 'run-upload');
    expect(run).not.toBeNull();
    expect(run!.status).toBe('uploaded');
    expect(run!.uploadedAt).toBeInstanceOf(Date);
    expect(run!.opCount).toBe(3);
  });

  it('finds run by userId and runId', async () => {
    await repo.startRun({
      userId: 'user-1',
      sourceId: 'src-1',
      runId: 'run-find',
      lastCursor: { type: 'opaque', value: 'prev-cursor' },
    });

    const found = await repo.findByUserIdAndRunId('user-1', 'run-find');
    expect(found).not.toBeNull();
    expect(found!.userId).toBe('user-1');
    expect(found!.sourceId).toBe('src-1');
    expect(found!.runId).toBe('run-find');
    expect(found!.mode).toBe('delta');
    expect(found!.status).toBe('started');
    expect(found!.lastCursor).toEqual({ type: 'opaque', value: 'prev-cursor' });
    expect(found!.startedAt).toBeInstanceOf(Date);
  });

  it('returns null for non-existent run', async () => {
    const result = await repo.findByUserIdAndRunId('no-such-user', 'no-such-run');
    expect(result).toBeNull();
  });

  it('returns null when no committed cursor exists', async () => {
    await repo.startRun({
      userId: 'user-1',
      sourceId: 'src-1',
      runId: 'run-uncommitted',
      lastCursor: null,
    });

    const cursor = await repo.findLastCommittedCursor('user-1', 'src-1');
    expect(cursor).toBeNull();
  });

  it('returns the most recent committed cursor when multiple runs exist', async () => {
    await repo.startRun({
      userId: 'user-1',
      sourceId: 'src-1',
      runId: 'run-a',
      lastCursor: null,
    });
    await repo.markUploaded('user-1', 'run-a', { opCount: 0 });
    await repo.commitRun({
      userId: 'user-1',
      runId: 'run-a',
      newCursor: { type: 'opaque', value: 'c1' },
    });

    // Ensure distinct committedAt timestamps
    await new Promise((resolve) => setTimeout(resolve, 50));

    await repo.startRun({
      userId: 'user-1',
      sourceId: 'src-1',
      runId: 'run-b',
      lastCursor: { type: 'opaque', value: 'c1' },
    });
    await repo.markUploaded('user-1', 'run-b', { opCount: 0 });
    await repo.commitRun({
      userId: 'user-1',
      runId: 'run-b',
      newCursor: { type: 'opaque', value: 'c2' },
    });

    const cursor = await repo.findLastCommittedCursor('user-1', 'src-1');
    expect(cursor).toEqual({ type: 'opaque', value: 'c2' });
  });

  it('ignores runs from different sources when finding cursor', async () => {
    await repo.startRun({
      userId: 'user-1',
      sourceId: 'src-1',
      runId: 'run-src1',
      lastCursor: null,
    });
    await repo.markUploaded('user-1', 'run-src1', { opCount: 0 });
    await repo.commitRun({
      userId: 'user-1',
      runId: 'run-src1',
      newCursor: { type: 'opaque', value: 'cursor-src1' },
    });

    await repo.startRun({
      userId: 'user-1',
      sourceId: 'src-2',
      runId: 'run-src2',
      lastCursor: null,
    });
    await repo.markUploaded('user-1', 'run-src2', { opCount: 0 });
    await repo.commitRun({
      userId: 'user-1',
      runId: 'run-src2',
      newCursor: { type: 'opaque', value: 'cursor-src2' },
    });

    const cursor = await repo.findLastCommittedCursor('user-1', 'src-1');
    expect(cursor).toEqual({ type: 'opaque', value: 'cursor-src1' });
  });

  it('persists coverage and warnings on markUploaded', async () => {
    await repo.startRun({
      userId: 'user-1',
      sourceId: 'src-1',
      runId: 'run-cov',
      lastCursor: null,
    });
    const coverage = {
      students: [
        {
          studentExternalId: 'stu-1',
          courses: 1,
          coursesWithGrade: 0,
          coursesWithAssignments: 0,
          attendanceRows: 0,
          teacherEmails: 0,
          gaps: [{ course: 'Entrepreneurship', kind: 'no_grade_no_assignments' as const }],
        },
      ],
    };
    const warnings = ['join warning'];
    await repo.markUploaded('user-1', 'run-cov', { coverage, warnings });
    const found = await repo.findByUserIdAndRunId('user-1', 'run-cov');
    expect(found?.coverage).toEqual(coverage);
    expect(found?.warnings).toEqual(warnings);
  });

  it('finds run by userId, sourceId, and runId', async () => {
    await repo.startRun({
      userId: 'user-1',
      sourceId: 'src-x',
      runId: 'run-src',
      lastCursor: null,
    });
    const found = await repo.findByUserIdSourceIdAndRunId('user-1', 'src-x', 'run-src');
    expect(found?.runId).toBe('run-src');
  });

  it('fails a run without requiring an envelope', async () => {
    await repo.startRun({
      userId: 'user-1',
      sourceId: 'src-1',
      runId: 'run-fail',
      lastCursor: null,
      clientMeta: { clientType: 'mobile', coreVersion: '0.1.0' },
    });

    await repo.failRun({
      userId: 'user-1',
      runId: 'run-fail',
      error: 'session expired',
    });

    const run = await repo.findByUserIdAndRunId('user-1', 'run-fail');
    expect(run).not.toBeNull();
    expect(run!.status).toBe('failed');
    expect(run!.error).toBe('session expired');
    expect(run!.clientMeta).toEqual({ clientType: 'mobile', coreVersion: '0.1.0' });
  });

  it('rejects duplicate runId on startRun', async () => {
    await repo.startRun({
      userId: 'user-1',
      sourceId: 'src-1',
      runId: 'run-dup',
      lastCursor: null,
    });

    await expect(
      repo.startRun({
        userId: 'user-1',
        sourceId: 'src-1',
        runId: 'run-dup',
        lastCursor: null,
      })
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('commitRun returns false when envelope was not uploaded', async () => {
    await repo.startRun({
      userId: 'user-1',
      sourceId: 'src-1',
      runId: 'run-no-upload',
      lastCursor: null,
    });

    const committed = await repo.commitRun({
      userId: 'user-1',
      runId: 'run-no-upload',
      newCursor: null,
    });
    expect(committed).toBe(false);
  });

  it('markUploaded returns false when run is not started', async () => {
    await repo.startRun({
      userId: 'user-1',
      sourceId: 'src-1',
      runId: 'run-twice',
      lastCursor: null,
    });
    const first = await repo.markUploaded('user-1', 'run-twice', { opCount: 1 });
    const second = await repo.markUploaded('user-1', 'run-twice', { opCount: 2 });
    expect(first).toBe(true);
    expect(second).toBe(false);
  });
});
