import { MongoQueue, type IJob } from '../../queue/MongoQueue';
import { NotificationService } from '../../service/NotificationService';
import { Alert, AlertType } from '@scholaracle/contracts';

/** Resolved parent email/phone for delivery (matches IResolvedRecipients from NotificationService). */
export interface IResolvedRecipients {
  parentEmail?: string;
  parentPhone?: string;
}

export interface INotificationWorkerConfig {
  readonly pollIntervalMs?: number;
  readonly concurrency?: number;
  /** Resolve parent userId to email/phone for delivery. When set, worker calls this before processAlert and passes result. */
  readonly resolveParentRecipients?: (userId: string) => Promise<IResolvedRecipients>;
}

/**
 * Worker that processes notification jobs from MongoDB queue.
 * Polls for jobs and processes them using NotificationService.
 */
export class NotificationWorker {
  private readonly _queue: MongoQueue;
  private readonly _notificationService: NotificationService;
  private readonly _pollIntervalMs: number;
  private readonly _concurrency: number;
  private readonly _resolveParentRecipients?: (userId: string) => Promise<IResolvedRecipients>;
  private _running = false;
  private _activeJobs = 0;
  private _processingLoopPromise?: Promise<void>;

  constructor(
    queue: MongoQueue,
    notificationService: NotificationService,
    config: INotificationWorkerConfig = {}
  ) {
    this._queue = queue;
    this._notificationService = notificationService;
    this._pollIntervalMs = config.pollIntervalMs ?? 1000;
    this._concurrency = config.concurrency ?? 10;
    this._resolveParentRecipients = config.resolveParentRecipients;
  }

  /**
   * Start processing jobs from the queue.
   */
  public start(): void {
    if (this._running) {
      return;
    }

    this._running = true;
    this._processingLoopPromise = this._processLoop();
  }

  /**
   * Stop processing jobs.
   * Waits for active jobs to complete before stopping.
   */
  public async stop(): Promise<void> {
    if (!this._running) {
      return;
    }

    this._running = false;

    // Wait for active jobs to complete
    while (this._activeJobs > 0) {
      await this._sleep(100);
    }

    // Wait for processing loop to finish
    if (this._processingLoopPromise) {
      await this._processingLoopPromise;
    }
  }

  /**
   * Process a single job.
   *
   * @param job - The job to process
   */
  public async processJob(job: IJob): Promise<void> {
    try {
      const alertData = job.data['alert'] as {
        studentId: string;
        type: string;
        severity: string;
        relatedData: Record<string, unknown>;
        userId?: string;
      };

      if (!alertData) {
        throw new Error('Job data missing alert');
      }

      const alert = new Alert({
        studentId: alertData.studentId,
        type: alertData.type as AlertType,
        severity: alertData.severity,
        relatedData: alertData.relatedData,
        ...(alertData.userId != null && { userId: alertData.userId }),
      });

      let resolved: IResolvedRecipients | undefined;
      const parentUserId = (alert as Alert & { userId?: string }).userId;
      if (parentUserId && this._resolveParentRecipients) {
        try {
          resolved = await this._resolveParentRecipients(parentUserId);
        } catch (err) {
          console.error('Failed to resolve parent recipients:', err);
        }
      }
      await this._notificationService.processAlert(alert, resolved);

      await this._queue.complete(job._id.toString());
    } catch (error) {
      await this._queue.fail(job._id.toString(), error as Error);
    }
  }

  /**
   * Main processing loop.
   * Continuously polls for jobs and processes them.
   */
  private async _processLoop(): Promise<void> {
    while (this._running) {
      try {
        if (this._activeJobs >= this._concurrency) {
          await this._sleep(this._pollIntervalMs);
          continue;
        }

        const job = await this._queue.getNextJob();

        if (!job) {
          await this._sleep(this._pollIntervalMs);
          continue;
        }

        this._activeJobs++;
        this.processJob(job)
          .catch((error) => {
            console.error('Error processing job:', error);
          })
          .finally(() => {
            this._activeJobs--;
          });
      } catch (error) {
        console.error('Error in processing loop:', error);
        await this._sleep(this._pollIntervalMs * 2);
      }
    }
  }

  /**
   * Sleep for specified milliseconds.
   *
   * @param ms - Milliseconds to sleep
   */
  private _sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
