import { Notification, DeliveryResult, NotificationChannel } from '@scholaracle/contracts';

/**
 * Delivers notifications through various channels.
 *
 * Implementations:
 * - EmailDelivery (SendGrid)
 * - PushDelivery (Firebase Cloud Messaging)
 * - SMSDelivery (Twilio)
 */
export interface INotificationDelivery {
  /**
   * Check if this delivery service supports the given channel.
   *
   * @param channel - The notification channel to check
   * @returns True if this service can deliver via the channel
   */
  supports(channel: NotificationChannel): boolean;

  /**
   * Deliver a notification.
   *
   * @param notification - The notification to deliver
   * @returns Delivery result with success status and message ID
   * @throws {DeliveryError} If delivery fails
   */
  deliver(notification: Notification): Promise<DeliveryResult>;
}
