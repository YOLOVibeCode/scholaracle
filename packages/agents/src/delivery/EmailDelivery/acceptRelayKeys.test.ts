/**
 * The real @sendgrid/mail client, not a mock: the point of these tests is what the
 * library itself prints. It warns `API key does not start with "SG.".` for every key that
 * is not SendGrid's own. Mail that goes through the relay is signed with the relay's key,
 * so that warning appeared in the production log once per sender at every boot, where it
 * read like a misconfigured key.
 */
import { MailService } from '@sendgrid/mail';
import { SendGridTransport } from './SendGridTransport';
import { acceptRelayKeys } from './acceptRelayKeys';

const RELAY = 'https://api.sendgrid.noctusoft.com';
const RELAY_KEY = 'nsk_a_relay_key_for_tests_only';
const LIBRARY_WARNING = 'API key does not start with "SG.".';

describe('SendGrid key check behind a relay', () => {
  let warn: jest.SpyInstance;

  beforeEach(() => {
    warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    warn.mockRestore();
  });

  describe('SendGridTransport', () => {
    it('prints no key warning when mail goes through a relay', () => {
      new SendGridTransport(RELAY_KEY, new MailService(), RELAY);

      expect(warn).not.toHaveBeenCalled();
    });

    it('still sends through the relay with the relay key', () => {
      const mail = new MailService();
      new SendGridTransport(RELAY_KEY, mail, RELAY);
      const client = (
        mail as unknown as { client: { auth: string; defaultRequest: { baseUrl: string } } }
      ).client;

      expect(client.defaultRequest.baseUrl).toBe(RELAY);
      expect(client.auth).toBe(`Bearer ${RELAY_KEY}`);
    });

    it('keeps the library warning when the key goes straight to SendGrid', () => {
      new SendGridTransport(RELAY_KEY, new MailService());

      expect(warn).toHaveBeenCalledWith(LIBRARY_WARNING);
    });

    it('still reports an empty key behind a relay', () => {
      new SendGridTransport('   ', new MailService(), RELAY);

      expect(warn).toHaveBeenCalledWith(LIBRARY_WARNING);
    });
  });

  describe('acceptRelayKeys', () => {
    it('quiets later setApiKey calls on the same client', () => {
      const mail = new MailService();
      acceptRelayKeys(mail);

      mail.setApiKey(RELAY_KEY);
      mail.setApiKey(RELAY_KEY);

      expect(warn).not.toHaveBeenCalled();
    });

    it('does nothing to a mail service that exposes no client', () => {
      expect(() => acceptRelayKeys({ setApiKey: jest.fn() })).not.toThrow();
      expect(() => acceptRelayKeys(undefined)).not.toThrow();
    });
  });
});
