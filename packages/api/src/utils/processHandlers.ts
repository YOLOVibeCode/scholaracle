import { getErrorReporter } from '@scholaracle/contracts';
import type { Logger } from '@scholaracle/logger';

/**
 * Last-resort traps for errors that escape all request/job handling.
 *
 * - unhandledRejection: logged and reported; the process keeps running.
 * - uncaughtException: logged and reported, then exit(1) — process state is
 *   undefined after an uncaught throw; Railway's restart policy brings the
 *   service back.
 */
export function installProcessHandlers(logger: Logger): void {
  process.on('unhandledRejection', (reason: unknown) => {
    logger.error({ err: reason }, 'unhandled promise rejection');
    getErrorReporter().captureException(reason, { source: 'unhandledRejection' });
  });

  process.on('uncaughtException', (error: Error) => {
    logger.fatal({ err: error }, 'uncaught exception - exiting');
    getErrorReporter().captureException(error, { source: 'uncaughtException' });
    process.exit(1);
  });
}
