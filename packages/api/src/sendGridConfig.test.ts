import { getSendGridConfig } from './server';

describe('getSendGridConfig', () => {
  const saved = {
    key: process.env['SENDGRID_API_KEY'],
    email: process.env['SENDGRID_FROM_EMAIL'],
    name: process.env['SENDGRID_FROM_NAME'],
  };

  beforeEach(() => {
    delete process.env['SENDGRID_API_KEY'];
    delete process.env['SENDGRID_FROM_EMAIL'];
    delete process.env['SENDGRID_FROM_NAME'];
  });

  afterAll(() => {
    const restore = (name: string, value: string | undefined): void => {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    };
    restore('SENDGRID_API_KEY', saved.key);
    restore('SENDGRID_FROM_EMAIL', saved.email);
    restore('SENDGRID_FROM_NAME', saved.name);
  });

  it('names the sender Scholarmancy when no name is configured', () => {
    expect(getSendGridConfig({})).toEqual({
      apiKey: '',
      fromEmail: 'notifications@scholarmancy.com',
      fromName: 'Scholarmancy',
    });
  });

  it('reads the sender from the environment', () => {
    process.env['SENDGRID_API_KEY'] = 'SG.from-env';
    process.env['SENDGRID_FROM_EMAIL'] = 'hello@scholarmancy.com';
    process.env['SENDGRID_FROM_NAME'] = 'Scholarmancy Support';

    expect(getSendGridConfig({})).toEqual({
      apiKey: 'SG.from-env',
      fromEmail: 'hello@scholarmancy.com',
      fromName: 'Scholarmancy Support',
    });
  });

  it('lets the server config override the environment', () => {
    process.env['SENDGRID_FROM_NAME'] = 'From Env';

    expect(
      getSendGridConfig({
        sendGridApiKey: 'SG.from-config',
        sendGridFromEmail: 'config@scholarmancy.com',
        sendGridFromName: 'From Config',
      })
    ).toEqual({
      apiKey: 'SG.from-config',
      fromEmail: 'config@scholarmancy.com',
      fromName: 'From Config',
    });
  });
});
