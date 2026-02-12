import type { Request, Response, NextFunction } from 'express';

/**
 * Wraps an async Express route handler to ensure rejected promises
 * are forwarded to Express error handling via next().
 *
 * Express 4 does not natively catch async errors — if an async handler
 * throws, the request hangs indefinitely. This wrapper catches any
 * rejected promise and calls next(err) so Express can respond with 500.
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    fn(req, res, next).catch(next);
  };
}
