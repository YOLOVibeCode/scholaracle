import { Alert, Notification } from '@scholaracle/contracts';

/**
 * Generates notifications from alerts.
 *
 * Implementations:
 * - StudentNotificationGenerator (casual, direct messaging)
 * - ParentNotificationGenerator (detailed, contextual messaging)
 */
export interface INotificationGenerator {
  /**
   * Generate a notification from an alert.
   *
   * @param alert - The alert that triggered this notification
   * @returns A notification ready for delivery
   * @throws {NotificationError} If alert is invalid
   */
  generate(alert: Alert): Notification;
}
