import { INotificationDelivery } from '@scholaracle/interfaces';
import {
  Notification,
  DeliveryResult,
  NotificationChannel,
  DeliveryError,
} from '@scholaracle/contracts';
import type { IEmailTransport, IEmailEnvelope } from './IEmailTransport';

export interface IEmailDeliveryConfig {
  readonly fromEmail: string;
  readonly fromName: string;
}

/**
 * Email delivery service. Implements INotificationDelivery for email channel.
 * Depends on IEmailTransport (ISP) so SendGrid or SMTP can be swapped.
 */
export class EmailDelivery implements INotificationDelivery {
  constructor(
    private readonly _config: IEmailDeliveryConfig,
    private readonly _transport: IEmailTransport
  ) {}

  public supports(channel: NotificationChannel): boolean {
    return channel === NotificationChannel.EMAIL;
  }

  public async deliver(notification: Notification): Promise<DeliveryResult> {
    const to = notification.userId?.trim();
    if (!to || !to.includes('@')) {
      return {
        success: false,
        channel: NotificationChannel.EMAIL,
        error: 'No recipients defined',
      };
    }

    try {
      const htmlBody = this._formatHtmlBody(notification.body);
      const envelope: IEmailEnvelope = {
        to,
        from: {
          email: this._config.fromEmail,
          name: this._config.fromName,
        },
        subject: notification.subject,
        text: notification.body,
        html: htmlBody,
      };

      const result = await this._transport.send(envelope);

      return {
        success: true,
        channel: NotificationChannel.EMAIL,
        messageId: result.messageId,
        deliveredAt: new Date(),
      };
    } catch (error) {
      if (error instanceof DeliveryError) {
        throw error;
      }
      throw this._createDeliveryError(error, notification.id);
    }
  }

  private _createDeliveryError(error: unknown, notificationId: string): DeliveryError {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error occurred during email delivery';
    const errorContext = this._extractErrorContext(error);
    return new DeliveryError(
      `Failed to deliver email: ${errorMessage}`,
      NotificationChannel.EMAIL,
      { notificationId, ...errorContext }
    );
  }

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
