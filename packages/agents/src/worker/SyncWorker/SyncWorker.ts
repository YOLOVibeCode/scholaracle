import { MongoQueue, type IJob } from '../../queue/MongoQueue';
import type { Db, Collection } from 'mongodb';

// ---------------------------------------------------------------------------
// Sync job data shape (stored in MongoQueue job.data)
// ---------------------------------------------------------------------------

export interface ISyncJobData {
  /** Student document _id (string). */
  readonly studentId: string;
  /** Index into student.dataSources[]. */
  readonly dataSourceIndex: number;
  /** Provider key (canvas, skyward, google-classroom, oneroster, aeries, …). */
  readonly provider: string;
  /** Adapter ID (e.g. com.instructure.canvas). */
  readonly adapterId: string;
  /** Portal / institution URL. */
  readonly baseUrl: string;
  /** How this run was triggered. */
  readonly trigger: 'manual' | 'scheduled';
  /** Owner user ID (for notifications). */
  readonly userId: string;
}

// ---------------------------------------------------------------------------
// Sync run record (persisted in 'sync_runs' collection)
// ---------------------------------------------------------------------------

export type SyncRunStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface ISyncRun {
  _id?: import('mongodb').ObjectId;
  jobId: string;
  studentId: string;
  provider: string;
  adapterId: string;
  baseUrl: string;
  trigger: 'manual' | 'scheduled';
  userId: string;
  status: SyncRunStatus;
  startedAt?: Date;
  completedAt?: Date;
  durationMs?: number;
  /** Summary of what was extracted. */
  result?: {
    courses?: number;
    assignments?: number;
    files?: number;
    grades?: number;
    errors?: string[];
  };
  error?: string;
  createdAt: Date;
  updatedAt: Date;
}

// ---------------------------------------------------------------------------
// Adapter runner — this is the function the SyncWorker calls.
// It is injected so the agents package doesn't depend on connector/playwright.
// ---------------------------------------------------------------------------

export type AdapterRunnerFn = (
  provider: string,
  adapterId: string,
  credentials: Record<string, string>,
  baseUrl: string,
  runId: string
) => Promise<{
  success: boolean;
  summary: ISyncRun['result'];
  error?: string;
}>;

// ---------------------------------------------------------------------------
// SyncWorker config
// ---------------------------------------------------------------------------

export interface ISyncWorkerConfig {
  readonly pollIntervalMs?: number;
  readonly concurrency?: number;
  /** Resolves encrypted credentials stored on Student.dataSources[]. */
  readonly decryptCredentials: (encrypted: { encrypted: string; iv: string }) => string | null;
  /** The function that actually runs an adapter. Injected by the worker bootstrap. */
  readonly runAdapter: AdapterRunnerFn;
}

// ---------------------------------------------------------------------------
// SyncWorker
// ---------------------------------------------------------------------------

/**
 * Worker that processes 'sync' jobs from the MongoQueue.
 * Follows the same pattern as NotificationWorker.
 */
export class SyncWorker {
  private readonly _queue: MongoQueue;
  private readonly _db: Db;
  private readonly _runs: Collection<ISyncRun>;
  private readonly _pollMs: number;
  private readonly _concurrency: number;
  private readonly _decrypt: ISyncWorkerConfig['decryptCredentials'];
  private readonly _runAdapter: AdapterRunnerFn;
  private _running = false;
  private _activeJobs = 0;
  private _loopPromise?: Promise<void>;

  constructor(queue: MongoQueue, db: Db, config: ISyncWorkerConfig) {
    this._queue = queue;
    this._db = db;
    this._runs = db.collection<ISyncRun>('sync_runs');
    this._pollMs = config.pollIntervalMs ?? 5000;
    this._concurrency = config.concurrency ?? 3;
    this._decrypt = config.decryptCredentials;
    this._runAdapter = config.runAdapter;
  }

  // -----------------------------------------------------------------------
  // Lifecycle
  // -----------------------------------------------------------------------

  public start(): void {
    if (this._running) return;
    this._running = true;
    this._loopPromise = this._loop();
    // eslint-disable-next-line no-console
    console.log('[SyncWorker] started');
  }

  public async stop(): Promise<void> {
    if (!this._running) return;
    this._running = false;
    while (this._activeJobs > 0) await sleep(200);
    if (this._loopPromise) await this._loopPromise;
    // eslint-disable-next-line no-console
    console.log('[SyncWorker] stopped');
  }

