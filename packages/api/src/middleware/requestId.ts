import { randomUUID } from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import { runWithRequestId } from '@scholaracle/logger';

const MAX_INCOMING_ID_LENGTH = 128;

/**
 * Correlation-ID middleware. Must be registered before all routes.
 *
 * Accepts an incoming `x-request-id` (from proxies/Railway) or generates a
 * UUID. The ID is echoed on the response header, stored in
 * `res.locals.requestId`, and bound to the async context so every log line
 * emitted while handling the request carries it automatically.
 */
export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.header('x-request-id');
  const requestId =
    incoming && incoming.length > 0 && incoming.length <= MAX_INCOMING_ID_LENGTH
      ? incoming
      : randomUUID();

  res.locals['requestId'] = requestId;
  res.setHeader('x-request-id', requestId);
  runWithRequestId(requestId, () => next());
}
