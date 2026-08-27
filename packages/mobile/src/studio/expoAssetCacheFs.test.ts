import { DirectoryAssetCacheStore, assetCacheKey } from '@scholaracle/studio-core';
import { createExpoAssetCacheFs, type IExpoLegacyFs } from './expoAssetCacheFs';

const ASSET_ID = 'demo-asset-demo-emma-ap-bio-lab-safety';
const HASH = 'demo-demo-emma-ap-bio-lab-safety-hash';
const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46]);

function memoryExpoFs(): IExpoLegacyFs & { files: Map<string, string> } {
  const files = new Map<string, string>();
  const rootPrefix = 'file:///docs/scholaracle-asset-cache/';
  return {
    files,
    documentDirectory: 'file:///docs/',
    makeDirectoryAsync: async () => undefined,
    readAsStringAsync: async (uri) => {
      const val = files.get(uri);
      if (val === undefined) throw new Error('missing');
      return val;
    },
    writeAsStringAsync: async (uri, contents) => {
      files.set(uri, contents);
    },
    deleteAsync: async (uri) => {
      files.delete(uri);
    },
    readDirectoryAsync: async () =>
      [...files.keys()]
        .filter((k) => k.startsWith(rootPrefix))
        .map((k) => k.slice(rootPrefix.length)),
  };
}

describe('createExpoAssetCacheFs', () => {
  it('stores cache files under the app document dir, not the signed URL', async () => {
    const expoFs = memoryExpoFs();
    const store = new DirectoryAssetCacheStore(createExpoAssetCacheFs(expoFs));
    const key = assetCacheKey(ASSET_ID, HASH);
    await store.set(key, { bytes: PDF, contentType: 'application/pdf' });
    const hit = await store.get(key);
    expect(Array.from(hit?.bytes ?? [])).toEqual(Array.from(PDF));
    expect([...expoFs.files.keys()].join(' ')).not.toContain('sig=');
    expect([...expoFs.files.keys()].some((k) => k.includes('scholaracle-asset-cache'))).toBe(true);
  });
});
