import {
  DeliveryError,
  NotificationChannel,
  SCHOLARMANCY_SMS_PURPOSE,
  TWILIO_OPT_OUT_ERROR_CODE,
} from '@scholaracle/contracts';
import type { ISmsConsentRepository } from '@scholaracle/interfaces';
import type { CommunicationLogRepository, CommunicationTrigger } from '@scholaracle/database';
import { logger } from '../logger';
import { ensureBrandSmsBody } from './ensureBrandPrefix';
import { normalizePhoneE164 } from './normalizePhoneE164';
import {
  SmsRelayError,
  type INoctusoftSmsRelayResult,
  type NoctusoftSmsRelayClient,
} from './NoctusoftSmsRelayClient';

export interface IGuardedSmsSendMeta {
  /** The account the text is for. The log row is written for it, so it goes when the account does. */
  readonly userId?: string;
  readonly subject?: string;
  readonly templateName?: string;
  readonly triggeredBy?: CommunicationTrigger;
}

/**
 * Why a text was not sent, as what the caller can do about it:
 * - `recipient`: this number cannot be texted (not a number, no consent, opted out, not a
 *   mobile). Asking again ends the same way.
 * - `refused`: the relay refused for a reason that is not about the number (the key, the
 *   sender). Asking again at once ends the same way; later it may not.
 * - `rate_limited`: too many texts for now.
 * - `unavailable`: the relay could not be reached or broke. Asking again may work.
 */
export type SmsFailureKind = 'recipient' | 'refused' | 'rate_limited' | 'unavailable';

/**
 * A text was not sent. `reason` is a code (`no_consent`, `opted_out`, `relay_21408`,
 * `relay_http_502`), never a sentence: this error is logged and stored, and what the relay
 * says in words can name the phone number.
 */
export class SmsNotSentError extends DeliveryError {
  public readonly reason: string;
  public readonly kind: SmsFailureKind;

  constructor(reason: string, kind: SmsFailureKind) {
    super(`SMS not sent: ${reason}`, NotificationChannel.SMS, { reason, kind });
    this.name = 'SmsNotSentError';
    this.reason = reason;
    this.kind = kind;
  }
}

const RATE_LIMIT_CODE = 20429;

/**
 * Twilio's codes that say the number itself cannot be texted: not valid (21211), in a
 * region texts are not sent to (21408), opted out (21610), not a mobile (21614), a
 * landline (21635).
 */
const RECIPIENT_CODES: ReadonlySet<number> = new Set([
  21211,
  21408,
  TWILIO_OPT_OUT_ERROR_CODE,
  21614,
  21635,
]);

/** Every reason that comes with the kind `recipient`. */
const RECIPIENT_REASONS: ReadonlySet<string> = new Set([
  'invalid_phone',
  'no_consent',
  'opted_out',
  ...[...RECIPIENT_CODES].map((code) => `relay_${code}`),
]);

/**
 * Whether a reason says the number itself cannot be texted. For a caller that has only the
 * reason (a delivery result) and not the error with its kind.
 */
export function isSmsRecipientReason(reason: string | undefined): boolean {
  return reason !== undefined && RECIPIENT_REASONS.has(reason);
}

/** The relay's code as a word that is safe to log: `relay_21408`, `relay_scope_forbidden`. */
function relayReason(status: number, code: number | string | undefined): string {
  if (typeof code === 'number') return `relay_${code}`;
  if (typeof code === 'string' && /^[A-Za-z0-9_]{1,40}$/.test(code)) {
    return `relay_${code.toLowerCase()}`;
  }
  return `relay_http_${status}`;
}

