import type { MailService } from '@sendgrid/mail';
import { buildBrandedEmail } from '../emailTemplate';

export interface ISourceInviteMailerConfig {
  readonly apiKey: string;
  readonly fromEmail: string;
  readonly fromName: string;
}

export interface ISourceInviteMailer {
  sendInstallLink(params: {
    readonly to: string;
    readonly providerName: string;
    readonly studentName: string;
    readonly landingUrl: string;
    readonly expiresAt: Date;
  }): Promise<void>;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function firstName(fullName: string): string {
  const part = fullName.trim().split(/\s+/)[0];
  return part && part.length > 0 ? part : 'there';
}

/**
 * SOURCE_INVITE.md §7. Empty apiKey no-ops.
 */
export class SendGridSourceInviteEmailSender implements ISourceInviteMailer {
  constructor(
    private readonly _config: ISourceInviteMailerConfig,
    private readonly _sendGrid: MailService
  ) {
    if (_config.apiKey) {
      this._sendGrid.setApiKey(_config.apiKey);
    }
  }

  async sendInstallLink(params: {
    readonly to: string;
    readonly providerName: string;
    readonly studentName: string;
    readonly landingUrl: string;
    readonly expiresAt: Date;
  }): Promise<void> {
    if (!this._config.apiKey) return;
    const subject = `Install ${params.providerName} in Scholarmancy`;
    const name = escapeHtml(firstName(params.studentName));
    const provider = escapeHtml(params.providerName);
    const link = escapeHtml(params.landingUrl);
    const when = params.expiresAt.toUTCString();
    const bodyHtml = `
      <p>Hi ${name},</p>
      <p>Tap the link below on your phone or computer to add <strong>${provider}</strong> for this student in Scholarmancy.</p>
      <p><a href="${link}">Open install link</a></p>
      <p>This link expires ${escapeHtml(when)}.</p>
      <p>This message never includes your school password. You will type it in the app or browser after the source is registered.</p>
    `.trim();
    const html = buildBrandedEmail({ title: subject, bodyHtml });
    await this._sendGrid.send({
      to: params.to,
      from: { email: this._config.fromEmail, name: this._config.fromName },
      subject,
      text: `Install ${params.providerName} in Scholarmancy: ${params.landingUrl}. This message never includes your school password.`,
      html,
    });
  }
}
