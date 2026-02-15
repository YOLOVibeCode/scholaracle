import { Router, type Request, type Response } from 'express';
import { randomUUID } from 'node:crypto';
import {
  StudentRepository,
  IngestSourceRepository,
  type IDataSource,
  type IDataSourceCredentials,
} from '@scholaracle/database';
import type { IAuthenticatedRequest } from '../../middleware/auth';
import { encryptCredentials } from '../../utils/credentialsCipher';
import { createIntegrationSchema, updateIntegrationSchema, assignStudentSchema } from './schemas';

export interface IIntegrationsRouterConfig {
  readonly database: import('mongodb').Db;
}

function getUserId(req: Request): string | null {
  return (req as IAuthenticatedRequest).userId ?? null;
}

/**
 * Create integrations router.
 * Account-level integration CRUD and student assignment.
 */
export function integrationsRouter(config: IIntegrationsRouterConfig): Router {
  const router = Router();
  const studentRepository = new StudentRepository(config.database);
  const ingestSourceRepository = new IngestSourceRepository(config.database);

  /**
   * GET /api/integrations
   * List all integrations for the authenticated user.
   */
  router.get('/', async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);
      if (!userId) {
        res.status(401).json({ success: false, error: 'Unauthorized' });
        return;
      }

      const sources = await ingestSourceRepository.listByUserId(userId);
      const students = await studentRepository.findByUserId(userId);

      const list = sources.map((src) => {
        const linkedCount = students.filter((s) =>
          s.dataSources.some((ds) => ds.id === src.sourceId)
        ).length;
        return {
          id: src.sourceId,
          provider: src.provider,
          adapterId: src.adapterId,
          displayName: src.displayName,
          portalBaseUrl: src.portalBaseUrl,
          schedule: src.schedule,
          dataTypes: [...src.dataTypes],
          enabled: src.enabled,
          linkedStudents: linkedCount,
          createdAt: src.createdAt.toISOString(),
          updatedAt: src.updatedAt.toISOString(),
        };
      });

      res.status(200).json(list);
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      });
    }
  });

  /**
   * POST /api/integrations
   * Create a new integration (account-level provider).
   */
  router.post('/', async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);
      if (!userId) {
        res.status(401).json({ success: false, error: 'Unauthorized' });
        return;
      }

      const parsed = createIntegrationSchema.safeParse(req.body);
      if (!parsed.success) {
        const msg = parsed.error.issues.map((e: { message: string }) => e.message).join('; ');
        res.status(400).json({ success: false, error: msg });
        return;
      }
      const body = parsed.data;

      const sourceId = randomUUID();
      const created = await ingestSourceRepository.upsert({
        userId,
        sourceId,
        provider: body.provider,
        adapterId: body.adapterId,
        displayName: body.displayName,
        portalBaseUrl: body.portalBaseUrl,
        schedule: body.schedule,
        dataTypes: body.dataTypes,
        enabled: body.enabled ?? true,
      });

      res.status(201).json({
        id: created.sourceId,
        provider: created.provider,
        adapterId: created.adapterId,
        displayName: created.displayName,
        portalBaseUrl: created.portalBaseUrl,
        schedule: created.schedule,
        dataTypes: [...created.dataTypes],
        enabled: created.enabled,
        createdAt: created.createdAt.toISOString(),
        updatedAt: created.updatedAt.toISOString(),
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      });
    }
  });

  /**
   * GET /api/integrations/:id
   * Get one integration.
   */
  router.get('/:id', async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);
      if (!userId) {
        res.status(401).json({ success: false, error: 'Unauthorized' });
        return;
      }
      const { id: sourceId } = req.params;
      if (!sourceId) {
        res.status(400).json({ success: false, error: 'Missing integration ID' });
        return;
      }

      const src = await ingestSourceRepository.findByUserIdAndSourceId(userId, sourceId);
      if (!src) {
        res.status(404).json({ success: false, error: 'Integration not found' });
        return;
      }

      res.status(200).json({
        id: src.sourceId,
        provider: src.provider,
        adapterId: src.adapterId,
        displayName: src.displayName,
        portalBaseUrl: src.portalBaseUrl,
        schedule: src.schedule,
        dataTypes: [...src.dataTypes],
        enabled: src.enabled,
        createdAt: src.createdAt.toISOString(),
        updatedAt: src.updatedAt.toISOString(),
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      });
    }
  });

  /**
   * PUT /api/integrations/:id
   * Update integration config.
   */
  router.put('/:id', async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);
      if (!userId) {
        res.status(401).json({ success: false, error: 'Unauthorized' });
        return;
      }
      const { id: sourceId } = req.params;
      if (!sourceId) {
        res.status(400).json({ success: false, error: 'Missing integration ID' });
        return;
      }

      const parsed = updateIntegrationSchema.safeParse(req.body);
      if (!parsed.success) {
        const msg = parsed.error.issues.map((e: { message: string }) => e.message).join('; ');
        res.status(400).json({ success: false, error: msg });
        return;
      }
      const updates = parsed.data;

      const existing = await ingestSourceRepository.findByUserIdAndSourceId(userId, sourceId);
      if (!existing) {
        res.status(404).json({ success: false, error: 'Integration not found' });
        return;
      }

      const updated = await ingestSourceRepository.upsert({
        userId: existing.userId,
        sourceId: existing.sourceId,
        provider: updates.provider ?? existing.provider,
        adapterId: updates.adapterId ?? existing.adapterId,
        displayName: updates.displayName ?? existing.displayName,
        portalBaseUrl:
          updates.portalBaseUrl !== undefined ? updates.portalBaseUrl : existing.portalBaseUrl,
        schedule: updates.schedule ?? existing.schedule,
        dataTypes: updates.dataTypes ?? existing.dataTypes,
        enabled: updates.enabled !== undefined ? updates.enabled : existing.enabled,
        createdAt: existing.createdAt,
        updatedAt: new Date(),
      });

      res.status(200).json({
        id: updated.sourceId,
        provider: updated.provider,
        adapterId: updated.adapterId,
        displayName: updated.displayName,
        portalBaseUrl: updated.portalBaseUrl,
        schedule: updated.schedule,
        dataTypes: [...updated.dataTypes],
        enabled: updated.enabled,
        createdAt: updated.createdAt.toISOString(),
        updatedAt: updated.updatedAt.toISOString(),
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      });
    }
  });

  /**
   * DELETE /api/integrations/:id
   * Delete integration and unlink from all students.
   */
  router.delete('/:id', async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);
      if (!userId) {
        res.status(401).json({ success: false, error: 'Unauthorized' });
        return;
      }
      const { id: sourceId } = req.params;
      if (!sourceId) {
        res.status(400).json({ success: false, error: 'Missing integration ID' });
        return;
      }

      const existing = await ingestSourceRepository.findByUserIdAndSourceId(userId, sourceId);
      if (!existing) {
        res.status(404).json({ success: false, error: 'Integration not found' });
        return;
      }

      const students = await studentRepository.findByUserId(userId);
      const linked = students.filter((s) => s.dataSources.some((ds) => ds.id === sourceId));

      for (const student of linked) {
        const newDataSources = student.dataSources.filter((ds) => ds.id !== sourceId);
        await studentRepository.update(student._id!, { dataSources: newDataSources });
      }

      await ingestSourceRepository.deleteByUserIdAndSourceId(userId, sourceId);

      res.status(200).json({ success: true, unlinkedCount: linked.length });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      });
    }
  });

  /**
   * GET /api/integrations/:id/students
   * List students linked to this integration.
   */
  router.get('/:id/students', async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);
      if (!userId) {
        res.status(401).json({ success: false, error: 'Unauthorized' });
        return;
      }
      const { id: sourceId } = req.params;
      if (!sourceId) {
        res.status(400).json({ success: false, error: 'Missing integration ID' });
        return;
      }

      const src = await ingestSourceRepository.findByUserIdAndSourceId(userId, sourceId);
      if (!src) {
        res.status(404).json({ success: false, error: 'Integration not found' });
        return;
      }

      const students = await studentRepository.findByUserId(userId);
      const linked = students.filter((s) => s.dataSources.some((ds) => ds.id === sourceId));

      const list = linked.map((s) => {
        const ds = s.dataSources.find((d) => d.id === sourceId)!;
        return {
          studentId: s._id?.toString() ?? '',
          studentName: s.name,
          hasCredentials: Boolean(ds.credentials?.encrypted),
          enabled: ds.enabled,
          status: ds.status ?? 'active',
          lastSuccess: ds.lastSuccess?.toISOString(),
          lastError: ds.lastError ?? null,
        };
      });

      res.status(200).json(list);
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      });
    }
  });

  /**
   * POST /api/integrations/:id/students/:studentId
   * Assign integration to a student (optional credentials).
   */
  router.post('/:id/students/:studentId', async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);
      if (!userId) {
        res.status(401).json({ success: false, error: 'Unauthorized' });
        return;
      }
      const { id: sourceId, studentId } = req.params;
      if (!sourceId || !studentId) {
        res.status(400).json({ success: false, error: 'Missing integration ID or student ID' });
        return;
      }

      const bodyParsed = assignStudentSchema.safeParse(req.body || {});
      const credentials =
        bodyParsed.success && bodyParsed.data.credentials ? bodyParsed.data.credentials : undefined;

      const integration = await ingestSourceRepository.findByUserIdAndSourceId(userId, sourceId);
      if (!integration) {
        res.status(404).json({ success: false, error: 'Integration not found' });
        return;
      }

      const student = await studentRepository.findById(studentId);
      if (!student || student.userId.toString() !== userId) {
        res.status(404).json({ success: false, error: 'Student not found' });
        return;
      }

      if (student.dataSources.some((ds) => ds.id === sourceId)) {
        res
          .status(409)
          .json({ success: false, error: 'Student already linked to this integration' });
        return;
      }

      let credentialsPayload: IDataSourceCredentials | undefined;
      if (credentials) {
        const plain = JSON.stringify(credentials);
        const encrypted = encryptCredentials(plain);
        if (!encrypted) {
          res.status(503).json({
            success: false,
            error: 'Credential encryption is not configured. Set CREDENTIALS_ENCRYPTION_KEY.',
          });
          return;
        }
        credentialsPayload = { encrypted: encrypted.encrypted, iv: encrypted.iv };
      }

      const newDataSource: IDataSource = {
        id: sourceId,
        pluginId: integration.adapterId,
        enabled: true,
        credentials: credentialsPayload,
        schedule: integration.schedule,
        dataTypes: [...integration.dataTypes],
        status: 'active',
      };
      const updatedDataSources = [...student.dataSources, newDataSource];
      const updated = await studentRepository.update(studentId, {
        dataSources: updatedDataSources,
      });
      if (!updated) {
        res.status(500).json({ success: false, error: 'Failed to link student' });
        return;
      }

      res.status(201).json({
        studentId,
        integrationId: sourceId,
        hasCredentials: Boolean(credentialsPayload),
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      });
    }
  });

  /**
   * DELETE /api/integrations/:id/students/:studentId
   * Unlink student from integration (does not delete integration).
   */
  router.delete('/:id/students/:studentId', async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);
      if (!userId) {
        res.status(401).json({ success: false, error: 'Unauthorized' });
        return;
      }
      const { id: sourceId, studentId } = req.params;
      if (!sourceId || !studentId) {
        res.status(400).json({ success: false, error: 'Missing integration ID or student ID' });
        return;
      }

      const integration = await ingestSourceRepository.findByUserIdAndSourceId(userId, sourceId);
      if (!integration) {
        res.status(404).json({ success: false, error: 'Integration not found' });
        return;
      }

      const student = await studentRepository.findById(studentId);
      if (!student || student.userId.toString() !== userId) {
        res.status(404).json({ success: false, error: 'Student not found' });
        return;
      }

      const newDataSources = student.dataSources.filter((ds) => ds.id !== sourceId);
      if (newDataSources.length === student.dataSources.length) {
        res
          .status(404)
          .json({ success: false, error: 'Student is not linked to this integration' });
        return;
      }

      await studentRepository.update(studentId, { dataSources: newDataSources });

      res.status(200).json({ success: true });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      });
    }
  });

  return router;
}
