/**
 * Client contract for class-scoped offline work packs.
 *
 * A "class pack" bundles all current-term assignment views + asset bytes for one
 * course so the student can keep working after losing internet access.
 *
 * Data layout:
 *   - JSON (IndexedDB)  — pack views without expiring signed URLs
 *   - Bytes (IAssetCache / Cache Storage) — keyed by assetId:contentHash
 *
 * Full spec: docs/CLASS_OFFLINE_PACK.md
 */

import type { IWorkPackView } from '@scholaracle/contracts';
import type { IAssetCache, IAssetRef } from './IAssetCache';

// ---------------------------------------------------------------------------
// Response shape from the server API
// (mirrors IOfflinePackResponse in packages/api/src/routes/studio/mongoOfflinePackSource.ts)
// ---------------------------------------------------------------------------

export interface IOfflineAssetRef extends IAssetRef {
  readonly fileName: string;
  readonly mimeType?: string;
  /** 24h signed download ticket. Discard after use; never store this URL. */
  readonly downloadUrl: string;
}

export interface IOfflinePackApiResponse {
  readonly courseExternalId: string;
  readonly courseName: string;
  readonly assembledAt: string;
  readonly packs: readonly IWorkPackView[];
  readonly assets: readonly IOfflineAssetRef[];
}

// ---------------------------------------------------------------------------
// What the client persists in IndexedDB (no signed URLs)
// ---------------------------------------------------------------------------

export interface ISavedCoursePack {
  readonly courseExternalId: string;
  readonly courseName: string;
  /** Client-clock ISO timestamp of when save() completed. */
  readonly savedAt: string;
  /**
   * True when any asset that was cached has a different contentHash than what
   * the server last sent (indicates a parent sync happened; student should
   * reconnect to refresh).
   */
  readonly stale: boolean;
  readonly packs: readonly IWorkPackView[];
}

// ---------------------------------------------------------------------------
// The interface
// ---------------------------------------------------------------------------

export interface ICourseOfflinePackDeps {
  readonly assetCache: IAssetCache;
  readonly packStore: IPackStore;
  readonly fetchPack: (courseExternalId: string) => Promise<IOfflinePackApiResponse>;
}

/**
 * Persist (save) and retrieve (load) a class pack for offline use.
 */
export interface ICourseOfflinePack {
  /**
   * Download all assignment views and asset bytes for the course.
   * Must only be called while online (requires network for both API and CDN).
   * Idempotent: calling save() again replaces the stored pack.
   */
  save(courseExternalId: string): Promise<void>;

  /**
   * Load the locally persisted pack for a course.
   * Works offline. Returns null if the course was never saved.
   */
  load(courseExternalId: string): Promise<ISavedCoursePack | null>;

  /**
   * True if the client has a saved pack for this course (even if stale).
   */
  isSaved(courseExternalId: string): Promise<boolean>;

  /**
   * Remove all local data for this course (IndexedDB JSON + cached bytes).
   */
  evict(courseExternalId: string): Promise<void>;
}

// ---------------------------------------------------------------------------
// Storage abstraction for pack JSON (IndexedDB in web, MMKV/AsyncStorage on mobile)
// ---------------------------------------------------------------------------

export interface IPackStore {
  get(courseExternalId: string): Promise<ISavedCoursePack | null>;
  set(courseExternalId: string, pack: ISavedCoursePack): Promise<void>;
  delete(courseExternalId: string): Promise<void>;
  keys(): Promise<readonly string[]>;
}
