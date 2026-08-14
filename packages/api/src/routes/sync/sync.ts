/**
 * Sync API routes — trigger and monitor data-source sync jobs.
 *
 * POST /api/sync/students/:studentId          — sync all sources for a student NOW
 * POST /api/sync/students/:studentId/:dsIndex — sync one data source NOW
 * GET  /api/sync/students/:studentId/runs     — list recent sync runs
 * GET  /api/sync/runs/:runId                  — get one run's status
 * GET  /api/sync/capacity                     — queue depth + worker capacity
 */

import { Router, type Request, type Response } from 'express';
import { ObjectId } from 'mongodb';
import {
  AuthenticationError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '@scholaracle/contracts';
import { asyncHandler } from '../../middleware/asyncHandler';
import type { IAuthenticatedRequest } from '../../middleware/auth';
import { MongoQueue } from '@scholaracle/agents';

export interface ISyncRouterConfig {
  readonly database: import('mongodb').Db;
  readonly syncScheduler: import('@scholaracle/agents').SyncScheduler;
}

function getUserId(req: Request): string | null {
  return (req as IAuthenticatedRequest).userId ?? null;
}

function requireUserId(req: Request): string {
  const userId = getUserId(req);
  if (!userId) throw new AuthenticationError('Not authenticated');
  return userId;
}

export function createSyncRouter(config: ISyncRouterConfig): Router {
  const router = Router();
  const { database, syncScheduler } = config;
  const students = database.collection('students');
  const syncRuns = database.collection('sync_runs');
  const queue = new MongoQueue(database);
  const heartbeats = database.collection('worker_heartbeats');

  // -----------------------------------------------------------------------
  // POST /api/sync/students/:studentId — sync ALL data sources NOW
  // -----------------------------------------------------------------------
  router.post(
    '/students/:studentId',
    asyncHandler(async (req: Request, res: Response) => {
      const userId = requireUserId(req);

      const { studentId } = req.params;
      if (!ObjectId.isValid(studentId!)) {
        throw new ValidationError('Invalid student ID');
      }

      const student = await students.findOne({ _id: new ObjectId(studentId) });
      if (!student) throw new NotFoundError('Student not found');

      // Access check
      const ownerId = student['userId']?.toString();
      const shared = (student['sharedWith'] as Array<{ userId?: string; status?: string }>) ?? [];
      const hasAccess =
        ownerId === userId || shared.some((s) => s.userId === userId && s.status === 'accepted');
      if (!hasAccess) throw new ForbiddenError('Access denied');

      const dataSources = (student['dataSources'] ?? []) as Array<{
        pluginId: string;
        config?: { institutionUrl?: string };
        enabled?: boolean;
      }>;

      if (dataSources.length === 0) {
        throw new ValidationError('Student has no data sources configured');
      }

      const jobIds = await syncScheduler.triggerAllForStudent(
        studentId!,
        ownerId!,
        dataSources,
        userId
      );

      // Fetch queue position for the first job to give the user an ETA
      const queueStats = await queue.getStatsByType('sync');
      const activeWorkers = await heartbeats.find({}).toArray();
      const totalSlots = activeWorkers.reduce(
        (sum, w) => sum + ((w['syncConcurrency'] as number) ?? 0),
        0
      );
      const parallelism = Math.max(1, totalSlots);
      const estimatedWaitMs = Math.round(
        (queueStats.pending * queueStats.avgDurationMs) / parallelism
      );

      res.json({
        success: true,
        message: `Enqueued ${jobIds.length} sync job(s)`,
        jobIds,
        queue: {
          depth: queueStats.pending,
          estimatedWaitMs,
          workerCount: activeWorkers.length,
          availableSlots: Math.max(
            0,
            totalSlots -
              activeWorkers.reduce((sum, w) => sum + ((w['activeSyncJobs'] as number) ?? 0), 0)
          ),
        },
      });
    })
  );

  // -----------------------------------------------------------------------
  // POST /api/sync/students/:studentId/:dsIndex — sync ONE data source NOW
  // -----------------------------------------------------------------------
  router.post(
    '/students/:studentId/:dsIndex',
    asyncHandler(async (req: Request, res: Response) => {
      const userId = requireUserId(req);

      const { studentId, dsIndex } = req.params;
      if (!ObjectId.isValid(studentId!)) {
        throw new ValidationError('Invalid student ID');
      }
      const idx = parseInt(dsIndex!, 10);
      if (isNaN(idx) || idx < 0) {
        throw new ValidationError('Invalid data source index');
      }

      const student = await students.findOne({ _id: new ObjectId(studentId) });
      if (!student) throw new NotFoundError('Student not found');

      const ownerId = student['userId']?.toString();
      const shared = (student['sharedWith'] as Array<{ userId?: string; status?: string }>) ?? [];
      const hasAccess =
        ownerId === userId || shared.some((s) => s.userId === userId && s.status === 'accepted');
      if (!hasAccess) throw new ForbiddenError('Access denied');

      const dataSources = (student['dataSources'] ?? []) as Array<{
        id?: string;
        pluginId: string;
        config?: { institutionUrl?: string };
        baseUrl?: string;
        enabled?: boolean;
      }>;
      const ds = dataSources[idx];
      if (!ds) throw new NotFoundError(`Data source at index ${idx} not found`);

      const provider = ds.pluginId.split('::')[0] ?? ds.pluginId;
      const jobId = await syncScheduler.triggerNow({
        studentId: studentId!,
        dataSourceIndex: idx,
        provider,
        adapterId: ds.pluginId,
        baseUrl: ds.config?.institutionUrl ?? ds.baseUrl ?? '',
        userId: ownerId!,
        triggeredByUserId: userId,
      });

      const position = await queue.getJobPosition(jobId);
      const stats = await queue.getStatsByType('sync');
      const activeWorkers = await heartbeats.find({}).toArray();
      const totalSlots = activeWorkers.reduce(
        (sum, w) => sum + ((w['syncConcurrency'] as number) ?? 0),
        0
      );
      const parallelism = Math.max(1, totalSlots);
      const estimatedWaitMs =
        position > 0 ? Math.round((position * stats.avgDurationMs) / parallelism) : 0;

      res.json({
        success: true,
        jobId,
        queue: {
          position,
          depth: stats.pending,
          estimatedWaitMs,
          workerCount: activeWorkers.length,
        },
      });
    })
  );

  // -----------------------------------------------------------------------
  // GET /api/sync/students/:studentId/runs — recent sync runs
  // -----------------------------------------------------------------------
  router.get(
    '/students/:studentId/runs',
    asyncHandler(async (req: Request, res: Response) => {
      const userId = requireUserId(req);

      const { studentId } = req.params;
      if (!ObjectId.isValid(studentId!)) {
        throw new ValidationError('Invalid student ID');
      }

      const limit = Math.min(parseInt(req.query['limit'] as string, 10) || 20, 100);

      const runs = await syncRuns
        .find({ studentId, userId })
        .sort({ createdAt: -1 })
        .limit(limit)
        .toArray();

      res.json({ runs });
    })
  );

  // -----------------------------------------------------------------------
  // GET /api/sync/runs/:runId — single run status
  // -----------------------------------------------------------------------
  router.get(
    '/runs/:runId',
    asyncHandler(async (req: Request, res: Response) => {
      const userId = requireUserId(req);

      const { runId } = req.params;
      if (!ObjectId.isValid(runId!)) {
        throw new ValidationError('Invalid run ID');
      }

      const run = await syncRuns.findOne({ _id: new ObjectId(runId), userId });
      if (!run) throw new NotFoundError('Sync run not found');

      res.json({ run });
    })
  );

  // -----------------------------------------------------------------------
  // GET /api/sync/capacity — queue depth + worker capacity overview
  // -----------------------------------------------------------------------
  router.get(
    '/capacity',
    asyncHandler(async (_req: Request, res: Response) => {
      const [queueStats, workers] = await Promise.all([
        queue.getStatsByType('sync'),
        heartbeats.find({}).toArray(),
      ]);

      const totalSlots = workers.reduce(
        (sum, w) => sum + ((w['syncConcurrency'] as number) ?? 0),
        0
      );
      const activeJobs = workers.reduce(
        (sum, w) => sum + ((w['activeSyncJobs'] as number) ?? 0),
        0
      );
      const availableSlots = Math.max(0, totalSlots - activeJobs);

      // Estimate wait time: pending jobs * avg duration / available parallelism
      const parallelism = Math.max(1, totalSlots);
      const estimatedWaitMs =
        queueStats.pending > 0
          ? Math.round((queueStats.pending * queueStats.avgDurationMs) / parallelism)
          : 0;

      const workerDetails = workers.map((w) => ({
        workerId: w['workerId'],
        syncConcurrency: w['syncConcurrency'],
        activeSyncJobs: w['activeSyncJobs'],
        memoryMB: w['memoryMB'],
        lastHeartbeat: w['lastHeartbeat'],
      }));

      res.json({
        queue: {
          pending: queueStats.pending,
          processing: queueStats.processing,
          completed: queueStats.completed,
          failed: queueStats.failed,
          avgDurationMs: queueStats.avgDurationMs,
        },
        capacity: {
          workerCount: workers.length,
          totalSlots,
          activeJobs,
          availableSlots,
          estimatedWaitMs,
        },
        workers: workerDetails,
      });
    })
  );

  // -----------------------------------------------------------------------
  // GET /api/sync/jobs/:jobId/position — position of a specific job in queue
  // -----------------------------------------------------------------------
  router.get(
    '/jobs/:jobId/position',
    asyncHandler(async (req: Request, res: Response) => {
      requireUserId(req);

      const { jobId } = req.params;
      if (!ObjectId.isValid(jobId!)) {
        throw new ValidationError('Invalid job ID');
      }

      const position = await queue.getJobPosition(jobId!);
      const stats = await queue.getStatsByType('sync');

      // Estimate wait: jobs ahead * avg duration / total parallelism
      const workers = await heartbeats.find({}).toArray();
      const totalSlots = workers.reduce(
        (sum, w) => sum + ((w['syncConcurrency'] as number) ?? 0),
        0
      );
      const parallelism = Math.max(1, totalSlots);
      const estimatedWaitMs =
        position > 0 ? Math.round((position * stats.avgDurationMs) / parallelism) : 0;

      res.json({
        jobId,
        position,
        estimatedWaitMs,
        queueDepth: stats.pending,
      });
    })
  );

  return router;
}
