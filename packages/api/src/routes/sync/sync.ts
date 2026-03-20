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
import type { IAuthenticatedRequest } from '../../middleware/auth';
import { MongoQueue } from '@scholaracle/agents';

export interface ISyncRouterConfig {
  readonly database: import('mongodb').Db;
  readonly syncScheduler: import('@scholaracle/agents').SyncScheduler;
}

function getUserId(req: Request): string | null {
  return (req as IAuthenticatedRequest).userId ?? null;
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
  router.post('/students/:studentId', async (req: Request, res: Response) => {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });

    const { studentId } = req.params;
    if (!ObjectId.isValid(studentId!)) {
      return res.status(400).json({ error: 'Invalid student ID' });
    }

    const student = await students.findOne({ _id: new ObjectId(studentId) });
    if (!student) return res.status(404).json({ error: 'Student not found' });

    // Access check
    const ownerId = student['userId']?.toString();
    const shared = (student['sharedWith'] as Array<{ userId?: string; status?: string }>) ?? [];
    const hasAccess =
      ownerId === userId || shared.some((s) => s.userId === userId && s.status === 'accepted');
    if (!hasAccess) return res.status(403).json({ error: 'Access denied' });

    const dataSources = (student['dataSources'] ?? []) as Array<{
      pluginId: string;
      config?: { institutionUrl?: string };
      enabled?: boolean;
    }>;

    if (dataSources.length === 0) {
      return res.status(400).json({ error: 'Student has no data sources configured' });
    }

    const jobIds = await syncScheduler.triggerAllForStudent(studentId!, userId, dataSources);

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

    return res.json({
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
  });

  // -----------------------------------------------------------------------
  // POST /api/sync/students/:studentId/:dsIndex — sync ONE data source NOW
  // -----------------------------------------------------------------------
  router.post('/students/:studentId/:dsIndex', async (req: Request, res: Response) => {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });

    const { studentId, dsIndex } = req.params;
    if (!ObjectId.isValid(studentId!)) {
      return res.status(400).json({ error: 'Invalid student ID' });
    }
    const idx = parseInt(dsIndex!, 10);
    if (isNaN(idx) || idx < 0) {
      return res.status(400).json({ error: 'Invalid data source index' });
    }

    const student = await students.findOne({ _id: new ObjectId(studentId) });
    if (!student) return res.status(404).json({ error: 'Student not found' });

    const ownerId = student['userId']?.toString();
    const shared = (student['sharedWith'] as Array<{ userId?: string; status?: string }>) ?? [];
    const hasAccess =
      ownerId === userId || shared.some((s) => s.userId === userId && s.status === 'accepted');
    if (!hasAccess) return res.status(403).json({ error: 'Access denied' });

    const dataSources = (student['dataSources'] ?? []) as Array<{
      id?: string;
      pluginId: string;
      config?: { institutionUrl?: string };
      baseUrl?: string;
      enabled?: boolean;
    }>;
    const ds = dataSources[idx];
    if (!ds) return res.status(404).json({ error: `Data source at index ${idx} not found` });

    const provider = ds.pluginId.split('::')[0] ?? ds.pluginId;
    const jobId = await syncScheduler.triggerNow({
      studentId: studentId!,
      dataSourceIndex: idx,
      provider,
      adapterId: ds.pluginId,
      baseUrl: ds.config?.institutionUrl ?? ds.baseUrl ?? '',
      userId,
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

    return res.json({
      success: true,
      jobId,
      queue: {
        position,
        depth: stats.pending,
        estimatedWaitMs,
        workerCount: activeWorkers.length,
      },
    });
  });

  // -----------------------------------------------------------------------
  // GET /api/sync/students/:studentId/runs — recent sync runs
  // -----------------------------------------------------------------------
  router.get('/students/:studentId/runs', async (req: Request, res: Response) => {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });

    const { studentId } = req.params;
    if (!ObjectId.isValid(studentId!)) {
      return res.status(400).json({ error: 'Invalid student ID' });
    }

    const limit = Math.min(parseInt(req.query['limit'] as string, 10) || 20, 100);

    const runs = await syncRuns
      .find({ studentId, userId })
      .sort({ createdAt: -1 })
      .limit(limit)
      .toArray();

    return res.json({ runs });
  });

  // -----------------------------------------------------------------------
  // GET /api/sync/runs/:runId — single run status
  // -----------------------------------------------------------------------
  router.get('/runs/:runId', async (req: Request, res: Response) => {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });

    const { runId } = req.params;
    if (!ObjectId.isValid(runId!)) {
      return res.status(400).json({ error: 'Invalid run ID' });
    }

    const run = await syncRuns.findOne({ _id: new ObjectId(runId), userId });
    if (!run) return res.status(404).json({ error: 'Sync run not found' });

    return res.json({ run });
  });

  // -----------------------------------------------------------------------
  // GET /api/sync/capacity — queue depth + worker capacity overview
  // -----------------------------------------------------------------------
  router.get('/capacity', async (_req: Request, res: Response) => {
    const [queueStats, workers] = await Promise.all([
      queue.getStatsByType('sync'),
      heartbeats.find({}).toArray(),
    ]);

    const totalSlots = workers.reduce((sum, w) => sum + ((w['syncConcurrency'] as number) ?? 0), 0);
    const activeJobs = workers.reduce((sum, w) => sum + ((w['activeSyncJobs'] as number) ?? 0), 0);
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

    return res.json({
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
  });

  // -----------------------------------------------------------------------
  // GET /api/sync/jobs/:jobId/position — position of a specific job in queue
  // -----------------------------------------------------------------------
  router.get('/jobs/:jobId/position', async (req: Request, res: Response) => {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });

    const { jobId } = req.params;
    if (!ObjectId.isValid(jobId!)) {
      return res.status(400).json({ error: 'Invalid job ID' });
    }

    const position = await queue.getJobPosition(jobId!);
    const stats = await queue.getStatsByType('sync');

    // Estimate wait: jobs ahead * avg duration / total parallelism
    const workers = await heartbeats.find({}).toArray();
    const totalSlots = workers.reduce((sum, w) => sum + ((w['syncConcurrency'] as number) ?? 0), 0);
    const parallelism = Math.max(1, totalSlots);
    const estimatedWaitMs =
      position > 0 ? Math.round((position * stats.avgDurationMs) / parallelism) : 0;

    return res.json({
      jobId,
      position,
      estimatedWaitMs,
      queueDepth: stats.pending,
    });
  });

  return router;
}
