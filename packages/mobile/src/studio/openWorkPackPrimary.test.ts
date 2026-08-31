import { MemoryAssetCacheStore, AssetCache, assetCacheKey } from '@scholaracle/studio-core';
import type { IWorkPackView } from '@scholaracle/contracts';
import { openWorkPackPrimary } from './openWorkPackPrimary';

const ASSET_ID = 'demo-asset-demo-emma-ap-bio-lab-safety';
const HASH = 'demo-demo-emma-ap-bio-lab-safety-hash';
const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46]);

const PACK: IWorkPackView = {
  title: 'Unit 9 Homework',
  courseName: 'AP Biology',
  humanStatus: 'Not turned in',
  instructionsText: 'Complete the worksheet.',
  primaryAsset: {
    assetId: ASSET_ID,
    contentHash: HASH,
    fileName: 'lab-safety.pdf',
    mimeType: 'application/pdf',
    downloadUrl: 'https://cdn.example.test/lab-safety.pdf?sig=ticket',
  },
  needsSchoolLogin: [],
  moreFromCourse: [],
  capturedPages: [],
};

describe('openWorkPackPrimary', () => {
  it('opens through IAssetCache (keyed by assetId+hash, never the signed URL) then sets working_on_it', async () => {
    const store = new MemoryAssetCacheStore();
    const cache = new AssetCache(store, {
      fetch: async () => ({ status: 200, body: PDF, contentType: 'application/pdf' }),
    });
    const patched: string[] = [];
    const presented: string[] = [];

    const result = await openWorkPackPrimary({
      assignmentExternalId: 'demo-emma-ap-bio-a5',
      pack: PACK,
      cache,
      patchStatus: async (id: string, status: 'working_on_it') => {
        patched.push(`${id}:${status}`);
      },
      present: async (opened) => {
        presented.push(opened.cacheKey);
      },
    });

    expect(result.fromCache).toBe(false);
    expect(result.cacheKey).toBe(assetCacheKey(ASSET_ID, HASH));
    expect(result.cacheKey).not.toContain('sig=');
    expect(patched).toEqual(['demo-emma-ap-bio-a5:working_on_it']);
    expect(presented).toEqual([assetCacheKey(ASSET_ID, HASH)]);
    expect(store.writeCount).toBe(1);
  });

  it('does not PATCH when there is no hosted file', async () => {
    const cache = new AssetCache(new MemoryAssetCacheStore(), {
      fetch: async () => ({ status: 500, body: null }),
    });
    const patched: string[] = [];
    const result = await openWorkPackPrimary({
      assignmentExternalId: 'demo-emma-ap-bio-a5',
      pack: { ...PACK, primaryAsset: null },
      cache,
      patchStatus: async (id: string, status: 'working_on_it') => {
        patched.push(`${id}:${status}`);
      },
      present: async () => {
        throw new Error('should not present');
      },
    });
    expect(result.opened).toBe(false);
    expect(patched).toEqual([]);
  });
});
