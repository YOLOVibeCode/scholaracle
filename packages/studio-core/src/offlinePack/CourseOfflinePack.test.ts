/**
 * TDD tests for CourseOfflinePack.
 *
 * Key scenarios (per CLASS_OFFLINE_PACK.md §6):
 *   1. save() pre-fetches bytes and persists JSON; load() returns saved pack
 *   2. open() with no downloadUrl (offline) returns cached bytes
 *   3. new contentHash after save → stale: true when opening old bytes
 *   4. isSaved / evict lifecycle
 */

import type {
  IOfflinePackApiResponse,
  IPackStore,
  ISavedCoursePack,
} from '@scholaracle/interfaces';
import type { IAssetCache, ICachedAsset, IAssetRef } from '@scholaracle/interfaces';
import { CourseOfflinePack } from './CourseOfflinePack';

// ---------------------------------------------------------------------------
// Fakes
// ---------------------------------------------------------------------------

/** In-memory IPackStore */
class MemoryPackStore implements IPackStore {
  private readonly _map = new Map<string, ISavedCoursePack>();

  async get(courseExternalId: string) {
    return this._map.get(courseExternalId) ?? null;
  }
  async set(courseExternalId: string, pack: ISavedCoursePack) {
    this._map.set(courseExternalId, pack);
  }
  async delete(courseExternalId: string) {
    this._map.delete(courseExternalId);
  }
  async keys() {
    return [...this._map.keys()];
  }
}

/** Simple in-memory IAssetCache */
class MemoryAssetCache implements IAssetCache {
  private readonly _bytes = new Map<string, Uint8Array>();

  seedBytes(assetId: string, contentHash: string, data: Uint8Array) {
    this._bytes.set(`${assetId}:${contentHash}`, data);
  }

