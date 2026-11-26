import { MailService } from '@sendgrid/mail';
import { applySendGridBaseUrl } from './server';

const RELAY = 'https://api.sendgrid.noctusoft.com';

/** Mimics @sendgrid/mail: setApiKey resets the client's base URL to real SendGrid. */
function fakeMail() {
  const client = {
    baseUrl: 'https://api.sendgrid.com/',
    setDefaultRequest(_key: 'baseUrl', value: string) {
      client.baseUrl = value;
    },
    setApiKey() {
      client.baseUrl = 'https://api.sendgrid.com/';
    },
  };
  const mail = {
    client,
    setApiKey(key: string) {
      void key;
      client.setApiKey();
    },
  };
  return mail;
}

describe('applySendGridBaseUrl', () => {
  it('points the shared client at the relay', () => {
    const mail = fakeMail();
    applySendGridBaseUrl(mail, RELAY);
    expect(mail.client.baseUrl).toBe(RELAY);
  });

  it('keeps the relay after the senders call setApiKey (library resets it each time)', () => {
    const mail = fakeMail();
    applySendGridBaseUrl(mail, RELAY);
    mail.setApiKey('first-sender');
    mail.setApiKey('per-request-route');
    expect(mail.client.baseUrl).toBe(RELAY);
  });

  it('leaves the client alone when no base URL is configured', () => {
    const mail = fakeMail();
    applySendGridBaseUrl(mail, undefined);
    mail.setApiKey('x');
    expect(mail.client.baseUrl).toBe('https://api.sendgrid.com/');
  });

  /**
   * The real library from here on. It prints `API key does not start with "SG.".` for any
   * key that is not SendGrid's own. Behind the relay the key is the relay's, so the API's
   * boot log carried that line once per email sender, where it read like a wrong key.
   */
  describe('the library key warning', () => {
    const RELAY_KEY = 'nsk_a_relay_key_for_tests_only';
    const LIBRARY_WARNING = 'API key does not start with "SG.".';
    let warn: jest.SpyInstance;

    beforeEach(() => {
      warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    });

    afterEach(() => {
      warn.mockRestore();
    });

    it('is not printed for a relay key once the relay is configured', () => {
      const mail = new MailService();
      applySendGridBaseUrl(mail, RELAY);

      mail.setApiKey(RELAY_KEY);
      mail.setApiKey(RELAY_KEY);

      expect(warn).not.toHaveBeenCalled();
      const client = (
        mail as unknown as { client: { auth: string; defaultRequest: { baseUrl: string } } }
      ).client;
      expect(client.defaultRequest.baseUrl).toBe(RELAY);
      expect(client.auth).toBe(`Bearer ${RELAY_KEY}`);
    });

    it('is still printed when mail goes straight to SendGrid', () => {
      const mail = new MailService();
      applySendGridBaseUrl(mail, undefined);

      mail.setApiKey(RELAY_KEY);

      expect(warn).toHaveBeenCalledWith(LIBRARY_WARNING);
    });
  });
});
