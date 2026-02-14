import { INotificationScheduler } from '@scholaracle/interfaces';
import {
  Notification,
  NotificationPriority,
  NotificationError,
  Alert,
} from '@scholaracle/contracts';
import { MongoQueue } from '../../queue/MongoQueue';

/**
 * Schedules notifications for delivery using MongoDB queue.
 * Implements INotificationScheduler interface.
 */
export class NotificationScheduler implements INotificationScheduler {
  private readonly _queue: MongoQueue;

  constructor(queue: MongoQueue) {
    this._queue = queue;
  }

  /**
   * Schedule a notification for delivery.
   * Requires the alert that generated the notification so the worker can process it.
   *
   * @param notification - The notification to schedule
   * @param alert - The alert that generated this notification
   * @returns Promise that resolves when scheduled
   * @throws {NotificationError} If scheduling fails
   */
  public async schedule(notification: Notification, alert: Alert): Promise<void> {
    try {
      const delay = this._calculateDelay(notification.scheduledFor);
      const priority = this._mapPriorityToJobPriority(notification.priority);

      await this._queue.add(
        'notify',
        'deliver-notification',
        {
          alert: {
            studentId: alert.studentId,
            type: alert.type,
            severity: alert.severity,
            relatedData: alert.relatedData,
            ...(alert.userId != null && { userId: alert.userId }),
          },
        },
        {
          delay,
          priority,
          maxAttempts: 5,
        }
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : 'Unknown error occurred during notification scheduling';

      throw new NotificationError(
        `Failed to schedule notification: ${errorMessage}`,
        'SCHEDULING_FAILED',
        {
          notificationId: notification.id,
        }
      );
    }
  }

  /**
   * Cancel a scheduled notification.
   *
   * @param notificationId - The ID of the notification to cancel
   * @returns Promise that resolves when cancelled
   * @throws {NotificationError} If cancellation fails
   */
  public async cancel(notificationId: string): Promise<void> {
    try {
      const isCancelled = await this._queue.cancel(notificationId);

      if (!isCancelled) {
        throw new NotificationError(
          `Notification not found or already processed: ${notificationId}`,
          'NOTIFICATION_NOT_FOUND',
          {
            notificationId,
          }
        );
      }
    } catch (error) {
      if (error instanceof NotificationError) {
        throw error;
      }

      const errorMessage =
        error instanceof Error
          ? error.message
          : 'Unknown error occurred during notification cancellation';

      throw new NotificationError(
        `Failed to cancel notification: ${errorMessage}`,
        'CANCELLATION_FAILED',
        {
          notificationId,
        }
      );
    }
  }

  /**
   * Calculate delay in milliseconds until scheduled time.
   *
   * @param scheduledFor - Scheduled delivery time
   * @returns Delay in milliseconds (0 if in the past or now)
   */
  private _calculateDelay(scheduledFor: Date): number {
    const now = Date.now();
    const scheduledTime = scheduledFor.getTime();
    const delay = scheduledTime - now;

    return Math.max(0, delay);
  }

  /**
   * Map notification priority to job priority.
   * Lower number = higher priority in queue.
   *
   * @param priority - Notification priority
   * @returns Job priority number
   */
  private _mapPriorityToJobPriority(priority: NotificationPriority): number {
    switch (priority) {
      case NotificationPriority.CRITICAL:
        return 0;
      case NotificationPriority.HIGH:
        return 5;
      case NotificationPriority.MEDIUM:
        return 10;
      case NotificationPriority.LOW:
        return 15;
    }
  }
}
