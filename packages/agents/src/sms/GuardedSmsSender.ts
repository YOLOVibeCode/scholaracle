import {
  DeliveryError,
  NotificationChannel,
  SCHOLARMANCY_SMS_PURPOSE,
  TWILIO_OPT_OUT_ERROR_CODE,
} from '@scholaracle/contracts';
import type { ISmsConsentRepository } from '@scholaracle/interfaces';
import type { CommunicationLogRepository, CommunicationTrigger } from '@scholaracle/database';
import { createLogger } from '@scholaracle/logger';

const log = createLogger('guarded-sms');
import { ensureBrandSmsBody } from './ensureBrandPrefix';
import { normalizePhoneE164 } from './normalizePhoneE164';
import { NoctusoftSmsRelayClient } from './NoctusoftSmsRelayClient';

export interface IGuardedSmsSendMeta {
  readonly userId?: string;
  readonly subject?: string;
  readonly templateName?: string;
  readonly triggeredBy?: CommunicationTrigger;
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

  public async sendTransactional(
    to: string,
    body: string,
    meta: IGuardedSmsSendMeta = {}
  ): Promise<{ messageId: string }> {
    const phoneE164 = normalizePhoneE164(to);
    if (!phoneE164) {
      throw new DeliveryError('Invalid phone number', NotificationChannel.SMS, {
        errorMessage: 'invalid_phone',
      });
    }
    const hasConsent = await this._consent.hasActiveConsent(phoneE164, this._purpose);
    if (!hasConsent) {
      throw new DeliveryError(
        'SMS refused: no active consent for this number',
        NotificationChannel.SMS,
        {
          errorMessage: 'no_consent',
        }
      );
    }
    return this._sendRelay(phoneE164, body, meta);
  }

  public async sendDoubleOptInConfirmation(
    to: string,
    inviterName: string
  ): Promise<{ messageId: string }> {
    const phoneE164 = normalizePhoneE164(to);
    if (!phoneE164) {
      throw new DeliveryError('Invalid phone number', NotificationChannel.SMS, {
        errorMessage: 'invalid_phone',
      });
    }
    const who = inviterName.trim() || 'Someone';
    const body = ensureBrandSmsBody(
      `${who} added this number for ${this._purpose}. Reply YES to receive these texts. Reply STOP to opt out.`
    );
    const result = await this._sendRelay(phoneE164, body, {
      templateName: 'sms_double_opt_in',
      triggeredBy: 'system',
    });
    await this._consent.markConfirmationSent(phoneE164, this._purpose);
    return result;
  }

  private async _sendRelay(
    phoneE164: string,
    body: string,
    meta: IGuardedSmsSendMeta
  ): Promise<{ messageId: string }> {
    const brandedBody = ensureBrandSmsBody(body);
    try {
      const relayResult = await this._relay.send(phoneE164, brandedBody);
      await this._commLogs.create({
        userId: meta.userId ?? phoneE164,
        channel: 'sms',
        type: 'notification',
        subject: meta.subject ?? 'SMS',
        content: brandedBody,
        recipientPhone: phoneE164,
        status: 'sent',
        sentAt: new Date(),
        triggeredBy: meta.triggeredBy ?? 'system',
        templateName: meta.templateName,
        providerId: relayResult.messageSid,
      });
      return { messageId: relayResult.messageSid };
    } catch (err: unknown) {
      const code =
        err &&
        typeof err === 'object' &&
        'code' in err &&
        typeof (err as { code: unknown }).code === 'number'
          ? (err as { code: number }).code
          : undefined;
      if (code === TWILIO_OPT_OUT_ERROR_CODE) {
        await this._consent.recordOptOut(phoneE164, this._purpose);
        log.info({ phoneE164 }, 'SMS opt-out recorded from relay 21610');
      }
      const message =
        err &&
        typeof err === 'object' &&
        'message' in err &&
        typeof (err as { message: unknown }).message === 'string'
          ? (err as { message: string }).message
          : 'SMS relay error';
      throw new DeliveryError(`Failed to deliver SMS: ${message}`, NotificationChannel.SMS, {
        errorCode: code,
        errorMessage: message,
      });
    }
  }
}
