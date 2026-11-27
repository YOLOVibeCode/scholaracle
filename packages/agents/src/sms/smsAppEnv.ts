/**
 * What the relay does with a text, by the `X-App-Env` it is sent with:
 * `production` is sent, `uat` is sent with `[UAT]` in front, `dev` is kept in the relay's
 * catcher and never reaches a phone.
 */
export type SmsAppEnv = 'production' | 'uat' | 'dev';

const NAMES: Readonly<Record<string, SmsAppEnv>> = {
  production: 'production',
  prod: 'production',
  uat: 'uat',
  staging: 'uat',
  qa: 'uat',
  dev: 'dev',
  development: 'dev',
  local: 'dev',
};

/**
 * Which environment texts are sent from.
 *
 * `SMS_APP_ENV` decides when it is set. Without it, only the Railway environment named
 * `production` sends real texts. Everything else is `dev`: the dev environment, a laptop,
 * a test run, and a value this function does not know. A text is real only where that was
 * meant.
 */
export function resolveSmsAppEnv(
  env: Readonly<Record<string, string | undefined>> = process.env
): SmsAppEnv {
  const chosen = (env['SMS_APP_ENV'] ?? '').trim().toLowerCase();
  if (chosen !== '') {
    return NAMES[chosen] ?? 'dev';
  }
  return env['RAILWAY_ENVIRONMENT_NAME'] === 'production' ? 'production' : 'dev';
}
