import { randomBytes, createCipheriv } from 'node:crypto';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
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
  const savedAssetRoot = process.env['ASSET_STORAGE_PATH'];
  const savedCipherKey = process.env['RUN_SKELETON_CIPHER_KEY'];

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    client = new MongoClient(mongod.getUri());
    await client.connect();
    database = client.db('worker_repair_deps');
  });

  afterAll(async () => {
    await client.close();
    await mongod.stop();
  });

  afterEach(() => {
    if (savedAssetRoot === undefined) {
      delete process.env['ASSET_STORAGE_PATH'];
    } else {
      process.env['ASSET_STORAGE_PATH'] = savedAssetRoot;
    }
    if (savedCipherKey === undefined) {
      delete process.env['RUN_SKELETON_CIPHER_KEY'];
    } else {
      process.env['RUN_SKELETON_CIPHER_KEY'] = savedCipherKey;
    }
  });

  it('returns billingUserId and null skeleton when blob row is missing', async () => {
    const deps = buildWorkerRepairDeps(database, 'bill-1');
    expect(deps.billingUserId).toBe('bill-1');
    const sk = await deps.loadSkeleton({ step: 'aeries.gradebook', skeletonHash: 'a'.repeat(64) });
    expect(sk).toBeNull();
  });

  it('loads decrypted skeleton from asset storage', async () => {
    const hexKey = randomBytes(32).toString('hex');
    process.env['RUN_SKELETON_CIPHER_KEY'] = hexKey;
    const assetDir = await mkdtemp(join(tmpdir(), 'worker-sk-'));
    process.env['ASSET_STORAGE_PATH'] = assetDir;
    const storageKey = 'runs/sk-1.json';
    const plain = JSON.stringify({ skeleton: '{"tag":"div"}' });
    await mkdir(join(assetDir, 'runs'), { recursive: true });
    await writeFile(join(assetDir, storageKey), JSON.stringify(seal(plain, hexKey)), 'utf8');
    await database.collection('slc_run_skeletons').insertOne({
      sha256: 'b'.repeat(64),
      step: 'aeries.gradebook.assignments',
      storageKey,
      createdAt: new Date(),
    });
    const deps = buildWorkerRepairDeps(database, 'bill-2');
    const sk = await deps.loadSkeleton({
      step: 'aeries.gradebook.assignments',
      skeletonHash: 'b'.repeat(64),
    });
    expect(sk).toBe('{"tag":"div"}');
  });
});
