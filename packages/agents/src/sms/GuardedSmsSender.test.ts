import {
  DeliveryError,
  SCHOLARMANCY_SMS_PURPOSE,
  TWILIO_OPT_OUT_ERROR_CODE,
} from '@scholaracle/contracts';
import type { ISmsConsentRepository } from '@scholaracle/interfaces';
import type { CommunicationLogRepository } from '@scholaracle/database';
import { logger } from '../logger';
import {
  GuardedSmsSender,
  isSmsRecipientReason,
  SmsNotSentError,
  type SmsFailureKind,
} from './GuardedSmsSender';
import { SmsRelayError, type NoctusoftSmsRelayClient } from './NoctusoftSmsRelayClient';

const PHONE = '+15125550100';
const PHONE_DIGITS = '5125550100';

function consentRepo(hasConsent = true): jest.Mocked<ISmsConsentRepository> {
  return {
    hasActiveConsent: jest.fn().mockResolvedValue(hasConsent),
    findByPhoneAndPurpose: jest.fn(),
    recordOptIn: jest.fn(),
    recordOptOut: jest.fn().mockResolvedValue(undefined),
    clearOptOut: jest.fn(),
    markConfirmationSent: jest.fn(),
    completeReplyYes: jest.fn(),
  };
}

function commLogRepo(create: jest.Mock = jest.fn().mockResolvedValue({})): {
  repo: CommunicationLogRepository;
  create: jest.Mock;
} {
  return { repo: { create } as unknown as CommunicationLogRepository, create };
}

function relayThat(send: jest.Mock): NoctusoftSmsRelayClient {
  return { send } as unknown as NoctusoftSmsRelayClient;
}

async function notSent(promise: Promise<unknown>): Promise<SmsNotSentError> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof SmsNotSentError) return error;
    throw error;
  }
  throw new Error('the text was sent');
}

/** Everything written to the log, as one string. */
function logged(...spies: jest.SpyInstance[]): string {
  return JSON.stringify(spies.flatMap((spy) => spy.mock.calls));
}

