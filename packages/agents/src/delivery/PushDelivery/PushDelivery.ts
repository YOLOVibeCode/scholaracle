import { INotificationDelivery } from '@scholaracle/interfaces';
import {
  Notification,
  DeliveryResult,
  NotificationChannel,
  DeliveryError,
  NotificationPriority,
} from '@scholaracle/contracts';
import type { messaging } from 'firebase-admin';

export interface IPushDeliveryConfig {
  readonly projectId: string;
}

/**
 * Push notification delivery service using Firebase Cloud Messaging (FCM).
 * Implements INotificationDelivery for push channel.
 *
 * @deprecated Push notifications are not yet implemented. Use EmailDelivery or SMSDelivery instead.
 */
export class PushDelivery implements INotificationDelivery {
  private readonly _fcm: messaging.Messaging;

  constructor(_config: IPushDeliveryConfig, fcm: messaging.Messaging) {
    this._fcm = fcm;
  }

  /**
   * Check if this delivery service supports the given channel.
   *
   * @param channel - The notification channel to check
   * @returns True if this service can deliver via the channel
   */
  public supports(channel: NotificationChannel): boolean {
    return channel === NotificationChannel.PUSH;
  }

  /**
   * Deliver a notification via push.
   *
   * @param notification - The notification to deliver
   * @returns Delivery result with success status and message ID
   * @throws {DeliveryError} If delivery fails
   */
  public async deliver(notification: Notification): Promise<DeliveryResult> {
    try {
      const message = this._buildFcmMessage(notification);

      const messageId = await this._fcm.send(message);

      return {
        success: true,
        channel: NotificationChannel.PUSH,
        messageId,
        deliveredAt: new Date(),
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error occurred during push delivery';

      throw new DeliveryError(
        `Failed to deliver push notification: ${errorMessage}`,
        NotificationChannel.PUSH,
        {
          notificationId: notification.id,
          error: errorMessage,
        }
      );
    }
  }

  /**
   * Build FCM message from notification.
   *
   * @param notification - The notification to convert
   * @returns FCM message object
   */
  private _buildFcmMessage(notification: Notification): messaging.Message {
    const isHighPriority =
      notification.priority === NotificationPriority.HIGH ||
      notification.priority === NotificationPriority.CRITICAL;

    const data: Record<string, string> = {
      notificationId: notification.id,
      studentId: notification.studentId,
      agentType: notification.agentType,
      triggerType: notification.triggerType,
    };

    if (notification.triggerData) {
      data['triggerData'] = JSON.stringify(notification.triggerData);
    }

    return {
      token: notification.userId,
      notification: {
        title: notification.subject,
        body: notification.body,
      },
      data,
      android: {
        priority: isHighPriority ? 'high' : 'normal',
      },
      apns: {
        headers: {
          'apns-priority': isHighPriority ? '10' : '5',
        },
      },
    };
  }
}
