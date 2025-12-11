import { Router, type Request, type Response } from 'express';

export const healthRouter: Router = Router();

/**
 * Health check endpoint.
 * Returns server status and current timestamp.
 */
healthRouter.get('/', (_req: Request, res: Response) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
  });
});
