import type { Db, Collection, ObjectId, Document } from 'mongodb';
import { ObjectId as MongoObjectId } from 'mongodb';

export interface IJobData {
  readonly type: string;
  readonly name: string;
  readonly data: Record<string, unknown>;
  readonly scheduledFor?: Date;
  readonly priority?: number;
  readonly maxAttempts?: number;
}

export interface IJobOptions {
  readonly priority?: number;
  readonly delay?: number;
  readonly maxAttempts?: number;
}

export interface IJob {
  readonly _id: ObjectId;
  readonly type: string;
  readonly name: string;
  readonly data: Record<string, unknown>;
  readonly scheduledFor: Date;
  readonly priority: number;
  readonly status: 'pending' | 'processing' | 'completed' | 'failed';
  readonly attempts: number;
  readonly maxAttempts: number;
  readonly lockedAt?: Date;
  readonly lockedBy?: string;
  readonly processingStartedAt?: Date;
  readonly completedAt?: Date;
  readonly lastError?: string;
  readonly failedAt?: Date;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface IQueueStats {
  readonly pending: number;
  readonly processing: number;
  readonly completed: number;
  readonly failed: number;
}

export interface IGetNextJobOptions {
  /** When set, only claim jobs of this type (e.g. 'notify', 'sync'). */
  readonly type?: string;
}

/**
 * MongoDB-based job queue implementation.
 * Provides atomic job claiming, retry logic, and stalled job detection.
 */
export class MongoQueue {
  private readonly _jobs: Collection<IJob>;
  private readonly _workerId: string;

  constructor(db: Db) {
    this._jobs = db.collection<IJob>('jobs');
    this._workerId = `worker-${process.pid}-${Date.now()}`;

    // Ensure indexes exist (non-blocking)
    this._ensureIndexes().catch((error) => {
      console.error('Failed to create indexes:', error);
    });
  }

