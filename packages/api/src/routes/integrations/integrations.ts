import { Router, type Request, type Response } from 'express';
import { randomUUID } from 'node:crypto';
import { ObjectId } from 'mongodb';
import {
  StudentRepository,
  IngestSourceRepository,
  type IDataSource,
  type IDataSourceCredentials,
} from '@scholaracle/database';
import { ConnectorTokenService } from '@scholaracle/auth';
import type { IAuthenticatedRequest } from '../../middleware/auth';
import { encryptCredentials, decryptCredentials } from '../../utils/credentialsCipher';
import { packageSingleFile, packageMultiStudent, packageBundle, type TargetOS } from '../../services/scraper-generator/packager';
import { resolveScraperCode } from '../../services/scraper-generator/scraper-code-resolver';
import { processScraperGenerationJob, isKnownPlatform } from '../../services/scraper-generator/job-processor';
import { createHash } from 'node:crypto';
import {
  createIntegrationSchema,
  updateIntegrationSchema,
  assignStudentSchema,
  testConnectionSchema,
} from './schemas';

export interface IIntegrationsRouterConfig {
  readonly database: import('mongodb').Db;
}

function getUserId(req: Request): string | null {
  return (req as IAuthenticatedRequest).userId ?? null;
}

interface ITestResult {
  success: boolean;
  message: string;
  durationMs: number;
  details?: Record<string, unknown>;
}

/**
 * Lightweight connection test — makes a single API call to verify credentials.
 * Implemented inline (no dependency on @scholaracle/connector) to keep the API server lean.
 */
