import { INotificationDelivery } from '@scholaracle/interfaces';
import {
  Notification,
  DeliveryResult,
  NotificationChannel,
  DeliveryError,
} from '@scholaracle/contracts';
import type { Twilio } from 'twilio';

export interface ISMSDeliveryConfig {
  readonly accountSid: string;
  readonly authToken: string;
  readonly fromNumber: string;
}

const MAX_SMS_LENGTH = 1600;

/**
 * SMS delivery service using Twilio.
 * Implements INotificationDelivery for SMS channel.
 */
export class SMSDelivery implements INotificationDelivery {
  private readonly _config: ISMSDeliveryConfig;
  private readonly _twilio: Twilio;

  constructor(config: ISMSDeliveryConfig, twilio: Twilio) {
    this._config = config;
    this._twilio = twilio;
  }

  /**
   * Check if this delivery service supports the given channel.
   *
   * @param channel - The notification channel to check
   * @returns True if this service can deliver via the channel
   */
  public supports(channel: NotificationChannel): boolean {
    return channel === NotificationChannel.SMS;
  }

  /**
   * Deliver a notification via SMS.
   *
   * @param notification - The notification to deliver
   * @returns Delivery result with success status and message ID
   * @throws {DeliveryError} If delivery fails
   */
  public async deliver(notification: Notification): Promise<DeliveryResult> {
    try {
      const smsBody = this._formatSmsBody(notification.subject, notification.body);

      const message = await this._twilio.messages.create({
        to: notification.userId,
        from: this._config.fromNumber,
        body: smsBody,
      });

      return {
        success: true,
        channel: NotificationChannel.SMS,
        messageId: message.sid,
        deliveredAt: new Date(),
      };
    } catch (error) {
      throw this._createDeliveryError(error, notification.id);
    }
  }

  /**
   * Create DeliveryError from unknown error.
   *
   * @param error - Unknown error
   * @param notificationId - Notification ID for error context
   * @returns DeliveryError instance
   */
  private _createDeliveryError(error: unknown, notificationId: string): DeliveryError {
    const errorMessage = this._extractErrorMessage(error);
    const errorCode = this._extractErrorCode(error);

    return new DeliveryError(`Failed to deliver SMS: ${errorMessage}`, NotificationChannel.SMS, {
      notificationId,
      errorCode,
      errorMessage,
    });
  }

  /**
   * Extract error message from unknown error.
   *
   * @param error - Unknown error
   * @returns Error message string
   */
  private _extractErrorMessage(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }

    if (
      error &&
      typeof error === 'object' &&
      'message' in error &&
      typeof error.message === 'string'
    ) {
      return error.message;
    }

    return 'Unknown error occurred during SMS delivery';
  }

  /**
   * Extract error code from unknown error.
   *
   * @param error - Unknown error
   * @returns Error code or undefined
   */
  private _extractErrorCode(error: unknown): number | undefined {
    if (error && typeof error === 'object' && 'code' in error && typeof error.code === 'number') {
      return error.code;
    }

    return undefined;
  }

  /**
   * Format SMS body from notification subject and body.
   * Truncates if exceeds SMS length limit.
   *
   * @param subject - Notification subject
   * @param body - Notification body
   * @returns Formatted SMS body
   */
  private _formatSmsBody(subject: string, body: string): string {
    const fullBody = `${subject}\n\n${body}`;

    if (fullBody.length <= MAX_SMS_LENGTH) {
      return fullBody;
    }

    const truncatedBody = body.substring(0, MAX_SMS_LENGTH - subject.length - 10);
    return `${subject}\n\n${truncatedBody}...`;
  }
}
