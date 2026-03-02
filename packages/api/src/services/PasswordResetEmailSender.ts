import type { IPasswordResetEmailSender } from '@scholaracle/auth';
import type { MailService } from '@sendgrid/mail';
import { buildBrandedEmail } from './emailTemplate';

export interface ISendGridPasswordResetConfig {
  readonly apiKey: string;
  readonly fromEmail: string;
  readonly fromName: string;
}

/**
 * Sends password reset emails via SendGrid. Implements IPasswordResetEmailSender (ISP).
 * When apiKey is empty, sendResetLink no-ops (for dev/test without SendGrid).
 */
export class SendGridPasswordResetEmailSender implements IPasswordResetEmailSender {
  private readonly _sendGrid: MailService;
  private readonly _config: ISendGridPasswordResetConfig;

  constructor(config: ISendGridPasswordResetConfig, sendGrid: MailService) {
    this._config = config;
    this._sendGrid = sendGrid;
  }

  async sendResetLink(email: string, resetUrl: string): Promise<void> {
    if (!this._config.apiKey) {
      return;
    }
    const bodyHtml = `
      <p>You requested a password reset for your Scholaracle account.</p>
      <p><a href="${resetUrl}">Reset your password</a></p>
      <p>This link expires in 1 hour. If you didn't request this, you can ignore this email.</p>
    `.trim();
    const html = buildBrandedEmail({ title: 'Reset your password', bodyHtml });
    await this._sendGrid.send({
      to: email,
      from: { email: this._config.fromEmail, name: this._config.fromName },
      subject: 'Reset your Scholaracle password',
      text: `Reset your password: ${resetUrl}`,
      html,
    });
  }
}
