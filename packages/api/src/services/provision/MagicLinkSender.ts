import type { IEmailTransport } from '@scholaracle/agents';
import type { GuardedSmsSender } from '@scholaracle/agents';
import { SCHOLARMANCY_SMS_BRAND } from '@scholaracle/contracts';

export interface IMagicLinkEmailConfig {
  readonly fromEmail: string;
  readonly fromName: string;
}

export interface ISendMagicLinkParams {
  readonly to: string;
  readonly loginUrl: string;
  readonly recipientName?: string;
}

export interface IMagicLinkSender {
  sendEmail(params: ISendMagicLinkParams): Promise<void>;
  sendSms(params: ISendMagicLinkParams): Promise<void>;
}

/**
 * Sends one-time magic login links via email or consent-gated SMS.
 */
export class MagicLinkSender implements IMagicLinkSender {
  constructor(
    private readonly _transport: IEmailTransport,
    private readonly _emailConfig: IMagicLinkEmailConfig,
    private readonly _guardedSms: GuardedSmsSender | null
  ) {}

  public async sendEmail(params: ISendMagicLinkParams): Promise<void> {
    const { to, loginUrl, recipientName } = params;
    const greeting = recipientName ? `Hi ${recipientName},` : 'Hi,';
    const text = [
      greeting,
      '',
      `You have been sent a one-time sign-in link for ${SCHOLARMANCY_SMS_BRAND}.`,
      'Click the link below to log in (expires in 24 hours):',
      '',
      loginUrl,
      '',
      'If you did not expect this email, you can ignore it.',
    ].join('\n');

    const html = [
      `<p>${greeting}</p>`,
      `<p>You have been sent a one-time sign-in link for ${SCHOLARMANCY_SMS_BRAND}.<br>`,
      'Click the button below to log in (expires in 24 hours):</p>',
      `<p><a href="${loginUrl}" style="display:inline-block;padding:12px 24px;background:#4f46e5;color:#fff;border-radius:6px;text-decoration:none;font-weight:600;">Sign in to ${SCHOLARMANCY_SMS_BRAND}</a></p>`,
      `<p style="color:#6b7280;font-size:12px;">Or copy this link: ${loginUrl}</p>`,
      '<p style="color:#6b7280;font-size:12px;">If you did not expect this email, you can ignore it.</p>',
    ].join('');

    await this._transport.send({
      to,
      from: { email: this._emailConfig.fromEmail, name: this._emailConfig.fromName },
      subject: `Your ${SCHOLARMANCY_SMS_BRAND} sign-in link`,
      text,
      html,
    });
  }

  public async sendSms(params: ISendMagicLinkParams): Promise<void> {
    if (!this._guardedSms) {
      throw new Error('SMS delivery is not configured');
    }
    const { to, loginUrl } = params;
    const body = `Your sign-in link (expires in 24h): ${loginUrl}`;
    await this._guardedSms.sendTransactional(to, body, {
      templateName: 'magic_link',
      triggeredBy: 'system',
    });
  }
}
