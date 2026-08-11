import pino from 'pino';

import { isDevelopmentEnv, isTestEnv } from './env';
import { getRequestId } from './requestContext';

export type Logger = pino.Logger;

export interface ICreateLoggerOptions {
  /** Override the log level (defaults to LOG_LEVEL env, `silent` in test, `info` otherwise). */
  readonly level?: string;
  /** Write destination override — used by tests to capture output in memory. */
  readonly destination?: pino.DestinationStream;
}

const REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  '*.password',
  '*.token',
  '*.accessToken',
  '*.refreshToken',
  '*.secret',
  '*.apiKey',
];

/**
 * Create a named pino logger.
 *
 * - Production/test: one-line JSON to stdout (Railway-searchable).
 * - Development: pretty-printed via pino-pretty.
 * - Every line automatically carries `requestId` when inside
 *   `runWithRequestId` (see requestContext.ts).
 * - Errors passed as `{ err }` are serialized with name/message/stack.
 */
export function createLogger(name: string, options: ICreateLoggerOptions = {}): Logger {
  const level = options.level ?? process.env['LOG_LEVEL'] ?? (isTestEnv() ? 'silent' : 'info');

  const pinoOptions: pino.LoggerOptions = {
    name,
    level,
    redact: { paths: REDACT_PATHS, censor: '[redacted]' },
    serializers: { err: pino.stdSerializers.err },
    mixin: () => {
      const requestId = getRequestId();
      return requestId !== undefined ? { requestId } : {};
    },
  };

  if (options.destination) {
    return pino(pinoOptions, options.destination);
  }

  if (isDevelopmentEnv()) {
    return pino({
      ...pinoOptions,
      transport: { target: 'pino-pretty', options: { colorize: true } },
    });
  }

  return pino(pinoOptions);
}
