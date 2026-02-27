/**
 * Sync API routes — trigger and monitor data-source sync jobs.
 *
 * POST /api/sync/students/:studentId          — sync all sources for a student NOW
 * POST /api/sync/students/:studentId/:dsIndex — sync one data source NOW
 * GET  /api/sync/students/:studentId/runs     — list recent sync runs
 * GET  /api/sync/runs/:runId                  — get one run's status
 */

import { Router, type Request, type Response } from 'express';
import { ObjectId } from 'mongodb';
import type { IAuthenticatedRequest } from '../../middleware/auth';

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
    return res.json({
      success: true,
      message: `Enqueued ${jobIds.length} sync job(s)`,
      jobIds,
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
      baseUrl: ds.config?.institutionUrl ?? '',
      userId,
    });

    return res.json({ success: true, jobId });
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

  return router;
}
