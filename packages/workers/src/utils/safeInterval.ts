import { getErrorReporter } from '@scholaracle/contracts';
import { logger } from '../logger';

export interface ISafeIntervalOptions {
  /** Log level for failures (default 'error'). Use 'warn' for best-effort jobs. */
  readonly level?: 'error' | 'warn';
  /** Report failures to the error reporter (default true). */
  readonly isReported?: boolean;
}

/**
 * setInterval for async jobs that can never kill the process or fail
 * silently. Failures are logged with the job name (and reported to Sentry
 * when configured); the interval keeps ticking. Overlapping runs are
 * skipped: if the previous tick is still executing, the new tick is dropped.
 */
export function safeInterval(
  name: string,
  fn: () => Promise<void>,
  intervalMs: number,
  options: ISafeIntervalOptions = {}
): NodeJS.Timeout {
  const level = options.level ?? 'error';
  const isReported = options.isReported ?? true;
  let isRunning = false;

  return setInterval(() => {
    if (isRunning) {
      logger.warn({ job: name }, 'previous run still in progress - skipping tick');
      return;
    }
    isRunning = true;
    void fn()
      .catch((error: unknown) => {
        logger[level]({ err: error, job: name }, 'scheduled job failed');
        if (isReported) {
          getErrorReporter().captureException(error, { job: name });
        }
      })
      .finally(() => {
        isRunning = false;
      });
  }, intervalMs);
}