async function testConnectionForProvider(
  provider: string,
  baseUrl: string,
  credentials: {
    accessToken?: string;
    username?: string;
    password?: string;
    clientId?: string;
    clientSecret?: string;
    apiKey?: string;
  }
): Promise<ITestResult> {
  const start = Date.now();

  try {
    switch (provider) {
      case 'canvas': {
        if (!credentials.accessToken) {
          return { success: false, message: 'Canvas requires an access token', durationMs: Date.now() - start };
        }
        const res = await fetch(`${baseUrl}/api/v1/users/self`, {
          headers: { authorization: `Bearer ${credentials.accessToken}` },
        });
        if (!res.ok) {
          const text = await res.text();
          return { success: false, message: `Canvas returned HTTP ${res.status}: ${text}`, durationMs: Date.now() - start };
        }
        const user = (await res.json()) as { id: number; name: string };
        const coursesRes = await fetch(`${baseUrl}/api/v1/courses?enrollment_state=active&per_page=5`, {
          headers: { authorization: `Bearer ${credentials.accessToken}` },
        });
        const courses = coursesRes.ok ? ((await coursesRes.json()) as unknown[]) : [];
        return {
          success: true,
          message: `Connected as ${user.name} — found ${courses.length}${courses.length === 5 ? '+' : ''} courses`,
          durationMs: Date.now() - start,
          details: { userName: user.name, courseCount: courses.length },
        };
      }

      case 'google-classroom': {
        if (!credentials.accessToken) {
          return { success: false, message: 'Google Classroom requires an OAuth access token', durationMs: Date.now() - start };
        }
        const res = await fetch('https://classroom.googleapis.com/v1/courses?courseStates=ACTIVE&pageSize=5', {
          headers: { authorization: `Bearer ${credentials.accessToken}` },
        });
        if (!res.ok) {
          const text = await res.text();
          return { success: false, message: `Google Classroom returned HTTP ${res.status}: ${text}`, durationMs: Date.now() - start };
        }
        const data = (await res.json()) as { courses?: unknown[] };
        const count = data.courses?.length ?? 0;
        return {
          success: true,
          message: `Connected — found ${count} course${count !== 1 ? 's' : ''}`,
          durationMs: Date.now() - start,
          details: { courseCount: count },
        };
      }

      case 'oneroster': {
        if (!credentials.accessToken && !(credentials.clientId && credentials.clientSecret)) {
          return { success: false, message: 'OneRoster requires an access token or client credentials', durationMs: Date.now() - start };
        }
        let token = credentials.accessToken;
        if (!token && credentials.clientId && credentials.clientSecret) {
          const tokenRes = await fetch(`${baseUrl}/token`, {
            method: 'POST',
            headers: { 'content-type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
              grant_type: 'client_credentials',
              client_id: credentials.clientId,
              client_secret: credentials.clientSecret,
            }).toString(),
          });
          if (!tokenRes.ok) {
            return { success: false, message: `OAuth token exchange failed: HTTP ${tokenRes.status}`, durationMs: Date.now() - start };
          }
          const tokenData = (await tokenRes.json()) as { access_token: string };
          token = tokenData.access_token;
        }
        const res = await fetch(`${baseUrl}/orgs?limit=1`, {
          headers: { authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          const text = await res.text();
          return { success: false, message: `OneRoster returned HTTP ${res.status}: ${text}`, durationMs: Date.now() - start };
        }
        const data = (await res.json()) as { orgs?: Array<{ name?: string }> };
        const orgName = data.orgs?.[0]?.name;
        return {
          success: true,
          message: `Connected${orgName ? ` to ${orgName}` : ''}`,
          durationMs: Date.now() - start,
          details: { institutionName: orgName },
        };
      }

      case 'skyward': {
        return {
          success: false,
          message: 'Skyward test connection requires browser-based scraping and is not available via the API. Credentials will be verified during the first sync.',
          durationMs: Date.now() - start,
        };
      }

      default:
        return {
          success: false,
          message: `Test connection not supported for provider "${provider}" yet`,
          durationMs: Date.now() - start,
        };
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, message: `Connection failed: ${msg}`, durationMs: Date.now() - start };
  }
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
   * POST /api/integrations/test-connection
   * Test credentials against an LMS without persisting anything.
   * Returns success/failure with a human-readable message.
   */
  router.post('/test-connection', async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);
      if (!userId) {
        res.status(401).json({ success: false, error: 'Unauthorized' });
        return;
      }

      const parsed = testConnectionSchema.safeParse(req.body);
      if (!parsed.success) {
        const msg = parsed.error.issues.map((e: { message: string }) => e.message).join('; ');
        res.status(400).json({ success: false, error: msg });
        return;
      }
      const { provider, baseUrl, credentials } = parsed.data;

      const testResult = await testConnectionForProvider(provider, baseUrl ?? '', credentials);

      res.status(200).json(testResult);
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

  const PENDING_RECONCILIATION_COLLECTION = 'slc_pending_student_reconciliation';

  /** Collections that store studentExternalId and should get studentId set when linking reconciliation. */
  const SLC_COLLECTIONS_WITH_STUDENT = [
    'slc_assignments',
    'slc_event_series',
    'slc_event_overrides',
    'slc_courses',
    'slc_grade_snapshots',
    'slc_attendance_events',
    'slc_academic_terms',
    'slc_institutions',
    'slc_teachers',
    'slc_course_materials',
    'slc_messages',
    'slc_student_profiles',
  ];

  async function backfillStudentIdInIngestedDocs(params: {
    userId: string;
    studentExternalId: string;
    linkedStudentId: string;
  }): Promise<void> {
    const { userId, studentExternalId, linkedStudentId } = params;
    const now = new Date();
    for (const collName of SLC_COLLECTIONS_WITH_STUDENT) {
      const coll = config.database.collection(collName);
      await coll.updateMany(
        { userId, studentExternalId },
        { $set: { studentId: linkedStudentId, updatedAt: now } }
      );
    }
    const alertsColl = config.database.collection('alerts');
    await alertsColl.updateMany(
      { userId, studentId: studentExternalId },
      { $set: { studentId: linkedStudentId } }
    );
  }

  /**
   * GET /api/integrations/reconciliation/pending
   * List pending student reconciliations (students found in sync but not yet linked).
   */
  router.get('/reconciliation/pending', async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);
      if (!userId) {
        res.status(401).json({ success: false, error: 'Unauthorized' });
        return;
      }
      const coll = config.database.collection(PENDING_RECONCILIATION_COLLECTION);
      const docs = await coll
        .find({ userId, linkedStudentId: { $in: [null, undefined, ''] } })
        .sort({ createdAt: -1 })
        .toArray();
      const list = docs.map((d) => ({
        id: (d._id as ObjectId).toString(),
        sourceId: d['sourceId'],
        studentExternalId: d['studentExternalId'],
        displayName: d['displayName'] ?? d['studentExternalId'],
        createdAt: (d['createdAt'] as Date)?.toISOString?.(),
      }));
      res.status(200).json({ success: true, pending: list });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      });
    }
  });

  /**
   * POST /api/integrations/reconciliation/:id/link
   * Link a pending reconciliation to an existing student.
   */
  router.post('/reconciliation/:id/link', async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);
      if (!userId) {
        res.status(401).json({ success: false, error: 'Unauthorized' });
        return;
      }
      const pendingId = req.params['id'];
      const { studentId } = (req.body ?? {}) as { studentId?: string };
      if (!pendingId || !studentId) {
        res.status(400).json({ success: false, error: 'Missing pending id or studentId' });
        return;
      }
      const coll = config.database.collection(PENDING_RECONCILIATION_COLLECTION);
      const pending = await coll.findOne({
        _id: new ObjectId(pendingId),
        userId,
      });
      if (!pending) {
        res.status(404).json({ success: false, error: 'Pending reconciliation not found' });
        return;
      }
      const student = await studentRepository.findById(studentId);
      if (!student || student.userId?.toString() !== userId) {
        res.status(404).json({ success: false, error: 'Student not found' });
        return;
      }
      await coll.updateOne(
        { _id: new ObjectId(pendingId), userId },
        { $set: { linkedStudentId: studentId, updatedAt: new Date() } }
      );
      const studentExternalId = pending['studentExternalId'] as string;
      if (studentExternalId) {
        await backfillStudentIdInIngestedDocs({
          userId,
          studentExternalId,
          linkedStudentId: studentId,
        });
      }
      res.status(200).json({ success: true, linkedStudentId: studentId });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      });
    }
  });

  /**
   * POST /api/integrations/reconciliation/:id/create
   * Create a new student and link to this pending reconciliation.
   */
  router.post('/reconciliation/:id/create', async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);
      if (!userId) {
        res.status(401).json({ success: false, error: 'Unauthorized' });
        return;
      }
      const pendingId = req.params['id'];
      const { name } = (req.body ?? {}) as { name?: string };
      if (!pendingId || !name?.trim()) {
        res.status(400).json({ success: false, error: 'Missing pending id or name' });
        return;
      }
      const coll = config.database.collection(PENDING_RECONCILIATION_COLLECTION);
      const pending = await coll.findOne({
        _id: new ObjectId(pendingId),
        userId,
      });
      if (!pending) {
        res.status(404).json({ success: false, error: 'Pending reconciliation not found' });
        return;
      }
      const studentExternalId = pending['studentExternalId'] as string;
      const created = await studentRepository.create({
        userId: new ObjectId(userId),
        name: name.trim(),
        studentId: studentExternalId,
      });
      const linkedId = created._id?.toString() ?? '';
      await coll.updateOne(
        { _id: new ObjectId(pendingId), userId },
        { $set: { linkedStudentId: linkedId, updatedAt: new Date() } }
      );
      await backfillStudentIdInIngestedDocs({
        userId,
        studentExternalId,
        linkedStudentId: linkedId,
      });
      res.status(201).json({
        success: true,
        student: {
          id: linkedId,
          name: created.name,
          studentId: created.studentId,
        },
        linkedStudentId: linkedId,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      });
    }
  });

  // -------------------------------------------------------------------------
  // Server-Side Scraper Generation (registered before /:id so /generate-status is matched)
  // -------------------------------------------------------------------------

  const generatedScrapersCollection = config.database.collection('generated_scrapers');
  const scraperGenerationJobsCollection = config.database.collection('scraper_generation_jobs');

  const defaultSteps = [
    { name: 'connect', status: 'pending' as const, details: null },
    { name: 'crawl', status: 'pending' as const, details: null },
    { name: 'authenticate_check', status: 'pending' as const, details: null },
    { name: 'generate', status: 'pending' as const, details: null },
    { name: 'validate', status: 'pending' as const, details: null },
  ];

  /**
   * POST /api/integrations/generate-scraper
   * Queue a generation job for unknown platforms; return cached/reference for known/cached.
   */
  router.post('/generate-scraper', async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);
      if (!userId) {
        res.status(401).json({ success: false, error: 'Unauthorized' });
        return;
      }

      const { platformName, loginUrl, loginMethod } = req.body ?? {};
      if (!platformName || !loginUrl || !loginMethod) {
        res.status(400).json({ success: false, error: 'Missing required fields: platformName, loginUrl, loginMethod' });
        return;
      }

      const cacheKey = createHash('sha256').update(`${platformName}|${loginUrl}`).digest('hex');

      if (isKnownPlatform(platformName)) {
        res.status(200).json({
          success: true,
          scraperId: null,
          jobId: null,
          platformName,
          fromCache: true,
          knownPlatform: true,
          code: {
            scraper: `// Reference scraper for ${platformName}`,
            transformer: `// Reference transformer for ${platformName}`,
            metadata: JSON.stringify({ id: `${platformName}-browser`, name: platformName, version: '1.0.0' }, null, 2),
          },
        });
        return;
      }

      const cached = await generatedScrapersCollection.findOne({
        cacheKey,
        createdAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60_000) },
      });

      if (cached) {
        res.status(200).json({
          success: true,
          scraperId: cached['_id'].toString(),
          jobId: null,
          platformName,
          fromCache: true,
          code: {
            scraper: cached['scraperCode'],
            transformer: cached['transformerCode'],
            metadata: cached['metadata'],
          },
        });
        return;
      }

      const jobId = randomUUID();
      const now = new Date();
      await scraperGenerationJobsCollection.insertOne({
        jobId,
        userId,
        platformName,
        loginUrl,
        cacheKey,
        status: 'queued',
        createdAt: now,
        updatedAt: now,
        steps: defaultSteps,
        result: null,
        error: null,
        retryCount: 0,
      });

      setImmediate(() => {
        processScraperGenerationJob(config.database, jobId).catch((err) => {
          console.error('[scraper-generation] job failed:', jobId, err);
        });
      });

      res.status(200).json({
        success: true,
        scraperId: null,
        jobId,
        platformName,
        fromCache: false,
        status: 'queued',
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      });
    }
  });

  /**
   * GET /api/integrations/generate-status?jobId=...
   * Poll job status for dashboard real-time progress.
   */
  router.get('/generate-status', async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);
      if (!userId) {
        res.status(401).json({ success: false, error: 'Unauthorized' });
        return;
      }
      const jobId = req.query['jobId'] as string | undefined;
      if (!jobId) {
        res.status(400).json({ success: false, error: 'Missing jobId' });
        return;
      }
      const job = await scraperGenerationJobsCollection.findOne({ jobId, userId });
      if (!job) {
        res.status(404).json({ success: false, error: 'Job not found' });
        return;
      }
      res.status(200).json({
        success: job['status'] === 'ready' || job['status'] === 'failed',
        jobId: job['jobId'],
        status: job['status'],
        steps: job['steps'],
        result: job['result'] ?? undefined,
        error: job['error'] ?? undefined,
        platformName: job['platformName'],
        loginUrl: job['loginUrl'],
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      });
    }
  });

  /**
   * POST /api/integrations/scraper-report
   * Script phones home on failure for auto-regeneration tracking.
   */
  const scraperReportsCollection = config.database.collection('scraper_reports');

  router.post('/scraper-report', async (req: Request, res: Response) => {
    try {
      const body = req.body ?? {};
      const { cacheKey, status, error: reportError, generatedAt } = body as {
        cacheKey?: string;
        status?: string;
        error?: string;
        generatedAt?: string;
      };
      if (!cacheKey || status !== 'failed') {
        res.status(200).json({ success: true });
        return;
      }
      await scraperReportsCollection.insertOne({
        cacheKey,
        status: 'failed',
        error: (reportError ?? '').slice(0, 500),
        generatedAt: generatedAt ? new Date(generatedAt) : new Date(),
        reportedAt: new Date(),
      });
      res.status(200).json({ success: true });
    } catch {
      res.status(200).json({ success: true });
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
      if (!student || !student.hasAccess(userId)) {
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
      if (!student || !student.hasAccess(userId)) {
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

  // -------------------------------------------------------------------------
  // Scraper Token Management
  // -------------------------------------------------------------------------

  const connectorTokenService = new ConnectorTokenService(undefined, '365d');
  const revokedTokensCollection = config.database.collection('revoked_connector_tokens');

  /**
   * POST /api/integrations/scraper-token
   * Generate a new scraper connector token (1yr expiry).
   * Revokes any previous scraper token for this user.
   */
  router.post('/scraper-token', async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);
      if (!userId) {
        res.status(401).json({ success: false, error: 'Unauthorized' });
        return;
      }

      // Revoke previous scraper token(s) for this user
      await revokedTokensCollection.updateMany(
        { userId, tokenPurpose: 'scraper' },
        { $set: { revokedAt: new Date() } },
      );

      // Generate new token
      const jti = randomUUID();
      const token = connectorTokenService.createToken(userId, jti);

      // Record the token for future revocation tracking
      await revokedTokensCollection.insertOne({
        userId,
        jti,
        tokenPurpose: 'scraper',
        createdAt: new Date(),
        revokedAt: null,
      });

      res.status(200).json({
        success: true,
        token,
        jti,
        expiresIn: '365 days',
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      });
    }
  });

  /**
   * GET /api/integrations/scraper-token
   * Get current scraper token status (active/expiring/expired/none).
   */
  router.get('/scraper-token', async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);
      if (!userId) {
        res.status(401).json({ success: false, error: 'Unauthorized' });
        return;
      }

      const tokenDoc = await revokedTokensCollection.findOne(
        { userId, tokenPurpose: 'scraper', revokedAt: null },
        { sort: { createdAt: -1 } },
      );

      if (!tokenDoc) {
        res.status(200).json({ success: true, status: 'none' });
        return;
      }

      res.status(200).json({
        success: true,
        status: 'active',
        createdAt: tokenDoc['createdAt'],
        jti: tokenDoc['jti'],
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      });
    }
  });

  /**
   * DELETE /api/integrations/scraper-token
   * Revoke the current scraper token.
   */
  router.delete('/scraper-token', async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);
      if (!userId) {
        res.status(401).json({ success: false, error: 'Unauthorized' });
        return;
      }

      const result = await revokedTokensCollection.updateMany(
        { userId, tokenPurpose: 'scraper', revokedAt: null },
        { $set: { revokedAt: new Date() } },
      );

      res.status(200).json({
        success: true,
        revoked: result.modifiedCount,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      });
    }
  });

  /**
   * GET /api/integrations/scraper-script
   * Download a personalized setup script with the user's token baked in.
   */
  router.get('/scraper-script', async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);
      if (!userId) {
        res.status(401).json({ success: false, error: 'Unauthorized' });
        return;
      }

      // Generate a fresh token for the script
      const jti = randomUUID();
      const token = connectorTokenService.createToken(userId, jti);

      // Revoke previous + record new
      await revokedTokensCollection.updateMany(
        { userId, tokenPurpose: 'scraper' },
        { $set: { revokedAt: new Date() } },
      );
      await revokedTokensCollection.insertOne({
        userId,
        jti,
        tokenPurpose: 'scraper',
        createdAt: new Date(),
        revokedAt: null,
      });

      const apiBaseUrl = process.env['API_BASE_URL'] ?? 'https://api.scholarmancy.com';

      const script = `#!/bin/bash
# Scholaracle Scraper Setup Script
# Generated for your account — do not share this file.
# Token expires in 365 days.

set -e

echo ""
echo "  Scholaracle Scraper Setup"
echo "  ─────────────────────────"
echo ""

# Check Node.js
if ! command -v node &> /dev/null; then
  echo "  ✗ Node.js is not installed."
  echo "  Install it from https://nodejs.org/ (v18 or later)"
  exit 1
fi
echo "  ✓ Node.js $(node -v) detected"

# Install scholaracle-scraper
echo "  Installing scholaracle-scraper..."
npm install -g scholaracle-scraper 2>/dev/null || npm install scholaracle-scraper
echo "  ✓ Installed"

# Write config
CONFIG_DIR="$HOME/.scholaracle-scraper"
mkdir -p "$CONFIG_DIR"
cat > "$CONFIG_DIR/config.json" << 'CONFIGEOF'
{
  "apiBaseUrl": "${apiBaseUrl}",
  "connectorToken": "${token}"
}
CONFIGEOF
echo "  ✓ Configuration saved to $CONFIG_DIR/config.json"

echo ""
echo "  You're all set! Next steps:"
echo "    npx scholaracle-scraper run         → Run a scraper"
echo "    npx scholaracle-scraper generate    → Create a custom scraper with AI"
echo "    npx scholaracle-scraper schedule    → Set up automatic runs"
echo ""
`;

      res.setHeader('Content-Type', 'application/x-sh');
      res.setHeader('Content-Disposition', 'attachment; filename="scholaracle-setup.sh"');
      res.status(200).send(script);
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      });
    }
  });

  /**
   * POST /api/integrations/scraper-download
   * Download a single-file scraper (.command for Mac, .bat for Windows).
   * Body: { os, scraperId?, platform?, url?, credentials? } for single-platform.
   * Body: { os, students?: [{ studentId, studentName, platforms: [{ platform, loginUrl, scraperId?, credentials }] }] } for multi.
   * If students is omitted, server builds from all user's students and their dataSources (self-hosted).
   */
  router.post('/scraper-download', async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);
      if (!userId) {
        res.status(401).json({ success: false, error: 'Unauthorized' });
        return;
      }

      const body = req.body ?? {};
      const os = body.os === 'windows' ? 'windows' : 'mac' as TargetOS;
      const apiBaseUrl = process.env['API_BASE_URL'] ?? 'https://api.scholarmancy.com';

      const jti = randomUUID();
      const token = connectorTokenService.createToken(userId, jti);

      // Bundle: body.connections array (connection-centric, one script for multiple platforms)
      const bodyConnections = body.connections as Array<{
        platformId: string;
        platformName: string;
        loginUrl: string;
        scraperId?: string | null;
        credentials: { username?: string; password?: string; studentNameHint?: string };
      }> | undefined;
      if (Array.isArray(bodyConnections) && bodyConnections.length > 0) {
        // Revoke only previous bundle-download tokens for this user (not single-platform scraper tokens)
        await revokedTokensCollection.updateMany(
          { userId, tokenPurpose: 'scraper-bundle' },
          { $set: { revokedAt: new Date() } },
        );
        await revokedTokensCollection.insertOne({
          userId, jti, tokenPurpose: 'scraper-bundle', createdAt: new Date(), revokedAt: null,
        });

        const generatedScrapersCollection = config.database.collection('generated_scrapers');
        const resolvedConnections = await Promise.all(
          bodyConnections.map(async (c) => {
            const platformId = c.platformId ?? c.platformName?.toLowerCase().replace(/[^a-z0-9]+/g, '-') ?? 'custom';
            const platformName = c.platformName ?? 'Custom';
            const loginUrl = c.loginUrl ?? '';
            const scraper = await resolveScraperCode(generatedScrapersCollection, {
              scraperId: c.scraperId ?? null,
              platformName,
              loginUrl,
            });
            return {
              platformId,
              platformName,
              loginUrl,
              credentials: {
                username: c.credentials?.username ?? '',
                password: c.credentials?.password ?? '',
                studentNameHint: c.credentials?.studentNameHint,
              },
              scraper,
            };
          })
        );
        const script = packageBundle({
          connectorToken: token,
          apiBaseUrl,
          os,
          connections: resolvedConnections,
        });
        const ext = os === 'windows' ? '.bat' : '.command';
        res.setHeader('Content-Type', os === 'windows' ? 'application/x-bat' : 'application/x-sh');
        res.setHeader('Content-Disposition', `attachment; filename="scholaracle-bundle${ext}"`);
        res.status(200).send(script);
        return;
      }

      // Single-platform and multi-student: revoke previous scraper tokens
      await revokedTokensCollection.updateMany(
        { userId, tokenPurpose: 'scraper' },
        { $set: { revokedAt: new Date() } },
      );
      await revokedTokensCollection.insertOne({
        userId, jti, tokenPurpose: 'scraper', createdAt: new Date(), revokedAt: null,
      });

      // Multi-student: body.students array or build from DB (useAllStudents / no platform)
      const bodyStudents = body.students as Array<{
        studentId: string;
        studentName: string;
        platforms: Array<{
          platform: string;
          loginUrl: string;
          scraperId?: string;
          credentials: { studentName?: string; username?: string; password?: string };
        }>;
      }> | undefined;
      const useAllStudents = body.useAllStudents === true;

      if (useAllStudents || (Array.isArray(bodyStudents) && bodyStudents.length > 0)) {
        let studentsForMulti: Array<{
          studentId: string;
          studentName: string;
          platforms: Array<{
            studentId: string;
            studentName: string;
            platform: string;
            loginUrl: string;
            credentials: { studentName: string; username: string; password: string };
          }>;
        }>;

        if (Array.isArray(bodyStudents) && bodyStudents.length > 0) {
          studentsForMulti = bodyStudents.map((s) => ({
            studentId: s.studentId,
            studentName: s.studentName,
            platforms: s.platforms.map((p) => ({
              studentId: s.studentId,
              studentName: s.studentName,
              platform: p.platform,
              loginUrl: p.loginUrl,
              credentials: {
                studentName: p.credentials?.studentName ?? s.studentName,
                username: p.credentials?.username ?? '',
                password: p.credentials?.password ?? '',
              },
            })),
          }));
        } else {
          const students = await studentRepository.findByUserId(userId);
          studentsForMulti = [];
          for (const student of students) {
            const platforms: Array<{ studentId: string; studentName: string; platform: string; loginUrl: string; credentials: { studentName: string; username: string; password: string } }> = [];
            for (const ds of student.dataSources) {
              const ingestSource = await ingestSourceRepository.findByUserIdAndSourceId(userId, ds.id);
              if (!ingestSource?.portalBaseUrl) continue;
              let username = '';
              let password = '';
              if (ds.credentials?.encrypted && ds.credentials?.iv) {
                const plain = decryptCredentials({ encrypted: ds.credentials.encrypted, iv: ds.credentials.iv });
                if (plain) {
                  try {
                    const creds = JSON.parse(plain) as { username?: string; password?: string };
                    username = creds.username ?? '';
                    password = creds.password ?? '';
                  } catch {
                    // ignore
                  }
                }
              }
              platforms.push({
                studentId: student._id?.toString() ?? '',
                studentName: student.name,
                platform: ingestSource.provider,
                loginUrl: ingestSource.portalBaseUrl,
                credentials: { studentName: student.name, username, password },
              });
            }
            if (platforms.length > 0) {
              studentsForMulti.push({
                studentId: student._id?.toString() ?? '',
                studentName: student.name,
                platforms,
              });
            }
          }
        }

        if (studentsForMulti.length === 0) {
          res.status(400).json({ success: false, error: 'No students or platforms configured. Add data sources on student pages first.' });
          return;
        }

        const script = packageMultiStudent({
          connectorToken: token,
          apiBaseUrl,
          os,
          students: studentsForMulti,
        });
        const ext = os === 'windows' ? '.bat' : '.command';
        res.setHeader('Content-Type', os === 'windows' ? 'application/x-bat' : 'application/x-sh');
        res.setHeader('Content-Disposition', `attachment; filename="scholaracle-sync${ext}"`);
        res.status(200).send(script);
        return;
      }

      // Single-platform (existing flow)
      const platformName = body.platform as string | undefined;
      const scraperId = body.scraperId as string | undefined;
      const credentials = body.credentials as { studentName?: string; username?: string; password?: string } | undefined;

      let scraperCode: { scraperCode: string; transformerCode: string; metadata: string } | null = null;
      let resolvedPlatformName = platformName ?? 'custom';
      let resolvedLoginUrl = '';

      if (scraperId) {
        const { ObjectId } = await import('mongodb');
        const doc = await generatedScrapersCollection.findOne({ _id: new ObjectId(scraperId) });
        if (!doc) {
          res.status(404).json({ success: false, error: 'Scraper not found' });
          return;
        }
        scraperCode = {
          scraperCode: doc['scraperCode'] as string,
          transformerCode: doc['transformerCode'] as string,
          metadata: doc['metadata'] as string,
        };
        resolvedPlatformName = doc['platformName'] as string;
        resolvedLoginUrl = doc['loginUrl'] as string;
      } else if (platformName) {
        resolvedLoginUrl = (req.query['url'] as string) ?? (body.url as string) ?? '';
        scraperCode = {
          scraperCode: `// Reference scraper for ${platformName}\n// This uses the built-in ${platformName} scraper from the Scholaracle library.`,
          transformerCode: `// Reference transformer for ${platformName}`,
          metadata: JSON.stringify({
            id: `${platformName.toLowerCase()}-browser`,
            name: platformName,
            version: '1.0.0',
            description: `Scrapes student data from ${platformName}`,
          }, null, 2),
        };
      }

      if (!scraperCode) {
        res.status(400).json({ success: false, error: 'Either scraperId, platformName, or students array is required' });
        return;
      }

      const script = packageSingleFile({
        connectorToken: token,
        apiBaseUrl,
        platformName: resolvedPlatformName,
        loginUrl: resolvedLoginUrl || '',
        scraper: scraperCode,
        os,
        credentials: credentials ? {
          studentName: credentials.studentName ?? '',
          username: credentials.username ?? '',
          password: credentials.password ?? '',
        } : undefined,
      });

      const ext = os === 'windows' ? '.bat' : '.command';
      const fileName = `scholaracle-${resolvedPlatformName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}${ext}`;
      res.setHeader('Content-Type', os === 'windows' ? 'application/x-bat' : 'application/x-sh');
      res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
      res.status(200).send(script);
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      });
    }
  });

  return router;
}
