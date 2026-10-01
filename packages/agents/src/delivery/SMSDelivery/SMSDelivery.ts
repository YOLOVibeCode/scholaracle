import { INotificationDelivery } from '@scholaracle/interfaces';
import {
  Notification,
  DeliveryResult,
  NotificationChannel,
  DeliveryError,
} from '@scholaracle/contracts';
import type { GuardedSmsSender } from '../../sms/GuardedSmsSender';

/**
 * SMS delivery via GuardedSmsSender (Noctusoft relay, consent-gated).
 */
export class SMSDelivery implements INotificationDelivery {
  constructor(private readonly _guarded: GuardedSmsSender) {}

  public supports(channel: NotificationChannel): boolean {
    return channel === NotificationChannel.SMS;
  }

  public async deliver(notification: Notification): Promise<DeliveryResult> {
    try {
      const smsBody = this._formatSmsBody(notification.subject, notification.body);
      const result = await this._guarded.sendTransactional(notification.userId, smsBody, {
        userId: notification.userId,
        subject: notification.subject,
        templateName: 'notification',
        triggeredBy: 'system',
      });
      return {
        success: true,
        channel: NotificationChannel.SMS,
        messageId: result.messageId,
        deliveredAt: new Date(),
      };
    } catch (error) {
      if (error instanceof DeliveryError) {
        throw error;
      }
      throw new DeliveryError(
        error instanceof Error ? error.message : 'Unknown SMS error',
        NotificationChannel.SMS,
        { notificationId: notification.id }
      );
    }
  }

  private _formatSmsBody(subject: string, body: string): string {
    if (!subject.trim()) {
      return body;
    }
    return `${subject}\n\n${body}`;
  }
}
