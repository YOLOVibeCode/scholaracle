import { INotificationDelivery } from '@scholaracle/interfaces';
import {
  Notification,
  DeliveryResult,
  NotificationChannel,
  DeliveryError,
} from '@scholaracle/contracts';
import type { GuardedSmsSender } from '../../sms/GuardedSmsSender';
import { buildAlertSmsBody } from '../../sms/alertSmsTemplates';

export interface ISmsDeliveryOptions {
  /** Web origin for the details link; defaults to BASE_URL, then https://scholarmancy.com. */
  readonly webOrigin?: string;
}

function resolveWebOrigin(): string {
  return (
    process.env['BASE_URL'] ||
    process.env['WEB_URL'] ||
    process.env['NEXT_PUBLIC_APP_URL'] ||
    'https://scholarmancy.com'
  );
}

/**
 * SMS delivery via GuardedSmsSender (Noctusoft relay, consent-gated). Texts use their own
 * one-segment GSM-7 templates (sms/alertSmsTemplates), never the email body.
 */
export class SMSDelivery implements INotificationDelivery {
  private readonly _webOrigin: string;

  constructor(
    private readonly _guarded: GuardedSmsSender,
    options: ISmsDeliveryOptions = {}
  ) {
    this._webOrigin = options.webOrigin ?? resolveWebOrigin();
  }

  public supports(channel: NotificationChannel): boolean {
    return channel === NotificationChannel.SMS;
  }

  public async deliver(notification: Notification): Promise<DeliveryResult> {
    try {
      const smsBody = buildAlertSmsBody(
        {
          triggerType: notification.triggerType,
          triggerData: notification.triggerData,
          subject: notification.subject,
        },
        this._webOrigin
      );
      const result = await this._guarded.sendTransactional(notification.userId, smsBody, {
        userId: notification.userId,
        subject: notification.subject,
        templateName: `sms_${notification.triggerType}`,
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
}
