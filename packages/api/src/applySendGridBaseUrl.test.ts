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
});