function failureOf(error: unknown): SmsNotSentError {
  if (!(error instanceof SmsRelayError)) {
    return new SmsNotSentError('relay_unreachable', 'unavailable');
  }
  const { status, code } = error;
  if (code === TWILIO_OPT_OUT_ERROR_CODE) return new SmsNotSentError('opted_out', 'recipient');
  if (status === 429 || code === RATE_LIMIT_CODE) {
    return new SmsNotSentError('rate_limited', 'rate_limited');
  }
  if (status === 0) return new SmsNotSentError('relay_unreachable', 'unavailable');
  const reason = relayReason(status, code);
  if (status === 408 || status >= 500) return new SmsNotSentError(reason, 'unavailable');
  if (typeof code === 'number' && RECIPIENT_CODES.has(code)) {
    return new SmsNotSentError(reason, 'recipient');
  }
  return new SmsNotSentError(reason, 'refused');
}

/**
 * Single outbound SMS gate: consent, brand prefix, relay send, comm log, opt-out on 21610.
 */
export class GuardedSmsSender {
  constructor(
    private readonly _relay: NoctusoftSmsRelayClient,
    private readonly _consent: ISmsConsentRepository,
    private readonly _commLogs: CommunicationLogRepository,
    private readonly _purpose: string = SCHOLARMANCY_SMS_PURPOSE
  ) {}

  /**
   * Send one text. Resolves when the relay took it.
   *
   * @throws {SmsNotSentError} when it was not sent; `kind` says whether asking again can help
   */
  public async sendTransactional(
    to: string,
    body: string,
    meta: IGuardedSmsSendMeta = {}
  ): Promise<{ messageId: string }> {
    const phoneE164 = normalizePhoneE164(to);
    if (!phoneE164) {
      throw this._notSent(new SmsNotSentError('invalid_phone', 'recipient'), meta);
    }
    const hasConsent = await this._consent.hasActiveConsent(phoneE164, this._purpose);
    if (!hasConsent) {
      throw this._notSent(new SmsNotSentError('no_consent', 'recipient'), meta);
    }

    const brandedBody = ensureBrandSmsBody(body);
    let relayResult: INoctusoftSmsRelayResult;
    try {
      relayResult = await this._relay.send(phoneE164, brandedBody);
    } catch (error: unknown) {
      const failure = failureOf(error);
      if (failure.reason === 'opted_out') {
        await this._consent.recordOptOut(phoneE164, this._purpose);
      }
      throw this._notSent(failure, meta);
    }

    await this._logSent(phoneE164, brandedBody, relayResult, meta);
    if (relayResult.captured) {
      logger.info({ template: meta.templateName }, 'text captured by the relay, not sent');
    }
    return { messageId: relayResult.messageSid ?? (relayResult.captured ? 'captured' : 'unknown') };
  }

  /** One line per text that did not go out: why, and never to whom. */
  private _notSent(failure: SmsNotSentError, meta: IGuardedSmsSendMeta): SmsNotSentError {
    logger.warn(
      { reason: failure.reason, kind: failure.kind, template: meta.templateName },
      'text not sent'
    );
    return failure;
  }

  /**
   * The relay has the text by now. A log row that cannot be written must not make the
   * caller send it again, so a failure here is logged and goes no further.
   */
  private async _logSent(
    phoneE164: string,
    body: string,
    relayResult: INoctusoftSmsRelayResult,
    meta: IGuardedSmsSendMeta
  ): Promise<void> {
    try {
      await this._commLogs.create({
        userId: meta.userId ?? phoneE164,
        channel: 'sms',
        type: 'notification',
        subject: meta.subject ?? 'SMS',
        content: body,
        recipientPhone: phoneE164,
        // A captured text reached nobody: it is a preview of what would have been sent.
        status: relayResult.captured ? 'preview' : 'sent',
        sentAt: new Date(),
        triggeredBy: meta.triggeredBy ?? 'system',
        templateName: meta.templateName,
        providerId: relayResult.messageSid,
      });
    } catch (error: unknown) {
      logger.warn(
        {
          error: error instanceof Error ? error.name : 'unknown',
          template: meta.templateName,
        },
        'text sent, but its log row could not be written'
      );
    }
  }
}
