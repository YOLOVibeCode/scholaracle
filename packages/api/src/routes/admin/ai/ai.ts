import { Router, type Request, type Response } from 'express';
import type { Db } from 'mongodb';
import { AdminAuthService } from '@scholaracle/auth';
import { AiUsageRepository } from '@scholaracle/database';
import { adminAuthMiddleware } from '../../../middleware/adminAuth';
import { asyncHandler } from '../../../middleware/asyncHandler';

export interface IAdminAiRouterConfig {
  readonly database: Db;
  readonly jwtSecret?: string;
}

function startOfUtcMonth(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));
}

export function createAdminAiRouter(config: IAdminAiRouterConfig): Router {
  const router = Router();
  router.use(adminAuthMiddleware(new AdminAuthService(config.database, config.jwtSecret)));

  router.get(
    '/usage-summary',
    asyncHandler(async (_req: Request, res: Response) => {
      const repo = new AiUsageRepository(config.database);
      const summary = await repo.getAdminCostSummary(startOfUtcMonth(new Date()));
      res.status(200).json({ success: true, data: summary });
    })
  );

  return router;
}
