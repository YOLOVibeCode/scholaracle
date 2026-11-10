import type { IEmailTransport } from '@scholaracle/agents';
import { buildBrandedEmail } from '../emailTemplate';

export interface ISharingEmailFrom {
  readonly fromEmail: string;
  readonly fromName: string;
}

export interface ISharingInviteEmail {
  readonly to: string;
  readonly recipientName?: string;
  readonly inviterName: string;
  /** Display names of every student in the invitation (one email per invite group). */
  readonly studentNames: readonly string[];
  /** The one-time accept link: `${baseUrl}/magic?token=<raw>`. */
  readonly inviteUrl: string;
  /** Web origin for the fallback line ("or sign in at ... and open Invites"). */
  readonly baseUrl: string;
  readonly expiresInDays: number;
}

export interface ISharingLeftEmail {
  readonly to: string;
  readonly leaverName: string;
  readonly studentName: string;
  readonly baseUrl: string;
}

export interface IRenderedEmail {
  readonly subject: string;
  readonly text: string;
  readonly html: string;
}

export interface ISharingEmailSender {
  /** One email per invitation, listing every student, with one accept button. */
  sendInvite(opts: ISharingInviteEmail): Promise<void>;
  /** Tells the owner that an adult stopped following a student ("Jessica no longer follows Ava"). */
  sendLeftNotice(opts: ISharingLeftEmail): Promise<void>;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** "Ava", "Ava and Christian", "Ava, Christian and Gideon". */
export function joinNames(names: readonly string[]): string {
  const clean = names.map((n) => n.trim()).filter((n) => n !== '');
  if (clean.length === 0) return 'a student';
  if (clean.length === 1) return clean[0]!;
  return `${clean.slice(0, -1).join(', ')} and ${clean[clean.length - 1]!}`;
}

function trimSlash(url: string): string {
  return url.replace(/\/$/, '');
}

/** Pure renderer so the copy and links are unit-testable without a transport. */
export function renderSharingInviteEmail(opts: ISharingInviteEmail): IRenderedEmail {
  const names = joinNames(opts.studentNames);
  const greeting = opts.recipientName?.trim() ? `Hi ${opts.recipientName.trim()},` : 'Hi,';
  const siteUrl = trimSlash(opts.baseUrl);
  const subject = `${opts.inviterName} invited you to follow ${names} on Scholarmancy`;
  const listHtml = opts.studentNames.map((n) => `<li>${escapeHtml(n)}</li>`).join('');
  const bodyHtml = `
      <p>${escapeHtml(greeting)}</p>
      <p><strong>${escapeHtml(opts.inviterName)}</strong> invited you to follow ${escapeHtml(names)} on Scholarmancy: grades, assignments and alerts, on the web and on your phone.</p>
      <ul>${listHtml}</ul>
      <p><a href="${escapeHtml(opts.inviteUrl)}" style="display:inline-block;padding:12px 24px;background:#4f46e5;color:#fff;border-radius:6px;text-decoration:none;font-weight:600;">Accept invitation</a></p>
      <p style="color:#6b7280;font-size:12px;">This link works once and expires in ${opts.expiresInDays} days. Or sign in at <a href="${escapeHtml(siteUrl)}">${escapeHtml(siteUrl)}</a> and open Invites.</p>
      <p style="color:#6b7280;font-size:12px;">If you did not expect this email, you can ignore it.</p>
    `.trim();
  const html = buildBrandedEmail({ title: `Invitation: ${names}`, bodyHtml });
  const text = [
    greeting,
    '',
    `${opts.inviterName} invited you to follow ${names} on Scholarmancy.`,
    ...opts.studentNames.map((n) => `  - ${n}`),
    '',
    `Accept the invitation (one-time link, expires in ${opts.expiresInDays} days):`,
    opts.inviteUrl,
    '',
    `Or sign in at ${siteUrl} and open Invites.`,
    '',
    'If you did not expect this email, you can ignore it.',
  ].join('\n');
  return { subject, text, html };
}

export function renderSharingLeftEmail(opts: ISharingLeftEmail): IRenderedEmail {
  const siteUrl = trimSlash(opts.baseUrl);
  const line = `${opts.leaverName} no longer follows ${opts.studentName}`;
  const subject = `${line} on Scholarmancy`;
  const bodyHtml = `
      <p>${escapeHtml(line)}.</p>
      <p>They removed themself from ${escapeHtml(opts.studentName)}'s Family &amp; guardians. Their alerts and sign-in links for ${escapeHtml(opts.studentName)} stopped at once. You can invite them again any time.</p>
      <p><a href="${escapeHtml(siteUrl)}/dashboard">Open Scholarmancy</a></p>
    `.trim();
  const html = buildBrandedEmail({ title: line, bodyHtml });
  const text = [
    `${line}.`,
    '',
    `They removed themself from ${opts.studentName}'s Family & guardians. Their alerts and sign-in links for ${opts.studentName} stopped at once. You can invite them again any time.`,
    '',
    `${siteUrl}/dashboard`,
  ].join('\n');
  return { subject, text, html };
}

/**
 * Sends sharing emails through the app's email transport (SMTP in dev, the Noctusoft mail relay
 * elsewhere), so the links in the mail are the ones the server actually serves (sharing-spec D5).
 */
export class SharingInviteEmailSender implements ISharingEmailSender {
  constructor(
    private readonly _transport: IEmailTransport,
    private readonly _from: ISharingEmailFrom
  ) {}

  public async sendInvite(opts: ISharingInviteEmail): Promise<void> {
    const rendered = renderSharingInviteEmail(opts);
    await this._send(opts.to, rendered);
  }

  public async sendLeftNotice(opts: ISharingLeftEmail): Promise<void> {
    const rendered = renderSharingLeftEmail(opts);
    await this._send(opts.to, rendered);
  }

  private async _send(to: string, rendered: IRenderedEmail): Promise<void> {
    await this._transport.send({
      to,
      from: { email: this._from.fromEmail, name: this._from.fromName },
      subject: rendered.subject,
      text: rendered.text,
      html: rendered.html,
    });
  }
}
