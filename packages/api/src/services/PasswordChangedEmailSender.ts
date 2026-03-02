import type { MailService } from '@sendgrid/mail';
import { buildBrandedEmail } from './emailTemplate';

export interface IPasswordChangedEmailSender {
  sendPasswordChanged(opts: { readonly to: string; readonly baseUrl: string }): Promise<void>;
}

export interface ISendGridPasswordChangedConfig {
  readonly apiKey: string;
  readonly fromEmail: string;
  readonly fromName: string;
}

/**
 * Sends "password changed by administrator" emails via SendGrid.
 * When apiKey is empty, sendPasswordChanged no-ops (for dev/test without SendGrid).
 */
export class SendGridPasswordChangedEmailSender implements IPasswordChangedEmailSender {
  private readonly _sendGrid: MailService;
  private readonly _config: ISendGridPasswordChangedConfig;

  constructor(config: ISendGridPasswordChangedConfig, sendGrid: MailService) {
    this._config = config;
    this._sendGrid = sendGrid;
  }

  async sendPasswordChanged(opts: {
    readonly to: string;
    readonly baseUrl: string;
  }): Promise<void> {
    if (!this._config.apiKey) {
      return;
    }
    const resetUrl = `${opts.baseUrl.replace(/\/$/, '')}/reset-password`;
    const timestamp = new Date().toISOString();
    const bodyHtml = `
      <p>Your Scholarmancy password was changed by a support administrator.</p>
      <p><strong>Time:</strong> ${timestamp}</p>
      <p>If you did not authorize this change, <a href="${resetUrl}">reset your password now</a> to secure your account.</p>
    `.trim();
    const html = buildBrandedEmail({
      title: 'Password changed',
      bodyHtml,
    });
    await this._sendGrid.send({
      to: opts.to,
      from: { email: this._config.fromEmail, name: this._config.fromName },
      subject: 'Your Scholarmancy password has been changed',
      text: `Your Scholarmancy password was changed by a support administrator at ${timestamp}. If you did not authorize this, reset your password at ${resetUrl}.`,
      html,
    });
  }
}
