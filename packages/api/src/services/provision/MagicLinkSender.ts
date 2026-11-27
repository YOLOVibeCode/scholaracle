import { SmsNotSentError } from '@scholaracle/agents';
import type { GuardedSmsSender, IEmailTransport } from '@scholaracle/agents';
import { AppError, ERROR_CODES, SCHOLARMANCY_SMS_BRAND } from '@scholaracle/contracts';

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

  /**
   * @throws {AppError} when the link was not texted, with a sentence for the person who asked
   */
  public async sendSms(params: ISendMagicLinkParams): Promise<void> {
    if (!this._guardedSms) {
      throw new AppError('Texts are not available right now. Send the link by email instead.', {
        status: 503,
        code: ERROR_CODES.EXTERNAL_SERVICE_ERROR,
      });
    }
    const { to, loginUrl } = params;
    // Short copy keeps brand + link + STOP in one segment (see ensureBrandSmsBody).
    const body = `Sign-in link (expires in 24h): ${loginUrl}`;
    try {
      await this._guardedSms.sendTransactional(to, body, {
        templateName: 'magic_link',
        triggeredBy: 'system',
      });
    } catch (error: unknown) {
      throw error instanceof SmsNotSentError ? linkNotTexted(error) : error;
    }
  }
}

/**
 * A sign-in link that was not texted, as an answer for the person who asked for it. The
 * number is one they typed: it may be anybody's, so the sentence says what they can do,
 * and neither the number nor the reason's code is in it.
 */
function linkNotTexted(failure: SmsNotSentError): AppError {
  if (failure.reason === 'no_consent') {
    return new AppError(
      'That number has not turned on texts from Scholarmancy. Send the link by email instead.',
      { status: 409, code: ERROR_CODES.CONFLICT }
    );
  }
  if (failure.reason === 'opted_out') {
    return new AppError(
      'That number has opted out of texts from Scholarmancy. Send the link by email instead.',
      { status: 409, code: ERROR_CODES.CONFLICT }
    );
  }
  if (failure.kind === 'recipient') {
    return new AppError('That is not a number we can text. Send the link by email instead.', {
      status: 400,
      code: ERROR_CODES.VALIDATION_ERROR,
    });
  }
  if (failure.kind === 'rate_limited') {
    return new AppError('Too many texts to that number for now. Try again later.', {
      status: 429,
      code: ERROR_CODES.RATE_LIMITED,
    });
  }
  return new AppError('The link could not be texted. Try again later, or send it by email.', {
    status: 503,
    code: ERROR_CODES.EXTERNAL_SERVICE_ERROR,
  });
}
