import type { Db, Collection } from 'mongodb';
import { MongoQueue } from '../../queue/MongoQueue';
import type { ISyncJobData } from '../../worker/SyncWorker';

// ---------------------------------------------------------------------------
// SyncScheduler — enqueues 'sync' jobs on a schedule or immediately.
// ---------------------------------------------------------------------------

export interface ISyncSchedulerConfig {
  /** How often the scheduler checks for due sources (default 60 000 ms = 1 min). */
  readonly tickIntervalMs?: number;
}

interface IScheduleRecord {
  readonly sourceId: string;
  readonly studentId: string;
  readonly dataSourceIndex: number;
  readonly userId: string;
  readonly provider: string;
  readonly adapterId: string;
  readonly baseUrl: string;
  readonly schedule: string; // 'hourly' | 'every_6h' | 'daily' | 'manual'
  readonly lastScheduledAt?: Date;
}

const SCHEDULE_MS: Record<string, number> = {
  hourly: 60 * 60_000,
  every_6h: 6 * 60 * 60_000,
  daily: 24 * 60 * 60_000,
};

/**
 * Periodically scans IngestSources + Students and enqueues sync jobs that are due.
 * Also exposes `triggerNow()` for immediate / manual runs.
 */
export class SyncScheduler {
  private readonly _queue: MongoQueue;
  private readonly _db: Db;
  private readonly _schedules: Collection<IScheduleRecord>;
  private readonly _tickMs: number;
  private _running = false;
  private _loopPromise?: Promise<void>;

  constructor(queue: MongoQueue, db: Db, config: ISyncSchedulerConfig = {}) {
    this._queue = queue;
    this._db = db;
    this._schedules = db.collection<IScheduleRecord>('sync_schedules');
    this._tickMs = config.tickIntervalMs ?? 60_000;
  }

  // -----------------------------------------------------------------------
  // Lifecycle
  // -----------------------------------------------------------------------

  public start(): void {
    if (this._running) return;
    this._running = true;
    this._loopPromise = this._loop();
    // eslint-disable-next-line no-console
    console.log('[SyncScheduler] started');
  }

  public async stop(): Promise<void> {
    if (!this._running) return;
    this._running = false;
    if (this._loopPromise) await this._loopPromise;
    // eslint-disable-next-line no-console
    console.log('[SyncScheduler] stopped');
  }

  // -----------------------------------------------------------------------
  // Public: trigger a sync immediately
  // -----------------------------------------------------------------------

  /**
   * Enqueue a sync job right now.
   * Returns the MongoQueue job ID.
   */
  public async triggerNow(params: {
    studentId: string;
    dataSourceIndex: number;
    provider: string;
    adapterId: string;
    baseUrl: string;
    userId: string;
  }): Promise<string> {
    const jobData: ISyncJobData = {
      studentId: params.studentId,
      dataSourceIndex: params.dataSourceIndex,
      provider: params.provider,
      adapterId: params.adapterId,
      baseUrl: params.baseUrl,
      trigger: 'manual',
      userId: params.userId,
    };

    const jobId = await this._queue.add(
      'sync',
      `sync-${params.provider}-${params.studentId}`,
      jobData as unknown as Record<string, unknown>,
      { priority: 1, maxAttempts: 2 }
    );

    // eslint-disable-next-line no-console
    console.log(
      `[SyncScheduler] manual sync enqueued: job=${jobId} student=${params.studentId} provider=${params.provider}`
    );
    return jobId;
  }

  /**
   * Trigger sync for every data source on a student.
   * Returns array of job IDs.
   */
  public async triggerAllForStudent(
    studentId: string,
    userId: string,
    dataSources: ReadonlyArray<{
      pluginId: string;
      config?: { institutionUrl?: string };
      enabled?: boolean;
    }>
  ): Promise<string[]> {
    const jobIds: string[] = [];
    for (let i = 0; i < dataSources.length; i++) {
      const ds = dataSources[i]!;
      if (ds.enabled === false) continue;
      const provider = ds.pluginId.split('::')[0] ?? ds.pluginId;
      const adapterId = ds.pluginId;
      const baseUrl = ds.config?.institutionUrl ?? '';
      const jid = await this.triggerNow({
        studentId,
        dataSourceIndex: i,
        provider,
        adapterId,
        baseUrl,
        userId,
      });
      jobIds.push(jid);
    }
    return jobIds;
  }

  // -----------------------------------------------------------------------
  // Scheduled: scan and enqueue due sources
  // -----------------------------------------------------------------------

  /**
   * One tick: find all IngestSources that are due and enqueue sync jobs.
   */
  public async tick(): Promise<number> {
    const now = new Date();
    let enqueued = 0;

    // Gather all enabled ingest sources
    const ingestSources = this._db.collection('ingestSources');
    const sources = await ingestSources.find({ enabled: true }).toArray();

    for (const src of sources) {
      const schedule = (src['schedule'] as string) ?? 'daily';
      if (schedule === 'manual') continue;

      const intervalMs = SCHEDULE_MS[schedule] ?? SCHEDULE_MS['daily']!;

      // Check if we already scheduled recently
      const existing = await this._schedules.findOne({ sourceId: src['sourceId'] as string });
      if (existing?.lastScheduledAt) {
        const elapsed = now.getTime() - existing.lastScheduledAt.getTime();
        if (elapsed < intervalMs) continue; // Not due yet
      }

      // Find the student that owns this source
      const students = this._db.collection('students');
      const student = await students.findOne({
        'dataSources.id': src['sourceId'],
        userId: src['userId'],
      });
      if (!student) continue;

      const dsIndex = ((student['dataSources'] as Array<{ id?: string }>) ?? []).findIndex(
        (d) => d.id === src['sourceId']
      );
      if (dsIndex < 0) continue;

      const jobData: ISyncJobData = {
        studentId: student['_id'].toString(),
        dataSourceIndex: dsIndex,
        provider: src['provider'] as string,
        adapterId: src['adapterId'] as string,
        baseUrl: (src['portalBaseUrl'] as string) ?? '',
        trigger: 'scheduled',
        userId: (src['userId'] as string | import('mongodb').ObjectId).toString(),
      };

      await this._queue.add(
        'sync',
        `sync-${jobData.provider}-${jobData.studentId}`,
        jobData as unknown as Record<string, unknown>,
        { priority: 5, maxAttempts: 2 }
      );

      // Upsert schedule record
      await this._schedules.updateOne(
        { sourceId: src['sourceId'] as string },
        {
          $set: {
            ...jobData,
            sourceId: src['sourceId'] as string,
            schedule,
            lastScheduledAt: now,
          },
        },
        { upsert: true }
      );

      enqueued++;
    }

    if (enqueued > 0) {
      // eslint-disable-next-line no-console
      console.log(`[SyncScheduler] tick: enqueued ${enqueued} sync jobs`);
    }
    return enqueued;
  }

  // -----------------------------------------------------------------------
  // Loop
  // -----------------------------------------------------------------------

  private async _loop(): Promise<void> {
    while (this._running) {
      try {
        await this.tick();
      } catch (err) {
        console.error('[SyncScheduler] tick error:', err);
      }
      await sleep(this._tickMs);
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
