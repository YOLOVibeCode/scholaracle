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
 * Legacy notification mail, now used only by the email-transfer confirmation flow
 * (`baseUrl` there is the confirmation link). Sharing invitations are sent by
 * services/sharing/SharingInviteEmailSender.ts, whose button opens the /magic route.
 * When apiKey is empty, sendInvite no-ops (for dev/test without SendGrid).
 */
export class SendGridInviteEmailSender implements IInviteEmailSender {
  private readonly _sendGrid: MailService;
  private readonly _config: IInviteEmailSenderConfig;

  constructor(config: IInviteEmailSenderConfig, sendGrid: MailService) {
    this._config = config;
    this._sendGrid = sendGrid;
    if (config.apiKey) {
      this._sendGrid.setApiKey(config.apiKey);
    }
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
    // The old /register?invite= and /dashboard/invites links pointed at pages that do not exist
    // (sharing-spec D5); the one link offered here is the caller's own.
    const link = escapeHtml(opts.baseUrl);
    const bodyHtml = `
      <p>You've been invited to receive alerts for <strong>${escapeHtml(opts.studentName)}</strong> on Scholarmancy.</p>
      <p><a href="${link}">Open Scholarmancy</a> to continue.</p>
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
