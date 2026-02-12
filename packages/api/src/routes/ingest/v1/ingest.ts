import express, { type Request, type Response, type Router } from 'express';
import { randomUUID } from 'node:crypto';
import type { Db } from 'mongodb';
import { AuthService, ConnectorTokenService } from '@scholaracle/auth';
import {
  SLC_INGEST_SCHEMA_VERSION_V1,
  type ISlcIngestEnvelopeV1,
  type ISlcDeltaOp,
  type ISlcAssignment,
  type ISlcEventSeries,
  type ISlcEventOverride,
} from '@scholaracle/contracts';
import { authMiddleware } from '../../../middleware/auth';
import {
  connectorAuthMiddleware,
  type IConnectorAuthenticatedRequest,
} from '../../../middleware/connectorAuth';
import { asyncHandler } from '../../../middleware/asyncHandler';
import {
  IngestDeviceAuthRepository,
  IngestRunRepository,
  IngestSourceRepository,
  UserRepository,
  AlertRepository,
} from '@scholaracle/database';
import { AlertType } from '@scholaracle/contracts';

export interface IIngestV1RouterConfig {
  readonly database: Db;
  readonly jwtSecret?: string;
}

function randomUserCode(): string {
  // Human-friendly code: XXXX-XXXX
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const pick = (): string => alphabet[Math.floor(Math.random() * alphabet.length)] ?? 'A';
  return `${pick()}${pick()}${pick()}${pick()}-${pick()}${pick()}${pick()}${pick()}`;
}

function validateEnvelope(envelope: ISlcIngestEnvelopeV1): { valid: boolean; error?: string } {
  if (!envelope || typeof envelope !== 'object') return { valid: false, error: 'Missing envelope' };
  if (envelope.schemaVersion !== SLC_INGEST_SCHEMA_VERSION_V1)
    return { valid: false, error: 'Invalid schemaVersion' };
  if (!envelope.run?.runId) return { valid: false, error: 'Missing run.runId' };
  if (envelope.run.mode !== 'delta') return { valid: false, error: 'Only delta mode is supported' };
  if (!envelope.source?.sourceId) return { valid: false, error: 'Missing source.sourceId' };
  if (!Array.isArray(envelope.ops)) return { valid: false, error: 'Missing ops array' };
  if (!envelope.run.timezone) return { valid: false, error: 'Missing run.timezone' };

  for (const op of envelope.ops) {
    const v = validateOp(op);
    if (!v.valid) return v;
  }
  return { valid: true };
}

function validateOp(op: ISlcDeltaOp): { valid: boolean; error?: string } {
  if (!op?.op || (op.op !== 'upsert' && op.op !== 'delete'))
    return { valid: false, error: 'Invalid op.op' };
  if (!op.entity) return { valid: false, error: 'Missing op.entity' };
  if (!op.key?.provider || !op.key?.adapterId || !op.key?.externalId)
    return { valid: false, error: 'Missing op.key fields' };
  if (!op.observedAt) return { valid: false, error: 'Missing op.observedAt' };

  if (op.op === 'upsert' && !op.record)
    return { valid: false, error: 'Missing op.record for upsert' };

  // Minimal entity-specific checks (v0.1)
  if (op.entity === 'assignment') {
    if (!op.key.studentExternalId || !op.key.institutionExternalId) {
      return {
        valid: false,
        error: 'assignment requires studentExternalId and institutionExternalId in key',
      };
    }
    const r = op.record as ISlcAssignment | undefined;
    if (op.op === 'upsert' && (!r || typeof r.title !== 'string' || r.title.trim().length === 0)) {
      return { valid: false, error: 'assignment upsert requires record.title' };
    }
  }

  if (op.entity === 'eventSeries') {
    if (!op.key.studentExternalId || !op.key.institutionExternalId) {
      return {
        valid: false,
        error: 'eventSeries requires studentExternalId and institutionExternalId in key',
      };
    }
    const r = op.record as ISlcEventSeries | undefined;
    if (op.op === 'upsert' && (!r?.recurrence?.rrule || !r.timezone || !r.startsAt)) {
      return {
        valid: false,
        error: 'eventSeries upsert requires recurrence.rrule, timezone, startsAt',
      };
    }
  }

  if (op.entity === 'eventOverride') {
    if (!op.key.studentExternalId || !op.key.institutionExternalId) {
      return {
        valid: false,
        error: 'eventOverride requires studentExternalId and institutionExternalId in key',
      };
    }
    const r = op.record as ISlcEventOverride | undefined;
    if (op.op === 'upsert' && (!r?.seriesExternalId || !r.occurrenceStartAt || !r.op)) {
      return {
        valid: false,
        error: 'eventOverride upsert requires seriesExternalId, occurrenceStartAt, op',
      };
    }
  }

  return { valid: true };
}