describe('GuardedSmsSender', () => {
  let info: jest.SpyInstance;
  let warn: jest.SpyInstance;
  let error: jest.SpyInstance;

  beforeEach(() => {
    info = jest.spyOn(logger, 'info').mockImplementation(() => undefined);
    warn = jest.spyOn(logger, 'warn').mockImplementation(() => undefined);
    error = jest.spyOn(logger, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('a text the relay accepts', () => {
    it("is logged for the account it was sent for, with Twilio's id", async () => {
      const send = jest.fn().mockResolvedValue({ messageSid: 'SM0123456789', captured: false });
      const { repo, create } = commLogRepo();
      const sender = new GuardedSmsSender(relayThat(send), consentRepo(), repo);

      const result = await sender.sendTransactional(PHONE, 'Scholarmancy: Hello', {
        userId: 'account-1',
        subject: 'Hello',
        templateName: 'sms_grade_drop',
      });

      expect(result).toEqual({ messageId: 'SM0123456789' });
      expect(create).toHaveBeenCalledTimes(1);
      expect(create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'account-1',
          channel: 'sms',
          recipientPhone: PHONE,
          status: 'sent',
          providerId: 'SM0123456789',
          templateName: 'sms_grade_drop',
        })
      );
    });

    it('goes out under the brand name, with the way to opt out', async () => {
      const send = jest.fn().mockResolvedValue({ messageSid: 'SM0123456789', captured: false });
      const { repo, create } = commLogRepo();
      const sender = new GuardedSmsSender(relayThat(send), consentRepo(), repo);

      await sender.sendTransactional(PHONE, 'Your sign-in link is ready.');

      const expected = 'Scholarmancy: Your sign-in link is ready. Reply STOP to opt out.';
      expect(send).toHaveBeenCalledWith(PHONE, expected);
      // The history keeps what was sent, not what was asked for.
      expect(create).toHaveBeenCalledWith(expect.objectContaining({ content: expected }));
    });

    it('still counts as sent when the log row cannot be written, so it is never sent twice', async () => {
      const send = jest.fn().mockResolvedValue({ messageSid: 'SM0123456789', captured: false });
      const { repo } = commLogRepo(
        jest.fn().mockRejectedValue(new Error(`E11000 while logging a text to ${PHONE}`))
      );
      const sender = new GuardedSmsSender(relayThat(send), consentRepo(), repo);

      const result = await sender.sendTransactional(PHONE, 'Scholarmancy: Hello', {
        userId: 'account-1',
      });

      expect(result).toEqual({ messageId: 'SM0123456789' });
      expect(send).toHaveBeenCalledTimes(1);
      expect(warn).toHaveBeenCalledTimes(1);
      expect(logged(info, warn, error)).not.toContain(PHONE_DIGITS);
    });

    it('that the relay only captured is logged as a preview, without an id, and the log says so', async () => {
      const send = jest.fn().mockResolvedValue({ captured: true });
      const { repo, create } = commLogRepo();
      const sender = new GuardedSmsSender(relayThat(send), consentRepo(), repo);

      const result = await sender.sendTransactional(PHONE, 'Scholarmancy: Hello', {
        userId: 'account-1',
        templateName: 'sms_digest',
      });

      expect(result).toEqual({ messageId: 'captured' });
      const row = create.mock.calls[0]![0] as Record<string, unknown>;
      expect(row['status']).toBe('preview');
      expect(row['providerId']).toBeUndefined();
      expect(info).toHaveBeenCalledWith(
        { template: 'sms_digest' },
        'text captured by the relay, not sent'
      );
      expect(logged(info, warn, error)).not.toContain(PHONE_DIGITS);
    });
  });

  describe('a text that is refused before the relay is asked', () => {
    it('for a number that is not a phone number', async () => {
      const send = jest.fn();
      const sender = new GuardedSmsSender(relayThat(send), consentRepo(), commLogRepo().repo);

      const refused = await notSent(sender.sendTransactional('not a number', 'Hello'));

      expect(refused).toMatchObject({ reason: 'invalid_phone', kind: 'recipient' });
      expect(isSmsRecipientReason(refused.reason)).toBe(true);
      expect(send).not.toHaveBeenCalled();
    });

    it('for a number with no consent on record', async () => {
      const send = jest.fn();
      const consent = consentRepo(false);
      const sender = new GuardedSmsSender(relayThat(send), consent, commLogRepo().repo);

      const refused = await notSent(sender.sendTransactional(PHONE, 'Hello'));

      expect(refused).toMatchObject({ reason: 'no_consent', kind: 'recipient' });
      expect(isSmsRecipientReason(refused.reason)).toBe(true);
      expect(consent.hasActiveConsent).toHaveBeenCalledWith(PHONE, SCHOLARMANCY_SMS_PURPOSE);
      expect(send).not.toHaveBeenCalled();
      expect(logged(info, warn, error)).not.toContain(PHONE_DIGITS);
    });
  });

  describe('a text the relay refuses', () => {
    const cases: readonly [string, SmsRelayError, string, SmsFailureKind][] = [
      [
        'the number opted out',
        new SmsRelayError(400, TWILIO_OPT_OUT_ERROR_CODE),
        'opted_out',
        'recipient',
      ],
      ['the number is not valid', new SmsRelayError(400, 21211), 'relay_21211', 'recipient'],
      [
        'the number is outside the US and Canada',
        new SmsRelayError(400, 21408),
        'relay_21408',
        'recipient',
      ],
      ['the number is not a mobile', new SmsRelayError(400, 21614), 'relay_21614', 'recipient'],
      ['the number is a landline', new SmsRelayError(400, 21635), 'relay_21635', 'recipient'],
      [
        'too many texts went to the number',
        new SmsRelayError(429, 20429, 1800),
        'rate_limited',
        'rate_limited',
      ],
      // Either sign is enough: the relay's own cap answers 429, Twilio's limit carries 20429.
      ['the relay answers 429', new SmsRelayError(429), 'rate_limited', 'rate_limited'],
      [
        'Twilio says too many requests',
        new SmsRelayError(400, 20429),
        'rate_limited',
        'rate_limited',
      ],
      [
        'the relay gives a sentence where a code belongs',
        new SmsRelayError(400, `${PHONE} is not reachable`),
        'relay_http_400',
        'refused',
      ],
      [
        'the key may not send texts',
        new SmsRelayError(403, 'SCOPE_FORBIDDEN'),
        'relay_scope_forbidden',
        'refused',
      ],
      ['the key is not accepted', new SmsRelayError(401), 'relay_http_401', 'refused'],
      [
        'Twilio refuses for another reason',
        new SmsRelayError(400, 21606),
        'relay_21606',
        'refused',
      ],
      ['the relay is broken', new SmsRelayError(502), 'relay_http_502', 'unavailable'],
      ['the relay timed out upstream', new SmsRelayError(408), 'relay_http_408', 'unavailable'],
      ['the relay did not answer', new SmsRelayError(0), 'relay_unreachable', 'unavailable'],
    ];

    it.each(cases)('because %s', async (_why, relayError, reason, kind) => {
      const send = jest.fn().mockRejectedValue(relayError);
      const { repo, create } = commLogRepo();
      const sender = new GuardedSmsSender(relayThat(send), consentRepo(), repo);

      const refused = await notSent(sender.sendTransactional(PHONE, 'Hello'));

      expect(refused.reason).toBe(reason);
      expect(refused.kind).toBe(kind);
      expect(refused).toBeInstanceOf(DeliveryError);
      expect(refused.message).toBe(`SMS not sent: ${reason}`);
      // A caller that has only the code can still tell that the number is the trouble.
      expect(isSmsRecipientReason(refused.reason)).toBe(kind === 'recipient');
      // Nothing was sent, so nothing is logged as sent.
      expect(create).not.toHaveBeenCalled();
    });

    it('records the opt-out when the relay says the number opted out', async () => {
      const consent = consentRepo();
      const send = jest.fn().mockRejectedValue(new SmsRelayError(400, TWILIO_OPT_OUT_ERROR_CODE));
      const sender = new GuardedSmsSender(relayThat(send), consent, commLogRepo().repo);

      await notSent(sender.sendTransactional(PHONE, 'Hello'));

      expect(consent.recordOptOut).toHaveBeenCalledWith(PHONE, SCHOLARMANCY_SMS_PURPOSE);
    });

    it('records no opt-out for any other refusal', async () => {
      const consent = consentRepo();
      const send = jest.fn().mockRejectedValue(new SmsRelayError(400, 21211));
      const sender = new GuardedSmsSender(relayThat(send), consent, commLogRepo().repo);

      await notSent(sender.sendTransactional(PHONE, 'Hello'));

      expect(consent.recordOptOut).not.toHaveBeenCalled();
    });

    it('logs why, and never the number or what the relay said', async () => {
      const send = jest.fn().mockRejectedValue(
        Object.assign(new SmsRelayError(400, TWILIO_OPT_OUT_ERROR_CODE), {
          detail: `${PHONE} has opted out`,
        })
      );
      const sender = new GuardedSmsSender(relayThat(send), consentRepo(), commLogRepo().repo);

      const refused = await notSent(
        sender.sendTransactional(PHONE, 'Hello', { templateName: 'sms_grade_drop' })
      );

      expect(warn).toHaveBeenCalledWith(
        { reason: 'opted_out', kind: 'recipient', template: 'sms_grade_drop' },
        'text not sent'
      );
      expect(logged(info, warn, error)).not.toContain(PHONE_DIGITS);
      expect(JSON.stringify({ message: refused.message, context: refused.context })).not.toContain(
        PHONE_DIGITS
      );
    });

    it('treats an error it does not know as the relay being out of reach', async () => {
      const send = jest.fn().mockRejectedValue(new Error(`socket hang up texting ${PHONE}`));
      const sender = new GuardedSmsSender(relayThat(send), consentRepo(), commLogRepo().repo);

      const refused = await notSent(sender.sendTransactional(PHONE, 'Hello'));

      expect(refused).toMatchObject({ reason: 'relay_unreachable', kind: 'unavailable' });
      expect(refused.message).not.toContain(PHONE_DIGITS);
    });
  });
});
