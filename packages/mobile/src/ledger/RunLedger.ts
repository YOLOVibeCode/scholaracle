/**
 * Local run ledger — persists structured per-run history in AsyncStorage.
 *
 * Each entry captures provider, status, phases with timings, op counts, errors,
 * and the version stamp. This is the "debuggable interface" referenced in the plan.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const LEDGER_KEY = 'slc_run_ledger';
const MAX_ENTRIES = 50;

export type RunStatus = 'success' | 'failed' | 'in_progress';

export interface IRunPhase {
  readonly phase: string;
  readonly message: string;
  readonly timestamp: string;
  readonly durationMs?: number;
}

export interface IRunEntry {
  readonly runId: string;
  readonly provider: string;
  readonly studentExternalId: string;
  readonly status: RunStatus;
  readonly startedAt: string;
  readonly completedAt?: string;
  readonly elapsedMs?: number;
  readonly phases: IRunPhase[];
  readonly opCount?: number;
  readonly errorMessage?: string;
  readonly adapterVersion?: string;
  readonly coreVersion?: string;
}

export class RunLedger {
  /**
   * Serialization queue for mutating ops. Every read-modify-write goes
   * through here so concurrent startRun/addPhase/completeRun/clear calls
   * can never interleave their load/save halves (which lost phases and
   * resurrected completed runs as in_progress).
   */
  private _queue: Promise<void> = Promise.resolve();

  private _enqueue<T>(fn: () => Promise<T>): Promise<T> {
    const result = this._queue.then(fn);
    // Keep the chain alive even when an op rejects; callers still see
    // their own rejection via `result`.
    this._queue = result.then(
      () => undefined,
      () => undefined
    );
    return result;
  }

  async startRun(params: {
    runId: string;
    provider: string;
    studentExternalId: string;
    adapterVersion?: string;
    coreVersion?: string;
  }): Promise<void> {
    return this._enqueue(async () => {
      const entry: IRunEntry = {
        runId: params.runId,
        provider: params.provider,
        studentExternalId: params.studentExternalId,
        status: 'in_progress',
        startedAt: new Date().toISOString(),
        phases: [],
        adapterVersion: params.adapterVersion,
        coreVersion: params.coreVersion,
      };
      await this._upsert(entry);
    });
  }

  async addPhase(runId: string, phase: IRunPhase): Promise<void> {
    return this._enqueue(async () => {
      const entries = await this._load();
      const idx = entries.findIndex((e) => e.runId === runId);
      if (idx === -1) return;
      const updated: IRunEntry = {
        ...entries[idx]!,
        phases: [...entries[idx]!.phases, phase],
      };
      entries[idx] = updated;
      await this._save(entries);
    });
  }

  async completeRun(
    runId: string,
    result: { status: RunStatus; opCount?: number; errorMessage?: string }
  ): Promise<void> {
    return this._enqueue(async () => {
      const entries = await this._load();
      const idx = entries.findIndex((e) => e.runId === runId);
      if (idx === -1) return;
      const start = new Date(entries[idx]!.startedAt).getTime();
      const now = Date.now();
      const updated: IRunEntry = {
        ...entries[idx]!,
        status: result.status,
        completedAt: new Date().toISOString(),
        elapsedMs: now - start,
        opCount: result.opCount,
        errorMessage: result.errorMessage,
      };
      entries[idx] = updated;
      await this._save(entries);
    });
  }

  async getAll(): Promise<IRunEntry[]> {
    return this._load();
  }

  async getByProvider(provider: string): Promise<IRunEntry[]> {
    const entries = await this._load();
    return entries.filter((e) => e.provider === provider);
  }

  async clear(): Promise<void> {
    return this._enqueue(() => AsyncStorage.removeItem(LEDGER_KEY));
  }

  private async _load(): Promise<IRunEntry[]> {
    try {
      const raw = await AsyncStorage.getItem(LEDGER_KEY);
      if (!raw) return [];
      return JSON.parse(raw) as IRunEntry[];
    } catch {
      return [];
    }
  }

  private async _upsert(entry: IRunEntry): Promise<void> {
    const entries = await this._load();
    const idx = entries.findIndex((e) => e.runId === entry.runId);
    if (idx !== -1) {
      entries[idx] = entry;
    } else {
      entries.unshift(entry);
      if (entries.length > MAX_ENTRIES) entries.splice(MAX_ENTRIES);
    }
    await this._save(entries);
  }

  private async _save(entries: IRunEntry[]): Promise<void> {
    await AsyncStorage.setItem(LEDGER_KEY, JSON.stringify(entries));
  }
}

export const runLedger = new RunLedger();
