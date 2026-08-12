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

/**
 * Deployed-version endpoint. Railway injects the git SHA at deploy time;
 * CI polls this to confirm an environment is actually running a given
 * commit (health alone can't distinguish old deploy from new).
 */
healthRouter.get('/version', (_req: Request, res: Response) => {
  res.status(200).json({
    status: 'ok',
    commit: process.env['RAILWAY_GIT_COMMIT_SHA'] ?? 'unknown',
    branch: process.env['RAILWAY_GIT_BRANCH'] ?? 'unknown',
    timestamp: new Date().toISOString(),
  });
});