async function generateAlertsFromIngestedAssignments(params: {
  readonly database: Db;
  readonly userId: string;
}): Promise<void> {
  const userRepo = new UserRepository(params.database);
  const alertRepo = new AlertRepository(params.database);

  const user = await userRepo.findById(params.userId);
  if (!user) return;

  const daysBeforeDeadline = user.preferences.alerts?.daysBeforeDeadline ?? 2;
  const now = new Date();
  const windowEnd = new Date(now.getTime() + daysBeforeDeadline * 24 * 60 * 60_000);

  // Due soon assignments (ISO string comparison works for UTC ISO format)
  const dueSoon = await params.database
    .collection('slc_assignments')
    .find({
      userId: params.userId,
      deletedAt: null,
      'record.dueAt': { $gte: now.toISOString(), $lte: windowEnd.toISOString() },
    })
    .toArray();

  for (const doc of dueSoon) {
    const dueAt = doc['record']?.dueAt as string | undefined;
    const title = doc['record']?.title as string | undefined;
    const status = doc['record']?.status as string | undefined;
    if (!dueAt || !title) continue;

    const baseFingerprint = `${doc['provider']}|${doc['adapterId']}|${doc['externalId']}|${dueAt}`;

    // Missing assignment = critical
    if (status === 'missing') {
      const fingerprint = `missing:${baseFingerprint}`;
      const existing = await params.database.collection('alerts').findOne({
        userId: params.userId,
        type: AlertType.MISSING_ASSIGNMENT,
        'relatedData.fingerprint': fingerprint,
      });
      if (existing) continue;

      await alertRepo.create({
        userId: params.userId,
        studentId: (doc['studentExternalId'] as string | undefined) ?? 'unknown-student',
        type: AlertType.MISSING_ASSIGNMENT,
        severity: 'critical',
        message: `Missing assignment: ${title}`,
        relatedData: {
          fingerprint,
          dueAt,
          title,
          provider: doc['provider'],
          adapterId: doc['adapterId'],
          externalId: doc['externalId'],
          courseExternalId: doc['courseExternalId'],
          institutionExternalId: doc['institutionExternalId'],
          termExternalId: doc['termExternalId'],
        },
      });

      continue;
    }

    // Deadline reminder = warning/info
    const fingerprint = `deadline:${baseFingerprint}`;
    const existing = await params.database.collection('alerts').findOne({
      userId: params.userId,
      type: AlertType.DEADLINE,
      'relatedData.fingerprint': fingerprint,
    });
    if (existing) continue;

    await alertRepo.create({
      userId: params.userId,
      studentId: (doc['studentExternalId'] as string | undefined) ?? 'unknown-student',
      type: AlertType.DEADLINE,
      severity: 'warning',
      message: `Due soon: ${title}`,
      relatedData: {
        fingerprint,
        dueAt,
        title,
        provider: doc['provider'],
        adapterId: doc['adapterId'],
        externalId: doc['externalId'],
        courseExternalId: doc['courseExternalId'],
        institutionExternalId: doc['institutionExternalId'],
        termExternalId: doc['termExternalId'],
      },
    });
  }
}

