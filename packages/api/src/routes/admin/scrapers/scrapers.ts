import { Router, type Request, type Response } from 'express';
import type { Db } from 'mongodb';
import { ObjectId } from 'mongodb';
import { UserRepository } from '@scholaracle/database';
import { AdminAuthService } from '@scholaracle/auth';
import { adminAuthMiddleware } from '../../../middleware/adminAuth';
import { connectStep, crawlStep, authenticateCheckStep } from '../../../services/scraper-generator/crawler';

export interface IScrapersAdminRouterConfig {
  readonly database: Db;
  readonly jwtSecret?: string;
}

export function scrapersAdminRouter(config: IScrapersAdminRouterConfig): Router {
  const router = Router();
  const adminAuthService = new AdminAuthService(config.database, config.jwtSecret);
  const userRepository = new UserRepository(config.database);
  const generatedScrapersCollection = config.database.collection('generated_scrapers');
  const scraperGenerationJobsCollection = config.database.collection('scraper_generation_jobs');
  const scraperReportsCollection = config.database.collection('scraper_reports');

  router.use(adminAuthMiddleware(adminAuthService));

  /**
   * GET /api/admin/scrapers/stats
   * Summary card data: total caches, jobs by status, failure counts, unique platforms.
   */
  router.get('/stats', async (_req: Request, res: Response) => {
    try {
      const now = new Date();
      const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

      const [totalCaches, jobStatusAgg, reports24h, reports7d, reports30d, uniquePlatforms] = await Promise.all([
        generatedScrapersCollection.countDocuments(),
        scraperGenerationJobsCollection.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]).toArray(),
        scraperReportsCollection.countDocuments({ reportedAt: { $gte: dayAgo } }),
        scraperReportsCollection.countDocuments({ reportedAt: { $gte: weekAgo } }),
        scraperReportsCollection.countDocuments({ reportedAt: { $gte: monthAgo } }),
        generatedScrapersCollection.distinct('platformName'),
      ]);

      const statusCounts: Record<string, number> = {};
      for (const s of jobStatusAgg) {
        statusCounts[s['_id'] as string] = s['count'] as number;
      }
      const activeJobs = (statusCounts['queued'] ?? 0) + (statusCounts['connecting'] ?? 0) + (statusCounts['crawling'] ?? 0) +
        (statusCounts['authenticating'] ?? 0) + (statusCounts['crawl_complete'] ?? 0) + (statusCounts['generating'] ?? 0) + (statusCounts['validating'] ?? 0);

      res.status(200).json({
        success: true,
        data: {
          totalCaches,
          activeJobs,
          failures24h: reports24h,
          failures7d: reports7d,
          failures30d: reports30d,
          uniquePlatforms: (uniquePlatforms as string[]).length,
          jobsByStatus: statusCounts,
        },
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      });
    }
  });

  /**
   * GET /api/admin/scrapers/caches
   * List generated_scrapers with pagination and filters.
   */
  router.get('/caches', async (req: Request, res: Response) => {
    try {
      const page = Math.max(1, parseInt((req.query['page'] as string) || '1') || 1);
      const limit = Math.min(100, Math.max(1, parseInt((req.query['limit'] as string) || '25') || 25));
      const platformName = (req.query['platformName'] as string)?.trim() || undefined;
      const loginUrl = (req.query['loginUrl'] as string)?.trim() || undefined;
      const sort = (req.query['sort'] as string) || 'createdAt';

      const filter: Record<string, unknown> = {};
      if (platformName) filter['platformName'] = new RegExp(platformName, 'i');
      if (loginUrl) filter['loginUrl'] = new RegExp(loginUrl, 'i');

      const skip = (page - 1) * limit;
      const sortDir = sort.startsWith('-') ? -1 : 1;
      const sortKey = sort.replace(/^-/, '') || 'createdAt';

      const [items, total] = await Promise.all([
        generatedScrapersCollection
          .find(filter)
          .sort({ [sortKey]: sortDir })
          .skip(skip)
          .limit(limit)
          .toArray(),
        generatedScrapersCollection.countDocuments(filter),
      ]);

      const userIds = [...new Set((items as Array<{ generatedBy?: string }>).map((i) => i.generatedBy).filter(Boolean))] as string[];
      const userMap: Record<string, string> = {};
      for (const uid of userIds) {
        const user = await userRepository.findById(uid);
        if (user) userMap[uid] = user.email;
      }

      res.status(200).json({
        success: true,
        data: items.map((doc: Record<string, unknown>) => ({
          id: (doc['_id'] as ObjectId).toString(),
          cacheKey: doc['cacheKey'],
          platformName: doc['platformName'],
          loginUrl: doc['loginUrl'],
          createdAt: (doc['createdAt'] as Date)?.toISOString?.(),
          generatedBy: doc['generatedBy'],
          generatedByEmail: doc['generatedBy'] ? userMap[doc['generatedBy'] as string] : undefined,
          scraperCodeLength: typeof doc['scraperCode'] === 'string' ? (doc['scraperCode'] as string).length : 0,
          transformerCodeLength: typeof doc['transformerCode'] === 'string' ? (doc['transformerCode'] as string).length : 0,
          pageFingerprint: doc['pageFingerprint'],
        })),
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      });
    }
  });

  /**
   * GET /api/admin/scrapers/caches/:id
   * Single cache entry with full scraperCode, transformerCode, metadata.
   */
  router.get('/caches/:id', async (req: Request, res: Response) => {
    try {
      const id = req.params['id'];
      if (!id) {
        res.status(400).json({ success: false, error: 'Cache ID required' });
        return;
      }
      let doc;
      try {
        doc = await generatedScrapersCollection.findOne({ _id: new ObjectId(id) });
      } catch {
        doc = null;
      }
      if (!doc) {
        res.status(404).json({ success: false, error: 'Cache not found' });
        return;
      }
      const d = doc as Record<string, unknown>;
      res.status(200).json({
        success: true,
        data: {
          id: (d['_id'] as ObjectId).toString(),
          cacheKey: d['cacheKey'],
          platformName: d['platformName'],
          loginUrl: d['loginUrl'],
          loginMethod: d['loginMethod'],
          scraperCode: d['scraperCode'],
          transformerCode: d['transformerCode'],
          metadata: d['metadata'],
          createdAt: (d['createdAt'] as Date)?.toISOString?.(),
          generatedBy: d['generatedBy'],
          pageFingerprint: d['pageFingerprint'],
        },
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      });
    }
  });

  /**
   * DELETE /api/admin/scrapers/caches/:id
   * Purge a cached scraper.
   */
  router.delete('/caches/:id', async (req: Request, res: Response) => {
    try {
      const id = req.params['id'];
      if (!id) {
        res.status(400).json({ success: false, error: 'Cache ID required' });
        return;
      }
      let result;
      try {
        result = await generatedScrapersCollection.deleteOne({ _id: new ObjectId(id) });
      } catch {
        result = { deletedCount: 0 };
      }
      if (result.deletedCount === 0) {
        res.status(404).json({ success: false, error: 'Cache not found' });
        return;
      }
      res.status(200).json({ success: true, deleted: true });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      });
    }
  });

  /**
   * GET /api/admin/scrapers/jobs
   * List scraper_generation_jobs with pagination and filters.
   */
  router.get('/jobs', async (req: Request, res: Response) => {
    try {
      const page = Math.max(1, parseInt((req.query['page'] as string) || '1') || 1);
      const limit = Math.min(100, Math.max(1, parseInt((req.query['limit'] as string) || '25') || 25));
      const status = (req.query['status'] as string)?.trim() || undefined;
      const userId = (req.query['userId'] as string)?.trim() || undefined;
      const platformName = (req.query['platformName'] as string)?.trim() || undefined;

      const filter: Record<string, unknown> = {};
      if (status) filter['status'] = status;
      if (userId) filter['userId'] = userId;
      if (platformName) filter['platformName'] = new RegExp(platformName, 'i');

      const skip = (page - 1) * limit;
      const [items, total] = await Promise.all([
        scraperGenerationJobsCollection
          .find(filter)
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .toArray(),
        scraperGenerationJobsCollection.countDocuments(filter),
      ]);

      res.status(200).json({
        success: true,
        data: items.map((doc: Record<string, unknown>) => ({
          jobId: doc['jobId'],
          userId: doc['userId'],
          platformName: doc['platformName'],
          loginUrl: doc['loginUrl'],
          cacheKey: doc['cacheKey'],
          status: doc['status'],
          steps: doc['steps'],
          createdAt: (doc['createdAt'] as Date)?.toISOString?.(),
          updatedAt: (doc['updatedAt'] as Date)?.toISOString?.(),
          error: doc['error'],
          result: doc['result'] ? { scraperId: (doc['result'] as Record<string, unknown>)['scraperId'] } : undefined,
        })),
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      });
    }
  });

  /**
   * GET /api/admin/scrapers/jobs/:jobId
   * Single job with full step details.
   */
  router.get('/jobs/:jobId', async (req: Request, res: Response) => {
    try {
      const jobId = req.params['jobId'];
      if (!jobId) {
        res.status(400).json({ success: false, error: 'Job ID required' });
        return;
      }
      const doc = await scraperGenerationJobsCollection.findOne({ jobId });
      if (!doc) {
        res.status(404).json({ success: false, error: 'Job not found' });
        return;
      }
      const d = doc as Record<string, unknown>;
      res.status(200).json({
        success: true,
        data: {
          jobId: d['jobId'],
          userId: d['userId'],
          platformName: d['platformName'],
          loginUrl: d['loginUrl'],
          cacheKey: d['cacheKey'],
          status: d['status'],
          steps: d['steps'],
          result: d['result'],
          error: d['error'],
          retryCount: d['retryCount'],
          createdAt: (d['createdAt'] as Date)?.toISOString?.(),
          updatedAt: (d['updatedAt'] as Date)?.toISOString?.(),
        },
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      });
    }
  });

  /**
   * GET /api/admin/scrapers/reports
   * List scraper_reports (failure feed) with optional cacheKey filter.
   */
  router.get('/reports', async (req: Request, res: Response) => {
    try {
      const page = Math.max(1, parseInt((req.query['page'] as string) || '1') || 1);
      const limit = Math.min(100, Math.max(1, parseInt((req.query['limit'] as string) || '25') || 25));
      const cacheKey = (req.query['cacheKey'] as string)?.trim() || undefined;

      const filter: Record<string, unknown> = {};
      if (cacheKey) filter['cacheKey'] = cacheKey;

      const skip = (page - 1) * limit;
      const items = await scraperReportsCollection
        .find(filter)
        .sort({ reportedAt: -1 })
        .skip(skip)
        .limit(limit)
        .toArray();
      const total = await scraperReportsCollection.countDocuments(filter);

      const cacheKeys = [...new Set((items as unknown as Array<{ cacheKey: string }>).map((i) => i.cacheKey))];
      const cacheDocs = await generatedScrapersCollection
        .find({ cacheKey: { $in: cacheKeys } })
        .toArray();
      const platformByCache: Record<string, string> = {};
      for (const c of cacheDocs as unknown as Array<{ cacheKey: string; platformName: string }>) {
        platformByCache[c.cacheKey] = c.platformName;
      }

      res.status(200).json({
        success: true,
        data: items.map((doc: Record<string, unknown>) => ({
          id: (doc['_id'] as ObjectId).toString(),
          cacheKey: doc['cacheKey'],
          platformName: platformByCache[doc['cacheKey'] as string],
          status: doc['status'],
          error: doc['error'],
          generatedAt: (doc['generatedAt'] as Date)?.toISOString?.(),
          reportedAt: (doc['reportedAt'] as Date)?.toISOString?.(),
        })),
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      });
    }
  });

  /**
   * POST /api/admin/scrapers/test
   * Test a scraper: connect + crawl + auth check (no actual login).
   * Body: { loginUrl, username?, password? } (credentials not used for login, only for future use if needed).
   */
  router.post('/test', async (req: Request, res: Response) => {
    try {
      const body = req.body ?? {};
      const loginUrl = (body['loginUrl'] as string)?.trim();
      if (!loginUrl) {
        res.status(400).json({ success: false, error: 'loginUrl is required' });
        return;
      }

      const connectResult = await connectStep(loginUrl);
      if (!connectResult.ok) {
        res.status(200).json({
          success: true,
          data: {
            connect: connectResult,
            crawl: null,
            authenticateCheck: null,
            message: 'Connection failed; crawl skipped.',
          },
        });
        return;
      }

      const crawlResult = await crawlStep(loginUrl);
      if (!crawlResult.ok) {
        res.status(200).json({
          success: true,
          data: {
            connect: connectResult,
            crawl: crawlResult,
            authenticateCheck: null,
            message: 'Crawl failed; auth check skipped.',
          },
        });
        return;
      }

      const authResult = await authenticateCheckStep(loginUrl, crawlResult);

      res.status(200).json({
        success: true,
        data: {
          connect: connectResult,
          crawl: {
            ok: crawlResult.ok,
            title: crawlResult.title,
            loginForm: crawlResult.loginForm,
            navigation: crawlResult.navigation?.slice(0, 20),
            detectedFramework: crawlResult.detectedFramework,
            error: crawlResult.error,
          },
          authenticateCheck: authResult,
          message: authResult.ok ? 'Page is reachable and login appears automatable.' : authResult.error,
        },
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      });
    }
  });

  return router;
}
