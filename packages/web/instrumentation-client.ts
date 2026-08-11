/**
 * Next.js client instrumentation hook (loaded once in the browser before the
 * app hydrates). Initializes Sentry for client-side error capture. No-ops
 * when NEXT_PUBLIC_SENTRY_DSN is unset (development, test).
 */
import * as Sentry from '@sentry/nextjs';

const dsn = process.env['NEXT_PUBLIC_SENTRY_DSN'];

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV,
    tracesSampleRate: Number(process.env['NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE'] ?? '0'),
  });
}

export const onRouterTransitionStart = dsn ? Sentry.captureRouterTransitionStart : undefined;
