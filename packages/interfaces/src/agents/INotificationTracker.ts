import { Notification } from '@scholaracle/contracts';

export interface IEngagementStats {
  readonly notificationId: string;
  readonly sentAt?: Date;
  readonly deliveredAt?: Date;
  readonly openedAt?: Date;
  readonly actionTakenAt?: Date;
  readonly engagementRate: number;
}

/**
 * Tracks notification engagement and delivery status.
 */
export interface INotificationTracker {
  /**
   * Record that a notification was sent.
   *
   * @param notification - The notification that was sent
   */
  recordSent(notification: Notification): Promise<void>;

  /**
   * Record that a notification was delivered.
   *
   * @param notificationId - The ID of the delivered notification
   */
  recordDelivered(notificationId: string): Promise<void>;

  /**
   * Record that a notification was opened.
   *
   * @param notificationId - The ID of the opened notification
   */
  recordOpened(notificationId: string): Promise<void>;

  /**
   * Record that action was taken on a notification.
   *
   * @param notificationId - The ID of the notification
   */
  recordActionTaken(notificationId: string): Promise<void>;

  /**
   * Get engagement statistics for a notification.
   *
   * @param notificationId - The ID of the notification
   * @returns Engagement statistics
   */
  getEngagementStats(notificationId: string): Promise<IEngagementStats>;
}
