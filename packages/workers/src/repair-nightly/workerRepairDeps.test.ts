import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomBytes, createCipheriv } from 'node:crypto';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient, type Db } from 'mongodb';
import { buildWorkerRepairDeps } from './workerRepairDeps';

const ALGORITHM = 'aes-256-gcm';

function seal(plain: string, hexKey: string): { encrypted: string; iv: string } {
  const key = Buffer.from(hexKey, 'hex');
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: 16 });
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final(), cipher.getAuthTag()]);
  return { encrypted: enc.toString('base64'), iv: iv.toString('base64') };
}

describe('buildWorkerRepairDeps', () => {
  let mongod: MongoMemoryServer;
  let client: MongoClient;
  let database: Db;
  let assetRoot: string;
  const cipherKey = randomBytes(32).toString('hex');

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    client = new MongoClient(mongod.getUri());
    await client.connect();
    database = client.db('worker_repair_deps');
    assetRoot = join(tmpdir(), `worker-repair-${Date.now()}`);
    await mkdir(assetRoot, { recursive: true });
    process.env['RUN_SKELETON_CIPHER_KEY'] = cipherKey;
    process.env['ASSET_STORAGE_PATH'] = assetRoot;
  });

  afterAll(async () => {
    await client.close();
    await mongod.stop();
    delete process.env['RUN_SKELETON_CIPHER_KEY'];
    delete process.env['ASSET_STORAGE_PATH'];
  });

  it('returns null when no skeleton row exists', async () => {
    const deps = buildWorkerRepairDeps(database, 'bill-user');
    const skeleton = await deps.loadSkeleton({
      step: 'aeries.gradebook.assignments',
      skeletonHash: 'a'.repeat(64),
    });
    expect(skeleton).toBeNull();
  });

  it('decrypts skeleton JSON from asset storage', async () => {
    const skeletonHash = 'b'.repeat(64);
    const storageKey = 'runs/test-skeleton.json';
    const plain = JSON.stringify({ skeleton: '{"tag":"div"}' });
    await mkdir(join(assetRoot, 'runs'), { recursive: true });
    await writeFile(join(assetRoot, storageKey), JSON.stringify(seal(plain, cipherKey)), 'utf8');
    await database.collection('slc_run_skeletons').insertOne({
      sha256: skeletonHash,
      step: 'aeries.gradebook.assignments',
      storageKey,
      createdAt: new Date(),
    });

    const deps = buildWorkerRepairDeps(database, 'bill-user');
    const loaded = await deps.loadSkeleton({
      step: 'aeries.gradebook.assignments',
      skeletonHash,
    });
    expect(loaded).toBe('{"tag":"div"}');
  });

  it('returns null when decrypted payload has no skeleton string', async () => {
    const skeletonHash = 'c'.repeat(64);
    const storageKey = 'runs/no-skeleton.json';
    await mkdir(join(assetRoot, 'runs'), { recursive: true });
    await writeFile(
      join(assetRoot, storageKey),
      JSON.stringify(seal(JSON.stringify({ note: 'missing' }), cipherKey)),
      'utf8'
    );
    await database.collection('slc_run_skeletons').insertOne({
      sha256: skeletonHash,
      step: 'skyward.gradebook',
      storageKey,
      createdAt: new Date(),
    });
    const deps = buildWorkerRepairDeps(database, 'bill-user');
    const loaded = await deps.loadSkeleton({
      step: 'skyward.gradebook',
      skeletonHash,
    });
    expect(loaded).toBeNull();
  });
});
