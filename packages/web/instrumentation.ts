/**
 * Next.js server instrumentation hook. Initializes Sentry for the Node and
 * edge runtimes. No-ops when SENTRY_DSN is unset (development, test).
 */
export async function register(): Promise<void> {
  const dsn = process.env['SENTRY_DSN'];
  if (!dsn) return;

  const sentry = await import('@sentry/nextjs');
  sentry.init({
    dsn,
    environment: process.env.NODE_ENV,
    tracesSampleRate: Number(process.env['SENTRY_TRACES_SAMPLE_RATE'] ?? '0'),
  });
}

/** Report errors from nested React Server Components. */
export async function onRequestError(...args: unknown[]): Promise<void> {
  if (!process.env['SENTRY_DSN']) return;
  const sentry = await import('@sentry/nextjs');
  (sentry.captureRequestError as (...a: unknown[]) => void)(...args);
}