  /**
   * Add a job to the queue.
   *
   * @param type - Job type (e.g., 'notify', 'scrape')
   * @param name - Job name (e.g., 'deliver-notification')
   * @param data - Job data payload
   * @param options - Job options (priority, delay, maxAttempts)
   * @returns Job ID
   */
  public async add(
    type: string,
    name: string,
    data: Record<string, unknown>,
    options: IJobOptions = {}
  ): Promise<string> {
    const scheduledFor = options.delay ? new Date(Date.now() + options.delay) : new Date();

    const result = await this._jobs.insertOne({
      type,
      name,
      data,
      scheduledFor,
      priority: options.priority ?? 10,
      status: 'pending',
      attempts: 0,
      maxAttempts: options.maxAttempts ?? 5,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as IJob);

    return result.insertedId.toString();
  }

  /**
   * Claim and return next job to process (atomic operation).
   * Only returns jobs that are scheduled for now or earlier.
   * When options.type is set, only claims jobs of that type.
   *
   * @param options - Optional filter: type (e.g. 'notify', 'sync')
   * @returns Next job or null if none available
   */
  public async getNextJob(options?: IGetNextJobOptions): Promise<IJob | null> {
    const now = new Date();
    const filter: Record<string, unknown> = {
      status: 'pending',
      scheduledFor: { $lte: now },
    };
    if (options?.type != null) {
      filter['type'] = options.type;
    }

    const result = await this._jobs.findOneAndUpdate(
      filter,
      {
        $set: {
          status: 'processing',
          lockedAt: now,
          lockedBy: this._workerId,
          processingStartedAt: now,
          updatedAt: now,
        },
      },
      {
        sort: {
          priority: 1,
          scheduledFor: 1,
        },
        returnDocument: 'after',
      }
    );

    if (!result) return null;

    // MongoDB driver can return either:
    // - ModifyResult<T> (with .value) when includeResultMetadata=true
    // - WithId<T> | null (document directly) when includeResultMetadata=false
    const asAny = result as unknown as { value?: IJob | null };
    if ('value' in asAny) {
      return (asAny.value ?? null) as IJob | null;
    }

    return result as unknown as IJob;
  }

  /**
   * Mark job as completed.
   *
   * @param jobId - Job ID to complete
   */
  public async complete(jobId: string): Promise<void> {
    await this._jobs.updateOne(
      { _id: new MongoObjectId(jobId) },
      {
        $set: {
          status: 'completed',
          completedAt: new Date(),
          updatedAt: new Date(),
        },
        $unset: {
          lockedAt: '',
          lockedBy: '',
        },
      }
    );
  }

  /**
   * Mark job as failed and retry or move to failed.
   *
   * @param jobId - Job ID to fail
   * @param error - Error that caused failure
   */
  public async fail(jobId: string, error: Error): Promise<void> {
    const job = await this._jobs.findOne({ _id: new MongoObjectId(jobId) });

    if (!job) {
      throw new Error(`Job ${jobId} not found`);
    }

    const attempts = job.attempts + 1;
    const objectId = new MongoObjectId(jobId);

    if (attempts >= job.maxAttempts) {
      await this._jobs.updateOne(
        { _id: objectId },
        {
          $set: {
            status: 'failed',
            attempts,
            lastError: error.message,
            failedAt: new Date(),
            updatedAt: new Date(),
          },
          $unset: {
            lockedAt: '',
            lockedBy: '',
          },
        }
      );
    } else {
      const delay = Math.pow(2, attempts) * 2000;

      await this._jobs.updateOne(
        { _id: objectId },
        {
          $set: {
            status: 'pending',
            attempts,
            lastError: error.message,
            scheduledFor: new Date(Date.now() + delay),
            updatedAt: new Date(),
          },
          $unset: {
            lockedAt: '',
            lockedBy: '',
            processingStartedAt: '',
          },
        }
      );
    }
  }

  /**
   * Detect and reset stalled jobs (jobs locked but not processed).
   *
   * @returns Number of stalled jobs reset
   */
  public async resetStalledJobs(): Promise<number> {
    const stalledThreshold = new Date(Date.now() - 300000);

    const result = await this._jobs.updateMany(
      {
        status: 'processing',
        lockedAt: { $lt: stalledThreshold },
      },
      {
        $set: {
          status: 'pending',
          updatedAt: new Date(),
        },
        $unset: {
          lockedAt: '',
          lockedBy: '',
          processingStartedAt: '',
        },
        $inc: {
          attempts: 1,
        },
      }
    );

    return result.modifiedCount;
  }

  /**
   * Get queue statistics.
   *
   * @returns Queue statistics by status
   */
  public async getStats(): Promise<IQueueStats> {
    const stats = await this._jobs
      .aggregate([
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 },
          },
        },
      ])
      .toArray();

    const statsMap = new Map(
      stats.map((s: Document) => [s['_id'] as string, s['count'] as number])
    );

    return {
      pending: statsMap.get('pending') ?? 0,
      processing: statsMap.get('processing') ?? 0,
      completed: statsMap.get('completed') ?? 0,
      failed: statsMap.get('failed') ?? 0,
    };
  }

  /**
   * Cancel a job by notification ID.
   * Only cancels pending jobs (not processing or completed).
   *
   * @param notificationId - Notification ID to cancel
   * @returns True if job was found and cancelled, false otherwise
   */
  public async cancel(notificationId: string): Promise<boolean> {
    const result = await this._jobs.deleteOne({
      status: 'pending',
      'data.notificationId': notificationId,
    });

    return result.deletedCount > 0;
  }

  /**
   * Clean up old completed jobs.
   *
   * @param olderThanHours - Delete jobs older than this many hours
   * @returns Number of jobs deleted
   */
  public async cleanup(olderThanHours: number = 24): Promise<number> {
    const threshold = new Date(Date.now() - olderThanHours * 60 * 60 * 1000);

    const result = await this._jobs.deleteMany({
      status: 'completed',
      completedAt: { $lt: threshold },
    });

    return result.deletedCount;
  }

  /**
   * Ensure required indexes exist for performance.
   */
  private async _ensureIndexes(): Promise<void> {
    await this._jobs.createIndex({ status: 1, priority: 1, scheduledFor: 1 });
    await this._jobs.createIndex({ status: 1, lockedAt: 1 });
    await this._jobs.createIndex({ type: 1, status: 1 });

    await this._jobs.createIndex({ completedAt: 1 }, { expireAfterSeconds: 86400 });
  }
}
