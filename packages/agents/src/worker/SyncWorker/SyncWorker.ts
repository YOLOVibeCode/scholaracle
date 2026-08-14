import { MongoQueue, type IJob } from '../../queue/MongoQueue';
import type { Db, Collection } from 'mongodb';
import { getErrorReporter } from '@scholaracle/contracts';
import { logger } from '../../logger';

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
  /**
   * Owner userId — the slc_* tenant partition.  The connector token is minted with this userId
   * so that ingest writes land in the owner's partition.
   */
  readonly userId: string;
  /**
   * The userId of the account that triggered the sync (may differ from userId when a co-parent
   * taps Sync).  Stored on the run document for audit; does not affect data routing.
   */
  readonly triggeredByUserId?: string;
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
  /** Owner userId — slc_* tenant partition. */
  userId: string;
  /** The account that triggered the sync (may differ from userId for co-parent runs). */
  triggeredByUserId?: string;
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

export interface IAdapterRunnerOptions {
  readonly sourceId?: string;
  readonly displayName?: string;
  readonly studentId?: string;
  readonly studentName?: string;
}

export type AdapterRunnerFn = (
  provider: string,
  adapterId: string,
  credentials: Record<string, string>,
  baseUrl: string,
  runId: string,
  options?: IAdapterRunnerOptions
) => Promise<{
  success: boolean;
  summary: ISyncRun['result'];
  error?: string;
  envelope?: import('@scholaracle/contracts').ISlcIngestEnvelopeV1;
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
  /** Base URL of the API (e.g. https://api.scholarmancy.com). When set with createConnectorToken, envelope is submitted to ingest. */
  readonly apiBaseUrl?: string;
  /** Creates a connector JWT for the given userId. Required for submitting envelope to ingest. */
  readonly createConnectorToken?: (userId: string) => string;
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
  private readonly _apiBaseUrl: string | undefined;
  private readonly _createConnectorToken: ((userId: string) => string) | undefined;
  private _running = false;
  private _activeJobs = 0;
  private _loopPromise?: Promise<void>;

  /** Number of sync jobs currently being processed. */
  public get activeJobs(): number {
    return this._activeJobs;
  }

  constructor(queue: MongoQueue, db: Db, config: ISyncWorkerConfig) {
    this._queue = queue;
    this._db = db;
    this._runs = db.collection<ISyncRun>('sync_runs');
    this._pollMs = config.pollIntervalMs ?? 5000;
    this._concurrency = config.concurrency ?? 3;
    this._decrypt = config.decryptCredentials;
    this._runAdapter = config.runAdapter;
    this._apiBaseUrl = config.apiBaseUrl;
    this._createConnectorToken = config.createConnectorToken;
  }

  // -----------------------------------------------------------------------
  // Lifecycle
  // -----------------------------------------------------------------------

  public start(): void {
    if (this._running) return;
    this._running = true;
    this._loopPromise = this._loop();
    logger.info('sync worker started');
  }

  public async stop(): Promise<void> {
    if (!this._running) return;
    this._running = false;
    while (this._activeJobs > 0) await sleep(200);
    if (this._loopPromise) await this._loopPromise;
    logger.info('sync worker stopped');
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
      triggeredByUserId: data.triggeredByUserId ?? data.userId,
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

      const sourceId = (ds['id'] as string) ?? '';
      const displayName = (ds['displayName'] ?? ds['pluginId'] ?? 'Source') as string;

      let runId = insertedId.toString();
      let runnerOptions: IAdapterRunnerOptions | undefined;

      if (this._apiBaseUrl && this._createConnectorToken && sourceId) {
        const token = this._createConnectorToken(data.userId);
        const base = this._apiBaseUrl.replace(/\/$/, '');
        const createRes = await fetch(`${base}/api/ingest/v1/runs`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ sourceId }),
        });
        if (!createRes.ok) {
          const errText = await createRes.text();
          throw new Error(`Ingest run create failed: ${createRes.status} ${errText}`);
        }
        const createBody = (await createRes.json()) as { runId?: string };
        if (createBody.runId) {
          runId = createBody.runId;
          runnerOptions = {
            sourceId,
            displayName,
            studentId: data.studentId,
            studentName: (student['name'] as string) ?? '',
          };
        }
      }

      // 2. Run the adapter
      const startMs = Date.now();
      const result = await this._runAdapter(
        data.provider,
        data.adapterId,
        credentials,
        data.baseUrl,
        runId,
        runnerOptions
      );
      const durationMs = Date.now() - startMs;

      if (result.success && result.envelope && runId !== insertedId.toString()) {
        // Patch the envelope's runId to match the one the ingest API expects
        const patchedEnvelope = {
          ...result.envelope,
          run: { ...result.envelope.run, runId },
        };
        const token = this._createConnectorToken!(data.userId);
        const base = this._apiBaseUrl!.replace(/\/$/, '');
        const envRes = await fetch(`${base}/api/ingest/v1/runs/${runId}/envelope`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(patchedEnvelope),
        });
        if (!envRes.ok) {
          const errText = await envRes.text();
          throw new Error(`Ingest envelope submit failed: ${envRes.status} ${errText}`);
        }
        const completeRes = await fetch(`${base}/api/ingest/v1/runs/${runId}/complete`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({}),
        });
        if (!completeRes.ok) {
          const errText = await completeRes.text();
          throw new Error(`Ingest complete failed: ${completeRes.status} ${errText}`);
        }
      }

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
        const job = await this._queue.getNextJob({ type: 'sync' });
        if (!job) {
          await sleep(this._pollMs);
          continue;
        }
        this._activeJobs++;
        this.processJob(job)
          .catch((e: unknown) => {
            logger.error({ err: e, jobId: job._id.toString(), job: 'sync-worker' }, 'job failed');
            getErrorReporter().captureException(e, {
              jobId: job._id.toString(),
              job: 'sync-worker',
            });
          })
          .finally(() => {
            this._activeJobs--;
          });
      } catch (err) {
        logger.error({ err, job: 'sync-worker' }, 'worker loop error');
        await sleep(this._pollMs * 2);
      }
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
