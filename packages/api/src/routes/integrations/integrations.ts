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
import {
  AuthenticationError,
  ConflictError,
  InternalError,
  NotFoundError,
  ValidationError,
  type IConnectorTokenResponse,
} from '@scholaracle/contracts';
import { asyncHandler } from '../../middleware/asyncHandler';
import type { IAuthenticatedRequest } from '../../middleware/auth';
import { encryptCredentials } from '../../utils/credentialsCipher';
import {
  createIntegrationSchema,
  updateIntegrationSchema,
  assignStudentSchema,
  testConnectionSchema,
  connectorTokenMintSchema,
  connectorTokenRevokeSchema,
} from './schemas';
import {
  mintConnectorTokenForDevice,
  revokeConnectorDevice,
} from '../../services/connectorDeviceTokens';

export interface IIntegrationsRouterConfig {
  readonly database: import('mongodb').Db;
  readonly connectorJwtSecret?: string;
}

function getUserId(req: Request): string | null {
  return (req as IAuthenticatedRequest).userId ?? null;
}

function requireUserId(req: Request): string {
  const userId = getUserId(req);
  if (!userId) throw new AuthenticationError('Unauthorized');
  return userId;
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
/* eslint-disable-next-line complexity -- provider branching is inherently complex */
async function testConnectionForProvider(
  provider: string,
  baseUrl: string,
  credentials: {
    accessToken?: string;
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
          return {
            success: false,
            message: 'Canvas requires an access token',
            durationMs: Date.now() - start,
          };
        }
        const res = await fetch(`${baseUrl}/api/v1/users/self`, {
          headers: { authorization: `Bearer ${credentials.accessToken}` },
        });
        if (!res.ok) {
          const text = await res.text();
          return {
            success: false,
            message: `Canvas returned HTTP ${res.status}: ${text}`,
            durationMs: Date.now() - start,
          };
        }
        const user = (await res.json()) as { id: number; name: string };
        const coursesRes = await fetch(
          `${baseUrl}/api/v1/courses?enrollment_state=active&per_page=5`,
          {
            headers: { authorization: `Bearer ${credentials.accessToken}` },
          }
        );
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
          return {
            success: false,
            message: 'Google Classroom requires an OAuth access token',
            durationMs: Date.now() - start,
          };
        }
        const res = await fetch(
          'https://classroom.googleapis.com/v1/courses?courseStates=ACTIVE&pageSize=5',
          {
            headers: { authorization: `Bearer ${credentials.accessToken}` },
          }
        );
        if (!res.ok) {
          const text = await res.text();
          return {
            success: false,
            message: `Google Classroom returned HTTP ${res.status}: ${text}`,
            durationMs: Date.now() - start,
          };
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
          return {
            success: false,
            message: 'OneRoster requires an access token or client credentials',
            durationMs: Date.now() - start,
          };
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
            return {
              success: false,
              message: `OAuth token exchange failed: HTTP ${tokenRes.status}`,
              durationMs: Date.now() - start,
            };
          }
          const tokenData = (await tokenRes.json()) as { access_token: string };
          token = tokenData.access_token;
        }
        const res = await fetch(`${baseUrl}/orgs?limit=1`, {
          headers: { authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          const text = await res.text();
          return {
            success: false,
            message: `OneRoster returned HTTP ${res.status}: ${text}`,
            durationMs: Date.now() - start,
          };
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
          message:
            'Skyward uses browser-based extraction on the client device. Use the mobile app, browser extension, or local CLI to connect Skyward.',
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
/* eslint-disable-next-line max-lines-per-function -- legacy router; refactor in follow-up */
export function integrationsRouter(config: IIntegrationsRouterConfig): Router {
  const router = Router();
  const studentRepository = new StudentRepository(config.database);
  const ingestSourceRepository = new IngestSourceRepository(config.database);

  /**
   * GET /api/integrations
   * List all integrations for the authenticated user.
   */
  router.get(
    '/',
    asyncHandler(async (req: Request, res: Response) => {
      const userId = requireUserId(req);

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
    })
  );

  /**
   * POST /api/integrations/test-connection
   * Test credentials against an LMS without persisting anything.
   * Returns success/failure with a human-readable message.
   */
  router.post(
    '/test-connection',
    asyncHandler(async (req: Request, res: Response) => {
      requireUserId(req);

      const parsed = testConnectionSchema.safeParse(req.body);
      if (!parsed.success) {
        throw ValidationError.fromZod(parsed.error);
      }
      const { provider, baseUrl, credentials } = parsed.data;

      const testResult = await testConnectionForProvider(provider, baseUrl ?? '', credentials);

      res.status(200).json(testResult);
    })
  );

  /**
   * POST /api/integrations
   * Create a new integration (account-level provider).
   */
  router.post(
    '/',
    asyncHandler(async (req: Request, res: Response) => {
      const userId = requireUserId(req);

      const parsed = createIntegrationSchema.safeParse(req.body);
      if (!parsed.success) {
        throw ValidationError.fromZod(parsed.error);
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
    })
  );

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
  router.get(
    '/reconciliation/pending',
    asyncHandler(async (req: Request, res: Response) => {
      const userId = requireUserId(req);
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
    })
  );

  /**
   * POST /api/integrations/reconciliation/:id/link
   * Link a pending reconciliation to an existing student.
   */
  router.post(
    '/reconciliation/:id/link',
    asyncHandler(async (req: Request, res: Response) => {
      const userId = requireUserId(req);
      const pendingId = req.params['id'];
      const { studentId } = (req.body ?? {}) as { studentId?: string };
      if (!pendingId || !studentId) {
        throw new ValidationError('Missing pending id or studentId');
      }
      const coll = config.database.collection(PENDING_RECONCILIATION_COLLECTION);
      const pending = await coll.findOne({
        _id: new ObjectId(pendingId),
        userId,
      });
      if (!pending) {
        throw new NotFoundError('Pending reconciliation not found');
      }
      const student = await studentRepository.findById(studentId);
      if (!student || student.userId?.toString() !== userId) {
        throw new NotFoundError('Student not found');
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
    })
  );

  /**
   * POST /api/integrations/reconciliation/:id/create
   * Create a new student and link to this pending reconciliation.
   */
  router.post(
    '/reconciliation/:id/create',
    asyncHandler(async (req: Request, res: Response) => {
      const userId = requireUserId(req);
      const pendingId = req.params['id'];
      const { name } = (req.body ?? {}) as { name?: string };
      if (!pendingId || !name?.trim()) {
        throw new ValidationError('Missing pending id or name');
      }
      const coll = config.database.collection(PENDING_RECONCILIATION_COLLECTION);
      const pending = await coll.findOne({
        _id: new ObjectId(pendingId),
        userId,
      });
      if (!pending) {
        throw new NotFoundError('Pending reconciliation not found');
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
    })
  );

  // -------------------------------------------------------------------------
  // Desktop scraper generation / downloads (retired — registered before /:id)
  // -------------------------------------------------------------------------

  const scraperGenerationJobsCollection = config.database.collection('scraper_generation_jobs');

  const DESKTOP_SCRAPER_RETIRED =
    'Desktop scraper downloads are retired. Connect from the Scholarmancy mobile app on your phone.';

  /**
   * POST /api/integrations/generate-scraper
   * Retired: does not enqueue jobs or consume AI quota.
   */
  router.post(
    '/generate-scraper',
    asyncHandler(async (req: Request, res: Response) => {
      requireUserId(req);

      const { platformName, loginUrl, loginMethod } = req.body ?? {};
      if (!platformName || !loginUrl || !loginMethod) {
        throw new ValidationError('Missing required fields: platformName, loginUrl, loginMethod');
      }

      res.status(410).json({
        success: false,
        error: DESKTOP_SCRAPER_RETIRED,
      });
    })
  );

  /**
   * GET /api/integrations/generate-status?jobId=...
   * Poll job status for dashboard real-time progress.
   */
  router.get(
    '/generate-status',
    asyncHandler(async (req: Request, res: Response) => {
      const userId = requireUserId(req);
      const jobId = req.query['jobId'] as string | undefined;
      if (!jobId) {
        throw new ValidationError('Missing jobId');
      }
      const job = await scraperGenerationJobsCollection.findOne({ jobId, userId });
      if (!job) {
        throw new NotFoundError('Job not found');
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
    })
  );

  /**
   * POST /api/integrations/scraper-report
   * Script phones home on failure for auto-regeneration tracking.
   */
  const scraperReportsCollection = config.database.collection('scraper_reports');

  router.post(
    '/scraper-report',
    asyncHandler(async (req: Request, res: Response) => {
      // Deliberately always returns 200 — phone-home must never fail the script.
      try {
        const body = req.body ?? {};
        const {
          cacheKey,
          status,
          error: reportError,
          generatedAt,
        } = body as {
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
    })
  );

  // -------------------------------------------------------------------------
  // Scraper Token Management (must come BEFORE /:id to avoid route collision)
  // -------------------------------------------------------------------------

  const connectorTokenService = new ConnectorTokenService(config.connectorJwtSecret);

  /**
   * POST /api/integrations/scraper-token
   * Mint a per-device connector token (≤90d). Does not revoke other devices.
   */
  router.post(
    '/scraper-token',
    asyncHandler(async (req: Request, res: Response) => {
      const userId = requireUserId(req);
      const parsed = connectorTokenMintSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        throw new ValidationError(parsed.error.issues[0]?.message ?? 'Invalid body');
      }
      const body = await mintConnectorTokenForDevice({
        database: config.database,
        connectorTokenService,
        userId,
        deviceId: parsed.data.deviceId.trim(),
      });
      res.status(200).json(body satisfies IConnectorTokenResponse);
    })
  );

  /**
   * POST /api/integrations/scraper-token/refresh
   * Rotate the connector token for one device (parent session).
   */
  router.post(
    '/scraper-token/refresh',
    asyncHandler(async (req: Request, res: Response) => {
      const userId = requireUserId(req);
      const parsed = connectorTokenMintSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        throw new ValidationError(parsed.error.issues[0]?.message ?? 'Invalid body');
      }
      const body = await mintConnectorTokenForDevice({
        database: config.database,
        connectorTokenService,
        userId,
        deviceId: parsed.data.deviceId.trim(),
      });
      res.status(200).json(body satisfies IConnectorTokenResponse);
    })
  );

  /**
   * GET /api/integrations/scraper-token
   * Get current scraper token status (active/expiring/expired/none).
   */
  const revokedTokensCollection = config.database.collection('revoked_connector_tokens');

  router.get(
    '/scraper-token',
    asyncHandler(async (req: Request, res: Response) => {
      const userId = requireUserId(req);

      const tokenDoc = await revokedTokensCollection.findOne(
        { userId, tokenPurpose: 'scraper', revokedAt: null },
        { sort: { createdAt: -1 } }
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
    })
  );

  /**
   * DELETE /api/integrations/scraper-token
   * Revoke the connector token for one device.
   */
  router.delete(
    '/scraper-token',
    asyncHandler(async (req: Request, res: Response) => {
      const userId = requireUserId(req);
      const parsed = connectorTokenRevokeSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        throw new ValidationError(parsed.error.issues[0]?.message ?? 'Invalid body');
      }
      const wasRevoked = await revokeConnectorDevice({
        database: config.database,
        userId,
        deviceId: parsed.data.deviceId.trim(),
      });
      res.status(200).json({ success: true, revoked: wasRevoked });
    })
  );

  /**
   * GET /api/integrations/sync-requests/pending
   * Parent sync requests not yet fulfilled (client-led sync).
   */
  router.get(
    '/sync-requests/pending',
    asyncHandler(async (req: Request, res: Response) => {
      const userId = requireUserId(req);
      const rows = await config.database
        .collection('sync_requests')
        .find({ requestedByUserId: userId, fulfilledAt: null })
        .sort({ createdAt: -1 })
        .toArray();
      res.status(200).json({
        success: true,
        pending: rows.map((row) => ({
          syncRequestId: row['syncRequestId'] as string,
          studentId: row['studentId'] as string,
          sourceId: row['sourceId'] as string,
          createdAt: (row['createdAt'] as Date).toISOString(),
        })),
      });
    })
  );

  /**
   * GET /api/integrations/scraper-script
   * Retired.
   */
  router.get(
    '/scraper-script',
    asyncHandler(async (req: Request, res: Response) => {
      requireUserId(req);
      res.status(410).json({
        success: false,
        error: DESKTOP_SCRAPER_RETIRED,
      });
    })
  );

  /**
   * POST /api/integrations/scraper-download
   * Retired.
   */
  router.post(
    '/scraper-download',
    asyncHandler(async (req: Request, res: Response) => {
      requireUserId(req);
      res.status(410).json({
        success: false,
        error: DESKTOP_SCRAPER_RETIRED,
      });
    })
  );

  /**
   * GET /api/integrations/:id
   * Get one integration.
   */
  router.get(
    '/:id',
    asyncHandler(async (req: Request, res: Response) => {
      const userId = requireUserId(req);
      const { id: sourceId } = req.params;
      if (!sourceId) {
        throw new ValidationError('Missing integration ID');
      }

      const src = await ingestSourceRepository.findByUserIdAndSourceId(userId, sourceId);
      if (!src) {
        throw new NotFoundError('Integration not found');
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
    })
  );

  /**
   * PUT /api/integrations/:id
   * Update integration config.
   */
  router.put(
    '/:id',
    asyncHandler(async (req: Request, res: Response) => {
      const userId = requireUserId(req);
      const { id: sourceId } = req.params;
      if (!sourceId) {
        throw new ValidationError('Missing integration ID');
      }

      const parsed = updateIntegrationSchema.safeParse(req.body);
      if (!parsed.success) {
        throw ValidationError.fromZod(parsed.error);
      }
      const updates = parsed.data;

      const existing = await ingestSourceRepository.findByUserIdAndSourceId(userId, sourceId);
      if (!existing) {
        throw new NotFoundError('Integration not found');
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
    })
  );

  /**
   * DELETE /api/integrations/:id
   * Delete integration and unlink from all students.
   */
  router.delete(
    '/:id',
    asyncHandler(async (req: Request, res: Response) => {
      const userId = requireUserId(req);
      const { id: sourceId } = req.params;
      if (!sourceId) {
        throw new ValidationError('Missing integration ID');
      }

      const existing = await ingestSourceRepository.findByUserIdAndSourceId(userId, sourceId);
      if (!existing) {
        throw new NotFoundError('Integration not found');
      }

      const students = await studentRepository.findByUserId(userId);
      const linked = students.filter((s) => s.dataSources.some((ds) => ds.id === sourceId));

      for (const student of linked) {
        const newDataSources = student.dataSources.filter((ds) => ds.id !== sourceId);
        await studentRepository.update(student._id!, { dataSources: newDataSources });
      }

      await ingestSourceRepository.deleteByUserIdAndSourceId(userId, sourceId);

      res.status(200).json({ success: true, unlinkedCount: linked.length });
    })
  );

  /**
   * GET /api/integrations/:id/students
   * List students linked to this integration.
   */
  router.get(
    '/:id/students',
    asyncHandler(async (req: Request, res: Response) => {
      const userId = requireUserId(req);
      const { id: sourceId } = req.params;
      if (!sourceId) {
        throw new ValidationError('Missing integration ID');
      }

      const src = await ingestSourceRepository.findByUserIdAndSourceId(userId, sourceId);
      if (!src) {
        throw new NotFoundError('Integration not found');
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
    })
  );

  /**
   * POST /api/integrations/:id/students/:studentId
   * Assign integration to a student (optional credentials).
   */
  router.post(
    '/:id/students/:studentId',
    /* eslint-disable-next-line complexity -- route handler branches */
    asyncHandler(async (req: Request, res: Response) => {
      const userId = requireUserId(req);
      const { id: sourceId, studentId } = req.params;
      if (!sourceId || !studentId) {
        throw new ValidationError('Missing integration ID or student ID');
      }

      const bodyParsed = assignStudentSchema.safeParse(req.body || {});

      const rawAuthType = (req.body as { credentials?: { authType?: string } })?.credentials
        ?.authType;
      if (rawAuthType === 'login') {
        throw new ValidationError(
          'Portal login credentials are stored on the client device (app, extension, or local CLI) and must not be sent to the server.'
        );
      }

      const credentials =
        bodyParsed.success && bodyParsed.data.credentials ? bodyParsed.data.credentials : undefined;

      const integration = await ingestSourceRepository.findByUserIdAndSourceId(userId, sourceId);
      if (!integration) {
        throw new NotFoundError('Integration not found');
      }

      const student = await studentRepository.findById(studentId);
      if (!student || !student.hasAccess(userId)) {
        throw new NotFoundError('Student not found');
      }

      if (student.dataSources.some((ds) => ds.id === sourceId)) {
        throw new ConflictError('Student already linked to this integration');
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
        throw new InternalError('Failed to link student');
      }

      res.status(201).json({
        studentId,
        integrationId: sourceId,
        hasCredentials: Boolean(credentialsPayload),
      });
    })
  );

  /**
   * DELETE /api/integrations/:id/students/:studentId
   * Unlink student from integration (does not delete integration).
   */
  router.delete(
    '/:id/students/:studentId',
    asyncHandler(async (req: Request, res: Response) => {
      const userId = requireUserId(req);
      const { id: sourceId, studentId } = req.params;
      if (!sourceId || !studentId) {
        throw new ValidationError('Missing integration ID or student ID');
      }

      const integration = await ingestSourceRepository.findByUserIdAndSourceId(userId, sourceId);
      if (!integration) {
        throw new NotFoundError('Integration not found');
      }

      const student = await studentRepository.findById(studentId);
      if (!student || !student.hasAccess(userId)) {
        throw new NotFoundError('Student not found');
      }

      const newDataSources = student.dataSources.filter((ds) => ds.id !== sourceId);
      if (newDataSources.length === student.dataSources.length) {
        throw new NotFoundError('Student is not linked to this integration');
      }

      await studentRepository.update(studentId, { dataSources: newDataSources });

      res.status(200).json({ success: true });
    })
  );

  return router;
}