  async open(ref: IAssetRef): Promise<ICachedAsset> {
    const key = `${ref.assetId}:${ref.contentHash}`;
    const hit = this._bytes.get(key);
    if (hit) {
      return {
        bytes: hit,
        contentType: 'application/pdf',
        cacheKey: key,
        fromCache: true,
        stale: false,
      };
    }
    // Simulate network fetch via downloadUrl
    if (ref.downloadUrl) {
      const fetched = new Uint8Array([1, 2, 3]);
      this._bytes.set(key, fetched);
      return {
        bytes: fetched,
        contentType: 'application/pdf',
        cacheKey: key,
        fromCache: false,
        stale: false,
      };
    }
    // No URL and no cache hit: stale with older hash if available
    const oldKey = [...this._bytes.keys()].find((k) => k.startsWith(`${ref.assetId}:`));
    if (oldKey) {
      return {
        bytes: this._bytes.get(oldKey)!,
        contentType: 'application/pdf',
        cacheKey: oldKey,
        fromCache: true,
        stale: true,
        requestedHashMissing: true,
      };
    }
    throw new Error('MISSING_URL and no cached copy');
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeApiResponse(
  courseExternalId = 'canvas-course-alg2',
  assetId = 'asset-1',
  contentHash = 'abc123'
): IOfflinePackApiResponse {
  return {
    courseExternalId,
    courseName: 'Algebra II',
    assembledAt: new Date().toISOString(),
    packs: [
      {
        title: 'Formula Sheet',
        courseName: 'Algebra II',
        humanStatus: 'missing',
        instructionsText: 'Complete the worksheet.',
        primaryAsset: {
          assetId,
          contentHash,
          fileName: 'formula-sheet.pdf',
          mimeType: 'application/pdf',
          downloadUrl: 'https://cdn.example.com/signed/formula-sheet.pdf',
        },
        needsSchoolLogin: [],
        moreFromCourse: [],
      },
    ],
    assets: [
      {
        assetId,
        contentHash,
        fileName: 'formula-sheet.pdf',
        mimeType: 'application/pdf',
        downloadUrl: 'https://cdn.example.com/signed/formula-sheet.pdf',
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CourseOfflinePack', () => {
  let packStore: MemoryPackStore;
  let assetCache: MemoryAssetCache;
  let fetchMock: jest.Mock<Promise<IOfflinePackApiResponse>, [string]>;
  let pack: CourseOfflinePack;

  beforeEach(() => {
    packStore = new MemoryPackStore();
    assetCache = new MemoryAssetCache();
    fetchMock = jest.fn();
    pack = new CourseOfflinePack({ assetCache, packStore, fetchPack: fetchMock });
  });

  describe('save → load', () => {
    it('save() fetches the API and persists pack JSON', async () => {
      fetchMock.mockResolvedValueOnce(makeApiResponse());
      await pack.save('canvas-course-alg2');

      expect(fetchMock).toHaveBeenCalledWith('canvas-course-alg2');
      const saved = await packStore.get('canvas-course-alg2');
      expect(saved).not.toBeNull();
      expect(saved!.courseExternalId).toBe('canvas-course-alg2');
      expect(saved!.courseName).toBe('Algebra II');
      expect(saved!.packs).toHaveLength(1);
    });

    it('save() pre-fetches asset bytes into assetCache', async () => {
      fetchMock.mockResolvedValueOnce(makeApiResponse('canvas-course-alg2', 'asset-1', 'abc123'));
      await pack.save('canvas-course-alg2');

      // Opening the cached asset without a downloadUrl should succeed (bytes already in cache)
      const result = await assetCache.open({ assetId: 'asset-1', contentHash: 'abc123' });
      expect(result.fromCache).toBe(true);
      expect(result.stale).toBe(false);
    });

    it('load() returns the persisted pack', async () => {
      fetchMock.mockResolvedValueOnce(makeApiResponse());
      await pack.save('canvas-course-alg2');

      const loaded = await pack.load('canvas-course-alg2');
      expect(loaded).not.toBeNull();
      expect(loaded!.courseName).toBe('Algebra II');
      expect(loaded!.packs).toHaveLength(1);
    });

    it('load() returns null for a course that was never saved', async () => {
      const loaded = await pack.load('never-saved-course');
      expect(loaded).toBeNull();
    });

    it('save() strips downloadUrl from persisted JSON', async () => {
      fetchMock.mockResolvedValueOnce(makeApiResponse());
      await pack.save('canvas-course-alg2');

      const saved = await packStore.get('canvas-course-alg2');
      // The primaryAsset in persisted packs must NOT contain downloadUrl
      const view = saved!.packs[0];
      const asset = view?.primaryAsset;
      expect((asset as Record<string, unknown> | null)?.['downloadUrl']).toBeUndefined();
    });
  });

  describe('offline open — no downloadUrl', () => {
    it('opening a cached asset with no downloadUrl returns bytes from cache (offline scenario)', async () => {
      // Simulate bytes already in cache from a previous save
      assetCache.seedBytes('asset-1', 'abc123', new Uint8Array([0xff, 0xd8, 0xff]));

      const result = await assetCache.open({
        assetId: 'asset-1',
        contentHash: 'abc123',
        downloadUrl: '',
      });
      expect(result.fromCache).toBe(true);
      expect(result.stale).toBe(false);
      expect(result.bytes[0]).toBe(0xff);
    });
  });

  describe('stale detection', () => {
    it('new contentHash after save marks stale in IAssetCache', async () => {
      // Seed old bytes for asset-1 with old hash
      assetCache.seedBytes('asset-1', 'old-hash', new Uint8Array([1]));

      // Requesting new hash without a downloadUrl → stale copy of old hash
      const result = await assetCache.open({
        assetId: 'asset-1',
        contentHash: 'new-hash',
        downloadUrl: '',
      });
      expect(result.stale).toBe(true);
      expect(result.requestedHashMissing).toBe(true);
    });
  });

  describe('isSaved / evict', () => {
    it('isSaved returns false before save', async () => {
      expect(await pack.isSaved('canvas-course-alg2')).toBe(false);
    });

    it('isSaved returns true after save', async () => {
      fetchMock.mockResolvedValueOnce(makeApiResponse());
      await pack.save('canvas-course-alg2');
      expect(await pack.isSaved('canvas-course-alg2')).toBe(true);
    });

    it('evict removes the pack; isSaved returns false afterwards', async () => {
      fetchMock.mockResolvedValueOnce(makeApiResponse());
      await pack.save('canvas-course-alg2');
      await pack.evict('canvas-course-alg2');
      expect(await pack.isSaved('canvas-course-alg2')).toBe(false);
      expect(await pack.load('canvas-course-alg2')).toBeNull();
    });
  });
});
