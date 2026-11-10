import type { MailService } from '@sendgrid/mail';
import { buildBrandedEmail } from './emailTemplate';

export interface IEmailTransferConfirmationConfig {
  readonly apiKey: string;
  readonly fromEmail: string;
  readonly fromName: string;
}

export interface IEmailTransferConfirmation {
  readonly to: string;
  /** The student whose access is moving to a new address. */
  readonly studentName: string;
  /** The confirmation link for THIS recipient (old or new address). */
  readonly confirmUrl: string;
  /** Hours until the link stops working. */
  readonly expiresInHours: number;
}

export interface IEmailTransferConfirmationSender {
  sendConfirmation(opts: IEmailTransferConfirmation): Promise<void>;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Pure renderer so the copy and the link are unit-testable without SendGrid. */
export function renderEmailTransferConfirmation(opts: IEmailTransferConfirmation): {
  readonly subject: string;
  readonly text: string;
  readonly html: string;
} {
  const subject = `Confirm your new email for ${opts.studentName}`;
  const bodyHtml = `
      <p>A request was made to move your Scholarmancy access for <strong>${escapeHtml(opts.studentName)}</strong> to a new email address.</p>
      <p>Both the current and the new address must confirm. If this was you, confirm below (the link works for ${opts.expiresInHours} hours).</p>
      <p><a href="${escapeHtml(opts.confirmUrl)}" style="display:inline-block;padding:12px 24px;background:#4f46e5;color:#fff;border-radius:6px;text-decoration:none;font-weight:600;">Confirm email change</a></p>
      <p style="color:#6b7280;font-size:12px;">If you did not request this, ignore this email and nothing changes.</p>
    `.trim();
  const html = buildBrandedEmail({ title: subject, bodyHtml });
  const text = [
    `A request was made to move your Scholarmancy access for ${opts.studentName} to a new email address.`,
    `Both the current and the new address must confirm. If this was you, open this link (valid ${opts.expiresInHours} hours):`,
    opts.confirmUrl,
    '',
    'If you did not request this, ignore this email and nothing changes.',
  ].join('\n');
  return { subject, text, html };
}

/**
 * Sends the two confirmation emails of a shared adult's email transfer
 * (POST /api/students/:id/contacts/:email/transfer-email) via SendGrid.
 * When apiKey is empty, sendConfirmation no-ops (for dev/test without SendGrid).
 */
export class SendGridEmailTransferConfirmationSender implements IEmailTransferConfirmationSender {
  private readonly _sendGrid: MailService;
  private readonly _config: IEmailTransferConfirmationConfig;

  constructor(config: IEmailTransferConfirmationConfig, sendGrid: MailService) {
    this._config = config;
    this._sendGrid = sendGrid;
    if (config.apiKey) {
      this._sendGrid.setApiKey(config.apiKey);
    }
  }

  async sendConfirmation(opts: IEmailTransferConfirmation): Promise<void> {
    if (!this._config.apiKey) {
      return;
    }
    const rendered = renderEmailTransferConfirmation(opts);
    await this._sendGrid.send({
      to: opts.to,
      from: { email: this._config.fromEmail, name: this._config.fromName },
      subject: rendered.subject,
      text: rendered.text,
      html: rendered.html,
    });
  }
}
