import { INotificationDelivery } from '@scholaracle/interfaces';
import {
  Notification,
  DeliveryResult,
  NotificationChannel,
  DeliveryError,
} from '@scholaracle/contracts';
import type { MailService } from '@sendgrid/mail';

export interface IEmailDeliveryConfig {
  readonly apiKey: string;
  readonly fromEmail: string;
  readonly fromName: string;
}

/**
 * Email delivery service using SendGrid.
 * Implements INotificationDelivery for email channel.
 */
export class EmailDelivery implements INotificationDelivery {
  private readonly _config: IEmailDeliveryConfig;
  private readonly _sendGrid: MailService;

  constructor(config: IEmailDeliveryConfig, sendGrid: MailService) {
    this._config = config;
    this._sendGrid = sendGrid;
    this._sendGrid.setApiKey(config.apiKey);
  }

  /**
   * Check if this delivery service supports the given channel.
   *
   * @param channel - The notification channel to check
   * @returns True if this service can deliver via the channel
   */
  public supports(channel: NotificationChannel): boolean {
    return channel === NotificationChannel.EMAIL;
  }

  /**
   * Deliver a notification via email.
   *
   * @param notification - The notification to deliver
   * @returns Delivery result with success status and message ID
   * @throws {DeliveryError} If delivery fails
   */
  public async deliver(notification: Notification): Promise<DeliveryResult> {
    try {
      const htmlBody = this._formatHtmlBody(notification.body);
      const [response] = await this._sendGrid.send({
        to: notification.userId,
        from: {
          email: this._config.fromEmail,
          name: this._config.fromName,
        },
        subject: notification.subject,
        text: notification.body,
        html: htmlBody,
      });

      this._validateResponse(response, notification.id);

      const messageId = this._extractMessageId(response);

      return {
        success: true,
        channel: NotificationChannel.EMAIL,
        messageId,
        deliveredAt: new Date(),
      };
    } catch (error) {
      if (error instanceof DeliveryError) {
        throw error;
      }

      throw this._createDeliveryError(error, notification.id);
    }
  }

  /**
   * Validate SendGrid response status code.
   *
   * @param response - SendGrid response
   * @param notificationId - Notification ID for error context
   * @throws {DeliveryError} If status code is not 202
   */
  private _validateResponse(
    response: { statusCode: number; body: unknown },
    notificationId: string
  ): void {
    if (response.statusCode !== 202) {
      throw new DeliveryError(
        `SendGrid returned status ${response.statusCode}`,
        NotificationChannel.EMAIL,
        {
          statusCode: response.statusCode,
          body: response.body,
          notificationId,
        }
      );
    }
  }

  /**
   * Extract message ID from SendGrid response.
   *
   * @param response - SendGrid response
   * @returns Message ID or undefined
   */
  private _extractMessageId(response: { body: unknown }): string | undefined {
    if (
      typeof response.body === 'object' &&
      response.body !== null &&
      'message_id' in response.body
    ) {
      return String(response.body.message_id);
    }

    return undefined;
  }

  /**
   * Create DeliveryError from unknown error.
   *
   * @param error - Unknown error
   * @param notificationId - Notification ID for error context
   * @returns DeliveryError instance
   */
  private _createDeliveryError(error: unknown, notificationId: string): DeliveryError {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error occurred during email delivery';

    const errorContext = this._extractErrorContext(error);

    return new DeliveryError(
      `Failed to deliver email: ${errorMessage}`,
      NotificationChannel.EMAIL,
      {
        notificationId,
        ...errorContext,
      }
    );
  }

  /**
   * Extract error context from SendGrid error.
   *
   * @param error - Unknown error
   * @returns Error context or undefined
   */
  private _extractErrorContext(error: unknown): Record<string, unknown> | undefined {
    if (
      error &&
      typeof error === 'object' &&
      'response' in error &&
      typeof error.response === 'object' &&
      error.response !== null
    ) {
      return {
        status: 'status' in error.response ? error.response.status : undefined,
        body: 'body' in error.response ? error.response.body : undefined,
      };
    }

    return undefined;
  }

  /**
   * Format plain text body as HTML.
   * Converts newlines to <br> tags and wraps in basic HTML structure.
   *
   * @param body - Plain text body
   * @returns HTML formatted body
   */
  private _formatHtmlBody(body: string): string {
    const escapedBody = body.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const htmlBody = escapedBody.replace(/\n/g, '<br>');

    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
  </style>
</head>
<body>
  <div class="container">
    ${htmlBody}
  </div>
</body>
</html>`.trim();
  }
}
