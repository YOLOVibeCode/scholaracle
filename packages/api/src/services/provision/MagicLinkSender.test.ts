import { randomBytes } from 'node:crypto';
import { ensureBrandSmsBody, isGsm7, type GuardedSmsSender } from '@scholaracle/agents';
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
});
