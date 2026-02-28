import { readFileSync, writeFileSync, existsSync } from 'node:fs';

/** Persisted entry for one synced asset (file) by externalId. */
export interface ISyncStateEntry {
  readonly externalId: string;
  readonly contentHash: string;
  readonly lastModified: string;
  readonly fileSize: number;
}

interface ISyncStateFile {
  readonly entries: Record<string, ISyncStateEntry>;
}

/**
 * In-memory sync state with load/save to a JSON file.
 * Used to quick-reject unchanged files (updated_at + size match) without re-downloading.
 */
export class SyncState {
  private _entries: Map<string, ISyncStateEntry> = new Map();

  /** Load state from a JSON file (creates empty state if file missing). */
  load(filePath: string): void {
    this._entries.clear();
    if (!existsSync(filePath)) return;
    const raw = readFileSync(filePath, 'utf-8');
    let data: ISyncStateFile;
    try {
      data = JSON.parse(raw) as ISyncStateFile;
    } catch {
      return;
    }
    if (data?.entries && typeof data.entries === 'object') {
      for (const [id, entry] of Object.entries(data.entries)) {
        if (
          entry &&
          typeof entry.externalId === 'string' &&
          typeof entry.contentHash === 'string'
        ) {
          this._entries.set(id, entry as ISyncStateEntry);
        }
      }
    }
  }

  /** Write current state to a JSON file. */
  save(filePath: string): void {
    const entries: Record<string, ISyncStateEntry> = {};
    for (const [id, entry] of this._entries) {
      entries[id] = entry;
    }
    const data: ISyncStateFile = { entries };
    writeFileSync(filePath, JSON.stringify(data, null, 0), 'utf-8');
  }

  get(externalId: string): ISyncStateEntry | undefined {
    return this._entries.get(externalId);
  }

  set(externalId: string, entry: ISyncStateEntry): void {
    this._entries.set(externalId, entry);
  }
}
