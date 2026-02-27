import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Readable } from 'node:stream';
import { LocalAssetStore } from './LocalAssetStore';

describe('LocalAssetStore', () => {
  let baseDir: string;

  beforeEach(() => {
    baseDir = mkdtempSync(join(tmpdir(), 'local-asset-store-'));
  });

  afterEach(() => {
    rmSync(baseDir, { recursive: true, force: true });
  });

  it('put and get round-trip content', async () => {
    const store = new LocalAssetStore(baseDir);
    const stream = Readable.from(Buffer.from('hello'));
    await store.put('k1', stream, { contentType: 'text/plain', contentLength: 5 });
    const { stream: out } = await store.get('k1');
    const chunks: Buffer[] = [];
    for await (const c of out) chunks.push(c as Buffer);
    expect(Buffer.concat(chunks).toString()).toBe('hello');
  });

  it('exists returns true after put, false for missing key', async () => {
    const store = new LocalAssetStore(baseDir);
    expect(await store.exists('missing')).toBe(false);
    await store.put('k1', Readable.from('x'), {
      contentType: 'application/octet-stream',
      contentLength: 1,
    });
    expect(await store.exists('k1')).toBe(true);
  });

  it('delete removes file; exists returns false afterward', async () => {
    const store = new LocalAssetStore(baseDir);
    await store.put('k1', Readable.from('x'), {
      contentType: 'application/octet-stream',
      contentLength: 1,
    });
    await store.delete('k1');
    expect(await store.exists('k1')).toBe(false);
  });

  it('getSignedUrl throws', async () => {
    const store = new LocalAssetStore(baseDir);
    await expect(store.getSignedUrl('k', 60)).rejects.toThrow('Signed URLs not supported');
  });
});
