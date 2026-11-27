import { randomBytes } from 'node:crypto';
import {
  ensureBrandSmsBody,
  isGsm7,
  SmsNotSentError,
  type GuardedSmsSender,
  type SmsFailureKind,
} from '@scholaracle/agents';
import { AppError } from '@scholaracle/contracts';
import { MagicLinkSender } from './MagicLinkSender';

describe('MagicLinkSender.sendSms', () => {
  it.each(['https://scholarmancy.com', 'https://web-uat.scholarmancy.com'])(
    'keeps brand, link and STOP in one GSM-7 segment (%s)',
    async (origin) => {
      const sendTransactional = jest.fn().mockResolvedValue({ messageId: 'SM1' });
      const sender = new MagicLinkSender(
        { send: jest.fn() } as never,
        { fromEmail: 'noreply@scholarmancy.com', fromName: 'Scholarmancy' },
        { sendTransactional } as unknown as GuardedSmsSender
      );
      const loginUrl = `${origin}/magic?token=${randomBytes(32).toString('base64url')}`;
      await sender.sendSms({ to: '+15125550100', loginUrl });
      const sent = ensureBrandSmsBody(sendTransactional.mock.calls[0]![1] as string);
      expect(sent).toContain(loginUrl);
      expect(sent.length).toBeLessThanOrEqual(160);
      expect(isGsm7(sent)).toBe(true);
    }
  );

  describe('a link that could not be texted', () => {
    const PHONE = '+15125550100';
    const loginUrl = 'https://scholarmancy.com/magic?token=abc';

    const senderThatFails = (failure: unknown): MagicLinkSender =>
      new MagicLinkSender(
        { send: jest.fn() } as never,
        { fromEmail: 'noreply@scholarmancy.com', fromName: 'Scholarmancy' },
        { sendTransactional: jest.fn().mockRejectedValue(failure) } as unknown as GuardedSmsSender
      );

    const failureOf = async (sending: Promise<void>): Promise<unknown> => {
      try {
        await sending;
      } catch (error: unknown) {
        return error;
      }
      throw new Error('the link was texted');
    };

    const cases: readonly [string, SmsFailureKind, number, string][] = [
      ['no_consent', 'recipient', 409, 'has not turned on texts from Scholarmancy'],
      ['opted_out', 'recipient', 409, 'has opted out of texts from Scholarmancy'],
      ['invalid_phone', 'recipient', 400, 'is not a number we can text'],
      ['relay_21614', 'recipient', 400, 'is not a number we can text'],
      ['rate_limited', 'rate_limited', 429, 'Too many texts to that number'],
      ['relay_scope_forbidden', 'refused', 503, 'could not be texted'],
      ['relay_unreachable', 'unavailable', 503, 'could not be texted'],
    ];

    it.each(cases)(
      'says why in words the person can act on (%s)',
      async (reason, kind, status, words) => {
        const sender = senderThatFails(new SmsNotSentError(reason, kind));

        const error = await failureOf(sender.sendSms({ to: PHONE, loginUrl }));

        expect(error).toBeInstanceOf(AppError);
        const answer = error as AppError;
        expect(answer.status).toBe(status);
        // Operational: the sentence reaches the person in production too.
        expect(answer.isOperational).toBe(true);
        expect(answer.message).toContain(words);
        expect(answer.message).not.toContain('5125550100');
        expect(answer.message).not.toContain(reason);
      }
    );

    it('says texts are not available when the server has no text service', async () => {
      const sender = new MagicLinkSender(
        { send: jest.fn() } as never,
        { fromEmail: 'noreply@scholarmancy.com', fromName: 'Scholarmancy' },
        null
      );

      const error = await failureOf(sender.sendSms({ to: PHONE, loginUrl }));

      expect(error).toBeInstanceOf(AppError);
      expect(error).toMatchObject({
        status: 503,
        isOperational: true,
        message: 'Texts are not available right now. Send the link by email instead.',
      });
    });

    it('lets an error it does not know through as it is', async () => {
      const broken = new Error('database went away');
      const sender = senderThatFails(broken);

      await expect(sender.sendSms({ to: PHONE, loginUrl })).rejects.toBe(broken);
    });
  });
});
