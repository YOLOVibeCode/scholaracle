'use client';

import { useEffect } from 'react';
import { reportClientError } from '@/lib/errors/reporting';

/**
 * Window-level error trap. Catches errors that escape React entirely
 * (event handlers, timers, unawaited promises) and forwards them to the
 * error reporting sink. Renders nothing; mounted once in Providers.
 */
export function GlobalErrorListener() {
  useEffect(() => {
    const onError = (event: ErrorEvent): void => {
      reportClientError(event.error ?? event.message, { source: 'window.onerror' });
    };
    const onUnhandledRejection = (event: PromiseRejectionEvent): void => {
      reportClientError(event.reason, { source: 'unhandledrejection' });
    };

    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onUnhandledRejection);
    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onUnhandledRejection);
    };
  }, []);

  return null;
}
