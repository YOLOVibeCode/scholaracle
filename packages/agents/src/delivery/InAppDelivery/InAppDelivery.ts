import { INotificationDelivery } from '@scholaracle/interfaces';
import { Notification, DeliveryResult, NotificationChannel } from '@scholaracle/contracts';

/**
 * In-app notification delivery service (no-op).
 * In-app notifications are handled by the frontend, so this is just a placeholder.
 * Implements INotificationDelivery for in_app channel.
 */
export class InAppDelivery implements INotificationDelivery {
  /**
   * Check if this delivery service supports the given channel.
   *
   * @param channel - The notification channel to check
   * @returns True if this service can deliver via the channel
   */
  public supports(channel: NotificationChannel): boolean {
    return channel === NotificationChannel.IN_APP;
  }

  /**
   * Deliver a notification via in-app (no-op, handled by frontend).
   *
   * @param notification - The notification to deliver
   * @returns Delivery result with success status
   */
  public async deliver(notification: Notification): Promise<DeliveryResult> {
    // In-app notifications are handled by the frontend
    // This is just a placeholder that returns success
    return Promise.resolve({
      success: true,
      channel: NotificationChannel.IN_APP,
      messageId: `in-app-${notification.id}`,
      deliveredAt: new Date(),
    });
  }
}
