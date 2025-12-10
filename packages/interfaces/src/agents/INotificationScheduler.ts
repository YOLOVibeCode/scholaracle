import { Notification } from '@scholaracle/contracts';

/**
 * Schedules notifications for delivery at specific times.
 */
export interface INotificationScheduler {
  /**
   * Schedule a notification for delivery.
   *
   * @param notification - The notification to schedule
   * @returns Promise that resolves when scheduled
   * @throws {NotificationError} If scheduling fails
   */
  schedule(notification: Notification): Promise<void>;

  /**
   * Cancel a scheduled notification.
   *
   * @param notificationId - The ID of the notification to cancel
   * @returns Promise that resolves when cancelled
   * @throws {NotificationError} If cancellation fails
   */
  cancel(notificationId: string): Promise<void>;
}
