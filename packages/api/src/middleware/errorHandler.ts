import type { Request, Response, NextFunction, ErrorRequestHandler } from 'express';
import { AppError, NotFoundError, getErrorReporter } from '@scholaracle/contracts';
import { isProductionEnv, type Logger } from '@scholaracle/logger';
import { logger as defaultLogger } from '../logger';
import { serializeError } from './serializeError';

export interface IErrorHandlerOptions {
  /** Injectable for tests; defaults to NODE_ENV === 'production'. */
  readonly isProduction?: boolean;
  readonly logger?: Logger;
}

/**
 * Global Express error handler (must be registered last).
 *
 * Logs every error with request context, reports non-operational errors to
 * the configured error reporter (Sentry when wired), and responds with the
 * env-aware serialized body. The `x-request-id` header set by
 * requestIdMiddleware ties the response to the log line.
 */
export function createErrorHandler(options: IErrorHandlerOptions = {}): ErrorRequestHandler {
  const isProduction = options.isProduction ?? isProductionEnv();
  const logger = options.logger ?? defaultLogger;

  return (error: unknown, req: Request, res: Response, next: NextFunction): void => {
    const requestId =
      typeof res.locals['requestId'] === 'string' ? res.locals['requestId'] : undefined;
    const { status, body } = serializeError(error, requestId, isProduction);

    const logContext = { err: error, method: req.method, path: req.path, status };
    if (status >= 500) {
      logger.error(logContext, 'request failed');
    } else {
      logger.warn(logContext, 'request rejected');
    }

    const isOperational = error instanceof AppError && error.isOperational;
    if (!isOperational) {
      getErrorReporter().captureException(error, {
        requestId,
        method: req.method,
        path: req.path,
        status,
      });
    }

    if (res.headersSent) {
      next(error);
      return;
    }
    res.status(status).json(body);
  };
}

/**
 * 404 catch-all for unmatched routes. Registered after all routes, before the
 * error handler, so unknown paths get the standard JSON envelope instead of
 * Express's HTML 404.
 */
export function notFoundHandler(req: Request, _res: Response, next: NextFunction): void {
  next(new NotFoundError(`Route not found: ${req.method} ${req.path}`));
}