async function applyOps(params: {
  readonly database: Db;
  readonly userId: string;
  readonly ops: readonly ISlcDeltaOp[];
}): Promise<void> {
  const assignments = params.database.collection('slc_assignments');
  const eventSeries = params.database.collection('slc_event_series');
  const eventOverrides = params.database.collection('slc_event_overrides');

  for (const op of params.ops) {
    const key = op.key;
    const baseFilter = {
      userId: params.userId,
      provider: key.provider,
      adapterId: key.adapterId,
      externalId: key.externalId,
      studentExternalId: key.studentExternalId ?? null,
      institutionExternalId: key.institutionExternalId ?? null,
      courseExternalId: key.courseExternalId ?? null,
      termExternalId: key.termExternalId ?? null,
    };

    const commonFields = {
      observedAt: new Date(op.observedAt),
      updatedAt: new Date(),
    };

    if (op.entity === 'assignment') {
      if (op.op === 'delete') {
        await assignments.updateOne(
          baseFilter,
          { $set: { ...commonFields, deletedAt: new Date(op.observedAt) } },
          { upsert: true }
        );
      } else {
        await assignments.updateOne(
          baseFilter,
          { $set: { ...baseFilter, ...commonFields, deletedAt: null, record: op.record } },
          { upsert: true }
        );
      }
    }

    if (op.entity === 'eventSeries') {
      if (op.op === 'delete') {
        await eventSeries.updateOne(
          baseFilter,
          { $set: { ...commonFields, deletedAt: new Date(op.observedAt) } },
          { upsert: true }
        );
      } else {
        await eventSeries.updateOne(
          baseFilter,
          { $set: { ...baseFilter, ...commonFields, deletedAt: null, record: op.record } },
          { upsert: true }
        );
      }
    }

    if (op.entity === 'eventOverride') {
      if (op.op === 'delete') {
        await eventOverrides.updateOne(
          baseFilter,
          { $set: { ...commonFields, deletedAt: new Date(op.observedAt) } },
          { upsert: true }
        );
      } else {
        await eventOverrides.updateOne(
          baseFilter,
          { $set: { ...baseFilter, ...commonFields, deletedAt: null, record: op.record } },
          { upsert: true }
        );
      }
    }
  }
}

