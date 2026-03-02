import type { MailService } from '@sendgrid/mail';
import { buildBrandedEmail } from './emailTemplate';

export interface IInviteEmailSenderConfig {
  readonly apiKey: string;
  readonly fromEmail: string;
  readonly fromName: string;
}

export interface IInviteEmailSender {
  sendInvite(opts: {
    readonly to: string;
    readonly studentName: string;
    readonly studentId: string;
    readonly inviteEmail: string;
    readonly baseUrl: string;
  }): Promise<void>;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Sends contact-invitation emails via SendGrid.
 * When apiKey is empty, sendInvite no-ops (for dev/test without SendGrid).
 */
export class SendGridInviteEmailSender implements IInviteEmailSender {
  private readonly _sendGrid: MailService;
  private readonly _config: IInviteEmailSenderConfig;

  constructor(config: IInviteEmailSenderConfig, sendGrid: MailService) {
    this._config = config;
    this._sendGrid = sendGrid;
  }

  async sendInvite(opts: {
    readonly to: string;
    readonly studentName: string;
    readonly studentId: string;
    readonly inviteEmail: string;
    readonly baseUrl: string;
  }): Promise<void> {
    if (!this._config.apiKey) {
      return;
    }
    const registerLink = `${opts.baseUrl.replace(/\/$/, '')}/register?invite=${opts.studentId}&email=${encodeURIComponent(opts.inviteEmail)}`;
    const dashboardLink = `${opts.baseUrl.replace(/\/$/, '')}/dashboard/invites`;
    const bodyHtml = `
      <p>You've been invited to receive alerts for <strong>${escapeHtml(opts.studentName)}</strong> on Scholaracle.</p>
      <p>If you already have an account, <a href="${dashboardLink}">log in and accept the invite</a>.</p>
      <p>If you don't have an account yet, <a href="${registerLink}">create one here</a> to accept the invite.</p>
      <p>Once you accept, you can choose how you'd like to receive alerts (email, SMS, or both).</p>
    `.trim();
    const html = buildBrandedEmail({
      title: `Invite: ${opts.studentName}`,
      bodyHtml,
    });
    await this._sendGrid.send({
      to: opts.to,
      from: { email: this._config.fromEmail, name: this._config.fromName },
      subject: `You've been invited to receive alerts for ${opts.studentName}`,
      text: `You've been invited to receive alerts for ${opts.studentName}. Sign up or log in at ${opts.baseUrl} to accept.`,
      html,
    });
  }
}
