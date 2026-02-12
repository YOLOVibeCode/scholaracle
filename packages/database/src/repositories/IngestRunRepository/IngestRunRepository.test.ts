import { MongoClient, type Db } from 'mongodb';
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

    await repo.commitRun({
      userId: 'user-1',
      runId: 'run-1',
      newCursor: { type: 'opaque', value: 'c1' },
    });

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

    await repo.markUploaded('user-1', 'run-upload');

    const run = await repo.findByUserIdAndRunId('user-1', 'run-upload');
    expect(run).not.toBeNull();
    expect(run!.status).toBe('uploaded');
    expect(run!.uploadedAt).toBeInstanceOf(Date);
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
    await repo.commitRun({
      userId: 'user-1',
      runId: 'run-src2',
      newCursor: { type: 'opaque', value: 'cursor-src2' },
    });

    const cursor = await repo.findLastCommittedCursor('user-1', 'src-1');
    expect(cursor).toEqual({ type: 'opaque', value: 'cursor-src1' });
  });
});
