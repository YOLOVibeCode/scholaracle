import { isDevBuild } from './types';

/**
 * Central sink for client-side errors (render crashes, unhandled rejections,
 * caught-but-unrecoverable failures).
 *
 * Development: logs to the console for immediate visibility.
 * Production: forwards to Sentry (dynamically imported; a no-op until Sentry
 * is initialized via instrumentation-client.ts with NEXT_PUBLIC_SENTRY_DSN).
 */
export function reportClientError(error: unknown, context?: Record<string, unknown>): void {
  if (isDevBuild) {
    console.error('[client-error]', error, context ?? '');
    return;
  }

  void import('@sentry/nextjs')
    .then((sentry) => {
      sentry.captureException(error, { extra: context });
    })
    .catch(() => {
      // Reporting must never throw.
    });
}
