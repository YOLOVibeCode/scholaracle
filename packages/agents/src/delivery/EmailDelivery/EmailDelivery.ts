import { INotificationDelivery } from '@scholaracle/interfaces';
import {
  Notification,
  DeliveryResult,
  NotificationChannel,
  DeliveryError,
} from '@scholaracle/contracts';
import type { IEmailTransport, IEmailEnvelope } from './IEmailTransport';
import { buildBrandedEmail } from './emailTemplate';

export interface IEmailDeliveryConfig {
  readonly fromEmail: string;
  readonly fromName: string;
  readonly replyTo?: string;
  /** Base URL for dashboard links (e.g. https://app.scholarmancy.com). When set, immediate emails get a "View in Dashboard" button. */
  readonly dashboardBaseUrl?: string;
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
      const htmlBody = this._formatHtmlBody(
        notification.body,
        notification.subject,
        notification.studentId
      );
      const envelope: IEmailEnvelope = {
        to,
        from: {
          email: this._config.fromEmail,
          name: this._config.fromName,
        },
        ...(this._config.replyTo && { replyTo: this._config.replyTo }),
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

  private _formatHtmlBody(body: string, subject: string, studentId?: string): string {
    const escapedBody = body.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    let bodyHtml = escapedBody.replace(/\n/g, '<br>');
    const baseUrl = this._config.dashboardBaseUrl?.trim();
    if (baseUrl && studentId) {
      const path = `/dashboard/students/${encodeURIComponent(studentId)}/workflow`;
      const dashboardUrl = `${baseUrl.replace(/\/$/, '')}${path}`.replace(/"/g, '&quot;');
      bodyHtml += `<p style="margin-top:20px;"><a href="${dashboardUrl}" style="display:inline-block;padding:12px 20px;background:#2563eb;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:600;">View in Dashboard</a></p>`;
    }
    return buildBrandedEmail({ title: subject, bodyHtml });
  }
}
