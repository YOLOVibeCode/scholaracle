import { MongoQueue, type IJob } from '../../queue/MongoQueue';
import { NotificationService, type IResolvedRecipient } from '../../service/NotificationService';
import { Alert, AlertType, NotificationChannel } from '@scholaracle/contracts';

/** @deprecated Use resolveAllAlertRecipients. Resolved parent email/phone for delivery. */
export interface IResolvedRecipients {
  parentEmail?: string;
  parentPhone?: string;
}

export interface INotificationWorkerConfig {
  readonly pollIntervalMs?: number;
  readonly concurrency?: number;
  /** Resolve all alert recipients for a student (owner + accepted contacts). When set, worker calls this and passes array to processAlert. */
  readonly resolveAllAlertRecipients?: (
    studentId: string
  ) => Promise<readonly IResolvedRecipient[]>;
  /** @deprecated Use resolveAllAlertRecipients. Resolve parent userId to email/phone for delivery. */
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
  private readonly _resolveAllAlertRecipients?: (
    studentId: string
  ) => Promise<readonly IResolvedRecipient[]>;
  private readonly _resolveParentRecipients?: (userId: string) => Promise<IResolvedRecipients>;
  private _running = false;
  private _activeJobs = 0;
  private _notifyLoopPromise?: Promise<void>;
  private _deliverLoopPromise?: Promise<void>;

  constructor(
    queue: MongoQueue,
    notificationService: NotificationService,
    config: INotificationWorkerConfig = {}
  ) {
    this._queue = queue;
    this._notificationService = notificationService;
    this._pollIntervalMs = config.pollIntervalMs ?? 1000;
    this._concurrency = config.concurrency ?? 10;
    this._resolveAllAlertRecipients = config.resolveAllAlertRecipients;
    this._resolveParentRecipients = config.resolveParentRecipients;
  }

  /**
   * Start processing jobs from the queue.
   * Runs two loops: one for notify (generate + enqueue deliver), one for deliver (route only).
   */
  public start(): void {
    if (this._running) {
      return;
    }
    this._running = true;
    this._notifyLoopPromise = this._processLoop('notify');
    this._deliverLoopPromise = this._processLoop('deliver');
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

    if (this._notifyLoopPromise) await this._notifyLoopPromise;
    if (this._deliverLoopPromise) await this._deliverLoopPromise;
  }

  /**
   * Process a single job (notify or deliver).
   *
   * @param job - The job to process
   */
  public async processJob(job: IJob): Promise<void> {
    if (job.type === 'deliver') {
      await this._processDeliverJob(job);
      return;
    }
    await this._processNotifyJob(job);
  }

  private async _processNotifyJob(job: IJob): Promise<void> {
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

      let resolved: readonly IResolvedRecipient[] | undefined;
      if (this._resolveAllAlertRecipients) {
        try {
          resolved = await this._resolveAllAlertRecipients(alert.studentId);
        } catch (err) {
          console.error('Failed to resolve alert recipients:', err);
        }
      } else if (this._resolveParentRecipients) {
        const parentUserId = (alert as Alert & { userId?: string }).userId;
        if (parentUserId) {
          try {
            const one = await this._resolveParentRecipients(parentUserId);
            resolved = one.parentEmail || one.parentPhone ? [one] : undefined;
          } catch (err) {
            console.error('Failed to resolve parent recipients:', err);
          }
        }
      }

      try {
        await this._notificationService.processAlertEnqueueDeliver(alert, this._queue, resolved);
      } catch (enqueueError) {
        const msg = (enqueueError as Error).message ?? '';
        if (msg.includes('processAlertEnqueueDeliver requires agent-based')) {
          await this._notificationService.processAlert(alert, resolved);
        } else {
          throw enqueueError;
        }
      }
      await this._queue.complete(job._id.toString());
    } catch (error) {
      await this._queue.fail(job._id.toString(), error as Error);
    }
  }

  private async _processDeliverJob(job: IJob): Promise<void> {
    try {
      const payload = job.data[
        'notificationPayload'
      ] as import('@scholaracle/contracts').INotificationPayload;
      const channel = job.data['channel'] as NotificationChannel;
      if (!payload || channel == null) {
        throw new Error('Deliver job missing notificationPayload or channel');
      }
      await this._notificationService.deliverOne(payload, channel);
      await this._queue.complete(job._id.toString());
    } catch (error) {
      await this._queue.fail(job._id.toString(), error as Error);
    }
  }

  /**
   * Main processing loop for a single job type.
   */
  private async _processLoop(jobType: 'notify' | 'deliver'): Promise<void> {
    while (this._running) {
      try {
        if (this._activeJobs >= this._concurrency) {
          await this._sleep(this._pollIntervalMs);
          continue;
        }

        const job = await this._queue.getNextJob({ type: jobType });
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
