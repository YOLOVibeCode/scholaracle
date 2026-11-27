import { resolveSmsAppEnv } from './smsAppEnv';

describe('which environment a text is sent from', () => {
  it('is production only where Railway says the environment is production', () => {
    expect(resolveSmsAppEnv({ RAILWAY_ENVIRONMENT_NAME: 'production' })).toBe('production');
  });

  it.each([
    ['the dev environment on Railway', { RAILWAY_ENVIRONMENT_NAME: 'dev' }],
    ['a laptop, which has no Railway environment', {}],
    ['a production build that is not on Railway', { NODE_ENV: 'production' }],
    ['an environment with another name', { RAILWAY_ENVIRONMENT_NAME: 'pr-123' }],
  ])('is dev (captured by the relay, never sent) in %s', (_where, env) => {
    expect(resolveSmsAppEnv(env)).toBe('dev');
  });

  it.each([
    ['production', 'production'],
    ['prod', 'production'],
    ['uat', 'uat'],
    ['staging', 'uat'],
    ['qa', 'uat'],
    ['dev', 'dev'],
    ['development', 'dev'],
    ['local', 'dev'],
    [' Production ', 'production'],
  ])('SMS_APP_ENV=%s decides, whatever Railway says', (value, expected) => {
    expect(resolveSmsAppEnv({ SMS_APP_ENV: value, RAILWAY_ENVIRONMENT_NAME: 'dev' })).toBe(
      expected
    );
  });

  it('SMS_APP_ENV=dev keeps production from texting', () => {
    expect(resolveSmsAppEnv({ SMS_APP_ENV: 'dev', RAILWAY_ENVIRONMENT_NAME: 'production' })).toBe(
      'dev'
    );
  });

  it('a value it does not know is dev, so a typing mistake never sends a real text', () => {
    expect(
      resolveSmsAppEnv({ SMS_APP_ENV: 'prodution', RAILWAY_ENVIRONMENT_NAME: 'production' })
    ).toBe('dev');
  });

  it('an empty SMS_APP_ENV is no choice at all', () => {
    expect(resolveSmsAppEnv({ SMS_APP_ENV: '', RAILWAY_ENVIRONMENT_NAME: 'production' })).toBe(
      'production'
    );
  });
});
