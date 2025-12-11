import { Notification, Alert } from '@scholaracle/contracts';

/**
 * Schedules notifications for delivery at specific times.
 */
export interface INotificationScheduler {
  /**
   * Schedule a notification for delivery.
   * Requires the alert that generated the notification so the worker can process it.
   *
   * @param notification - The notification to schedule
   * @param alert - The alert that generated this notification
   * @returns Promise that resolves when scheduled
   * @throws {NotificationError} If scheduling fails
   */
  schedule(notification: Notification, alert: Alert): Promise<void>;

  /**
   * Cancel a scheduled notification.
   *
   * @param notificationId - The ID of the notification to cancel
   * @returns Promise that resolves when cancelled
   * @throws {NotificationError} If cancellation fails
   */
  cancel(notificationId: string): Promise<void>;
}