  // -----------------------------------------------------------------------
  // Core: process a single sync job
  // -----------------------------------------------------------------------

  public async processJob(job: IJob): Promise<void> {
    const data = job.data as unknown as ISyncJobData;

    // Create a run record
    const run: ISyncRun = {
      jobId: job._id.toString(),
      studentId: data.studentId,
      provider: data.provider,
      adapterId: data.adapterId,
      baseUrl: data.baseUrl,
      trigger: data.trigger,
      userId: data.userId,
      status: 'running',
      startedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const { insertedId } = await this._runs.insertOne(run);

    try {
      // 1. Resolve credentials from the student document
      const students = this._db.collection('students');
      const student = await students.findOne({
        _id: {
          $in: [data.studentId, new (await import('mongodb')).ObjectId(data.studentId)],
        } as unknown,
      } as Record<string, unknown>);

      if (!student) throw new Error(`Student ${data.studentId} not found`);

      const ds = (student['dataSources'] as Array<Record<string, unknown>>)?.[data.dataSourceIndex];
      if (!ds) throw new Error(`DataSource index ${data.dataSourceIndex} not found on student`);

      const encCreds = ds['credentials'] as { encrypted: string; iv: string } | undefined;
      if (!encCreds?.encrypted)
        throw new Error('No encrypted credentials stored for this data source');

      const plainJson = this._decrypt(encCreds);
      if (!plainJson)
        throw new Error('Failed to decrypt credentials (check CREDENTIALS_ENCRYPTION_KEY)');

      const credentials = JSON.parse(plainJson) as Record<string, string>;

      // 2. Run the adapter
      const startMs = Date.now();
      const result = await this._runAdapter(
        data.provider,
        data.adapterId,
        credentials,
        data.baseUrl,
        insertedId.toString()
      );
      const durationMs = Date.now() - startMs;

      // 3. Update run record + student last-scraped timestamp
      const now = new Date();
      await this._runs.updateOne(
        { _id: insertedId },
        {
          $set: {
            status: result.success ? 'completed' : 'failed',
            completedAt: now,
            durationMs,
            result: result.summary,
            error: result.error,
            updatedAt: now,
          },
        }
      );

      // Update student.dataSources[idx].lastScraped / lastSuccess / lastError
      const dsPrefix = `dataSources.${data.dataSourceIndex}`;
      const studentUpdate: Record<string, unknown> = {
        [`${dsPrefix}.lastScraped`]: now,
        [`${dsPrefix}.status`]: result.success ? 'active' : 'error',
      };
      if (result.success) {
        studentUpdate[`${dsPrefix}.lastSuccess`] = now;
      } else {
        studentUpdate[`${dsPrefix}.lastError`] = result.error;
      }
      await students.updateOne({ _id: student['_id'] }, { $set: studentUpdate });

      if (result.success) {
        await this._queue.complete(job._id.toString());
      } else {
        await this._queue.fail(
          job._id.toString(),
          new Error(result.error ?? 'Adapter returned failure')
        );
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await this._runs.updateOne(
        { _id: insertedId },
        {
          $set: {
            status: 'failed',
            completedAt: new Date(),
            error: msg,
            updatedAt: new Date(),
          },
        }
      );
      await this._queue.fail(job._id.toString(), err instanceof Error ? err : new Error(msg));
    }
  }

  // -----------------------------------------------------------------------
  // Poll loop
  // -----------------------------------------------------------------------

  private async _loop(): Promise<void> {
    while (this._running) {
      try {
        if (this._activeJobs >= this._concurrency) {
          await sleep(this._pollMs);
          continue;
        }
        // Only pick up 'sync' jobs
        const job = await this._queue.getNextJob();
        if (!job || job.type !== 'sync') {
          if (job) {
            // Not ours — put it back
            await this._queue.fail(job._id.toString(), new Error('Not a sync job')).catch(() => {});
          }
          await sleep(this._pollMs);
          continue;
        }
        this._activeJobs++;
        this.processJob(job)
          .catch((e) => console.error('[SyncWorker] job error:', e))
          .finally(() => {
            this._activeJobs--;
          });
      } catch (err) {
        console.error('[SyncWorker] loop error:', err);
        await sleep(this._pollMs * 2);
      }
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