export function ingestV1Router(config: IIngestV1RouterConfig): Router {
  const router = express.Router();

  const authService = new AuthService(config.database, config.jwtSecret);
  const connectorTokenService = new ConnectorTokenService(config.jwtSecret);

  const deviceRepo = new IngestDeviceAuthRepository(config.database);
  const sourceRepo = new IngestSourceRepository(config.database);
  const runRepo = new IngestRunRepository(config.database);

  // --- Device auth (public start/poll; approve requires user JWT) ---

  router.post(
    '/device/start',
    asyncHandler(async (_req: Request, res: Response) => {
      const deviceCode = randomUUID();
      const userCode = randomUserCode();
      const expiresAt = new Date(Date.now() + 15 * 60_000);

      const created = await deviceRepo.createPending({ deviceCode, userCode, expiresAt });
      res.status(200).json({
        success: true,
        deviceCode: created.deviceCode,
        userCode: created.userCode,
        verificationUrl: '/connector/activate',
        expiresInSeconds: 15 * 60,
        intervalSeconds: 2,
      });
    })
  );

  router.post(
    '/device/poll',
    asyncHandler(async (req: Request, res: Response) => {
      const deviceCode = (req.body?.deviceCode as string | undefined) ?? '';
      if (!deviceCode) {
        res.status(400).json({ success: false, error: 'Missing deviceCode' });
        return;
      }

      const result = await deviceRepo.deliverTokenOnce(deviceCode);
      if (result.status === 'expired') {
        res.status(404).json({ success: false, error: 'Device code expired or not found' });
        return;
      }

      res.status(200).json({
        success: true,
        status: result.status,
        connectorToken: result.token,
      });
    })
  );

  router.post(
    '/device/approve',
    authMiddleware(authService),
    asyncHandler(async (req: Request, res: Response) => {
      const userCode = (req.body?.userCode as string | undefined) ?? '';
      const userId = (req as unknown as { userId?: string }).userId ?? '';
      if (!userCode) {
        res.status(400).json({ success: false, error: 'Missing userCode' });
        return;
      }
      if (!userId) {
        res.status(401).json({ success: false, error: 'Unauthorized' });
        return;
      }

      const token = connectorTokenService.createToken(userId, randomUUID());
      const ok = await deviceRepo.approveByUserCode(userCode, userId, token);
      if (!ok) {
        res.status(404).json({ success: false, error: 'User code not found or expired' });
        return;
      }

      res.status(200).json({ success: true });
    })
  );

  // --- Connector-authenticated ingestion endpoints ---

  router.get(
    '/sources',
    connectorAuthMiddleware(connectorTokenService),
    asyncHandler(async (req: IConnectorAuthenticatedRequest, res: Response) => {
      const userId = req.connectorUserId ?? '';
      const sources = await sourceRepo.listByUserId(userId);
      res.status(200).json({ success: true, sources });
    })
  );

  router.post(
    '/sources',
    connectorAuthMiddleware(connectorTokenService),
    asyncHandler(async (req: IConnectorAuthenticatedRequest, res: Response) => {
      const userId = req.connectorUserId ?? '';
      const { sourceId, provider, adapterId, displayName, portalBaseUrl } = req.body ?? {};
      if (!sourceId || !provider || !adapterId || !displayName) {
        res.status(400).json({ success: false, error: 'Missing required fields' });
        return;
      }

      const stored = await sourceRepo.upsert({
        userId,
        sourceId,
        provider,
        adapterId,
        displayName,
        portalBaseUrl,
      });

      res.status(200).json({ success: true, source: stored });
    })
  );

  router.post(
    '/runs',
    connectorAuthMiddleware(connectorTokenService),
    asyncHandler(async (req: IConnectorAuthenticatedRequest, res: Response) => {
      const userId = req.connectorUserId ?? '';
      const { sourceId } = req.body ?? {};
      if (!sourceId) {
        res.status(400).json({ success: false, error: 'Missing sourceId' });
        return;
      }

      const lastCursor = await runRepo.findLastCommittedCursor(userId, sourceId);
      const runId = randomUUID();
      await runRepo.startRun({ userId, sourceId, runId, lastCursor });

      res.status(200).json({ success: true, runId, mode: 'delta', lastCursor });
    })
  );

  router.post(
    '/runs/:runId/envelope',
    connectorAuthMiddleware(connectorTokenService),
    asyncHandler(async (req: IConnectorAuthenticatedRequest, res: Response) => {
      const userId = req.connectorUserId ?? '';
      const runId = req.params['runId'];
      if (!runId) {
        res.status(400).json({ success: false, error: 'Missing runId' });
        return;
      }
      const envelope = req.body as ISlcIngestEnvelopeV1;

      const v = validateEnvelope(envelope);
      if (!v.valid) {
        res.status(400).json({ success: false, error: v.error ?? 'Invalid envelope' });
        return;
      }
      if (envelope.run.runId !== runId) {
        res.status(400).json({ success: false, error: 'runId mismatch' });
        return;
      }

      await applyOps({ database: config.database, userId, ops: envelope.ops });
      await runRepo.markUploaded(userId, runId);
      res.status(200).json({ success: true, accepted: true });
    })
  );

  router.post(
    '/runs/:runId/complete',
    connectorAuthMiddleware(connectorTokenService),
    asyncHandler(async (req: IConnectorAuthenticatedRequest, res: Response) => {
      const userId = req.connectorUserId ?? '';
      const runId = req.params['runId'];
      if (!runId) {
        res.status(400).json({ success: false, error: 'Missing runId' });
        return;
      }
      const cursor = req.body?.cursor as { type: 'opaque'; value: string } | undefined;
      await runRepo.commitRun({ userId, runId, newCursor: cursor ?? null });
      // Generate user-facing alerts from ingested tasks (value loop)
      await generateAlertsFromIngestedAssignments({ database: config.database, userId });
      res.status(200).json({
        success: true,
        committed: true,
        newCursor: cursor ?? null,
        derivedAlertsQueued: true,
      });
    })
  );

  router.post(
    '/validate',
    connectorAuthMiddleware(connectorTokenService),
    asyncHandler(async (req: IConnectorAuthenticatedRequest, res: Response) => {
      const envelope = req.body as ISlcIngestEnvelopeV1;
      const v = validateEnvelope(envelope);
      if (!v.valid) {
        res
          .status(400)
          .json({ success: false, error: v.error ?? 'Invalid envelope', validated: false });
        return;
      }
      res.status(200).json({ success: true, validated: true });
    })
  );

  return router;
}
