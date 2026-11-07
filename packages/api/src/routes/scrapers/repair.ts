import express, { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import type { Db } from 'mongodb';
import { AdminAuthService } from '@scholaracle/auth';
import { ValidationError } from '@scholaracle/contracts';
import { runScraperRepairProposal } from '@scholaracle/agents';
import { selectorTableJsonForRecipe } from '../../services/scraperRepair/selectorTableForRecipe';
import { adminAuthMiddleware } from '../../middleware/adminAuth';
import { asyncHandler } from '../../middleware/asyncHandler';
import { MemoryRateLimiter, rateLimitMiddleware } from '../../middleware/rateLimit';
import { checkScraperRepairPlanQuota } from '../../services/scraperRepair/scraperRepairQuota';
import { loadSkeletonByHash } from '../../services/scraperRepair/loadSkeleton';
import type { IAssetStore } from '../../services/assets/IAssetStore';

const MAX_SKELETON_BYTES = 200 * 1024;

const bodySchema = z.object({
  portalHost: z.string().min(1),
  recipeId: z.string().min(1),
  step: z.string().min(1),
  skeletonHash: z.string().min(32),
  gapKind: z.enum([
    'no_grade',
    'no_assignments',
    'no_grade_no_assignments',
    'missing_course_title',
  ]),
  billingUserId: z.string().min(1).optional(),
  skeleton: z.string().optional(),
});

export interface IScrapersRepairRouterConfig {
  readonly database: Db;
  readonly jwtSecret?: string;
  readonly assetStore?: IAssetStore;
  readonly defaultBillingUserId?: string;
}

export function createScrapersRepairRouter(config: IScrapersRepairRouterConfig): Router {
  const router = Router();
  const adminAuth = adminAuthMiddleware(new AdminAuthService(config.database, config.jwtSecret));
  const burst = rateLimitMiddleware({
    limiter: new MemoryRateLimiter(),
    windowMs: 60_000,
    max: 20,
    keyPrefix: 'scrapers:repair',
    keyFn: (req: Request) => (req.headers['x-forwarded-for'] as string) ?? req.ip ?? 'unknown',
  });

  router.post(
    '/repair',
    express.json({ limit: '200kb' }),
    adminAuth,
    burst,
    asyncHandler(async (req: Request, res: Response) => {
      const parsed = bodySchema.safeParse(req.body);
      if (!parsed.success) {
        throw new ValidationError(parsed.error.message);
      }
      const body = parsed.data;
      let skeleton = body.skeleton;
      if (skeleton !== undefined && Buffer.byteLength(skeleton, 'utf8') > MAX_SKELETON_BYTES) {
        throw new ValidationError(`Skeleton exceeds ${MAX_SKELETON_BYTES} bytes`);
      }
      if (!skeleton) {
        if (!config.assetStore) {
          throw new ValidationError('skeleton is required when blob storage is unavailable');
        }
        skeleton =
          (await loadSkeletonByHash({
            database: config.database,
            assetStore: config.assetStore,
            step: body.step,
            skeletonHash: body.skeletonHash,
          })) ?? undefined;
        if (!skeleton) {
          throw new ValidationError('No stored skeleton for this candidate');
        }
      }

      const billingUserId =
        body.billingUserId ??
        config.defaultBillingUserId ??
        process.env['SCRAPER_REPAIR_BILLING_USER_ID']?.trim() ??
        'staff-repair-billing';

      const result = await runScraperRepairProposal({
        database: config.database,
        key: body,
        skeleton,
        selectorTableJson: selectorTableJsonForRecipe(body.recipeId),
        billingUserId,
        checkPlanQuota: checkScraperRepairPlanQuota,
      });

      if (result.status === 'quota_exceeded') {
        res.status(429).json({
          success: false,
          error: 'Plan AI repair quota exceeded',
          code: 'RATE_LIMIT_EXCEEDED',
        });
        return;
      }
      if (result.status === 'skipped_weekly_cap') {
        res.status(429).json({
          success: false,
          error: 'Weekly proposal limit for this candidate',
          code: 'WEEKLY_CAP',
        });
        return;
      }

      res.status(200).json({
        success: true,
        status: result.status,
        ...(result.patch ? { proposal: result.patch } : {}),
      });
    })
  );

  return router;
}
