import { TWILIO_OPT_OUT_ERROR_CODE, SCHOLARMANCY_SMS_PURPOSE } from '@scholaracle/contracts';
import { GuardedSmsSender } from './GuardedSmsSender';
import type { ISmsConsentRepository } from '@scholaracle/interfaces';
import type { CommunicationLogRepository } from '@scholaracle/database';
import type { NoctusoftSmsRelayClient } from './NoctusoftSmsRelayClient';

describe('GuardedSmsSender', () => {
  it('records opt-out when relay returns 21610', async () => {
    const consent: jest.Mocked<ISmsConsentRepository> = {
      hasActiveConsent: jest.fn().mockResolvedValue(true),
      findByPhoneAndPurpose: jest.fn(),
      recordOptIn: jest.fn(),
      recordOptOut: jest.fn().mockResolvedValue(undefined),
      clearOptOut: jest.fn(),
      markConfirmationSent: jest.fn(),
      completeReplyYes: jest.fn(),
    };
    const commLogs = {
      create: jest.fn().mockResolvedValue({}),
    } as unknown as CommunicationLogRepository;
    const relay = {
      send: jest.fn().mockRejectedValue(
        Object.assign(new Error('opt out'), { code: TWILIO_OPT_OUT_ERROR_CODE })
      ),
    } as unknown as NoctusoftSmsRelayClient;

    const sender = new GuardedSmsSender(relay, consent, commLogs);
    await expect(sender.sendTransactional('+15125550100', 'Hello')).rejects.toThrow();
    expect(consent.recordOptOut).toHaveBeenCalledWith('+15125550100', SCHOLARMANCY_SMS_PURPOSE);
  });
});
