import * as Sentry from '@sentry/node';
import { setErrorReporter, type IErrorReporter } from '@scholaracle/contracts';
import { getNodeEnv } from '@scholaracle/logger';

export class SentryErrorReporter implements IErrorReporter {
  captureException(error: unknown, context?: Record<string, unknown>): void {
    Sentry.captureException(error, { extra: context });
  }

  captureMessage(message: string, context?: Record<string, unknown>): void {
    Sentry.captureMessage(message, { extra: context });
  }
}

/**
 * Initialize Sentry and register it as the global error reporter.
 * No-ops when SENTRY_DSN is unset (development, test).
 *
 * @returns true if Sentry was initialized
 */
export function initSentry(): boolean {
  const dsn = process.env['SENTRY_DSN'];
  if (!dsn) {
    return false;
  }

  Sentry.init({
    dsn,
    environment: getNodeEnv(),
    release: process.env['RAILWAY_GIT_COMMIT_SHA'] ?? undefined,
    tracesSampleRate: Number(process.env['SENTRY_TRACES_SAMPLE_RATE'] ?? '0'),
  });
  setErrorReporter(new SentryErrorReporter());
  return true;
}
