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
  StudentRepository,
  UserRepository,
  AlertRepository,
} from '@scholaracle/database';
import { AlertType } from '@scholaracle/contracts';
import type { MongoQueue } from '@scholaracle/agents';
import { decryptCredentials } from '../../../utils/credentialsCipher';
import { AssetRepository } from '../../../services/assets/AssetRepository';

export interface IIngestV1RouterConfig {
  readonly database: Db;
  readonly jwtSecret?: string;
  /** When set, enqueue notify jobs after creating alerts so notifications are delivered. */
  readonly queue?: MongoQueue;
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
  readonly queue?: MongoQueue;
}): Promise<void> {
  const userRepo = new UserRepository(params.database);
  const alertRepo = new AlertRepository(params.database);
  const studentRepo = new StudentRepository(params.database);

  const user = await userRepo.findById(params.userId);
  if (!user) return;

  /** Map assignment studentExternalId -> Student MongoDB _id for notify job payloads. */
  let studentIdByExternal: Map<string, string> | undefined;
  if (params.queue) {
    const students = await studentRepo.findOwnedByUserId(params.userId);
    studentIdByExternal = new Map<string, string>();
    for (const s of students) {
      if (s.studentId && s._id) studentIdByExternal.set(s.studentId, s._id.toString());
    }
    if (students.length === 1 && students[0]?._id) {
      studentIdByExternal.set('*', students[0]._id.toString());
    }
  }

  function resolveStudentIdForJob(studentExternalId: string): string | undefined {
    if (!studentIdByExternal) return undefined;
    return (
      studentIdByExternal.get(studentExternalId) ??
      (studentIdByExternal.has('*') ? studentIdByExternal.get('*') : undefined)
    );
  }

  const daysBeforeDeadline = user.preferences.alerts?.daysBeforeDeadline ?? 2;
  const now = new Date();
  const windowEnd = new Date(now.getTime() + daysBeforeDeadline * 24 * 60 * 60_000);
  const todayYMD = now.toISOString().slice(0, 10);

  const termEndDates = new Map<string, string>();
  const termDocs = await params.database
    .collection('slc_academic_terms')
    .find({ userId: params.userId, deletedAt: null })
    .toArray();
  for (const t of termDocs) {
    const extId = t['externalId'] as string | undefined;
    const endDate = (t['record'] as Record<string, unknown> | undefined)?.['endDate'] as
      | string
      | undefined;
    if (extId && endDate) termEndDates.set(extId, endDate);
  }

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

    // Missing assignment = critical (skip if assignment's term has ended)
    if (status === 'missing') {
      const termExternalId = (doc['record'] as Record<string, unknown> | undefined)?.[
        'termExternalId'
      ] as string | undefined;
      const endDate = termExternalId ? termEndDates.get(termExternalId) : undefined;
      if (termExternalId && endDate && endDate < todayYMD) continue;
      const fingerprint = `missing:${baseFingerprint}`;
      const existing = await params.database.collection('alerts').findOne({
        userId: params.userId,
        type: AlertType.MISSING_ASSIGNMENT,
        'relatedData.fingerprint': fingerprint,
      });
      if (existing) continue;

      const studentExtId = (doc['studentExternalId'] as string | undefined) ?? 'unknown-student';
      await alertRepo.create({
        userId: params.userId,
        studentId: studentExtId,
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
      if (params.queue) {
        const jobStudentId = resolveStudentIdForJob(studentExtId);
        if (jobStudentId) {
          void params.queue
            .add(
              'notify',
              'deliver-notification',
              {
                alert: {
                  studentId: jobStudentId,
                  type: AlertType.MISSING_ASSIGNMENT,
                  severity: 'critical',
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
                  userId: params.userId,
                },
              },
              { maxAttempts: 5 }
            )
            .catch((err: unknown) => {
              console.error('Ingest: failed to enqueue notify job for missing assignment', err);
            });
        }
      }
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

    const studentExtId = (doc['studentExternalId'] as string | undefined) ?? 'unknown-student';
    await alertRepo.create({
      userId: params.userId,
      studentId: studentExtId,
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
    if (params.queue) {
      const jobStudentId = resolveStudentIdForJob(studentExtId);
      if (jobStudentId) {
        void params.queue
          .add(
            'notify',
            'deliver-notification',
            {
              alert: {
                studentId: jobStudentId,
                type: AlertType.DEADLINE,
                severity: 'warning',
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
                userId: params.userId,
              },
            },
            { maxAttempts: 5 }
          )
          .catch((err: unknown) => {
            console.error('Ingest: failed to enqueue notify job for deadline', err);
          });
      }
    }
  }
}

/** Maps entity type to MongoDB collection name. */
const ENTITY_COLLECTION_MAP: Record<string, string> = {
  assignment: 'slc_assignments',
  eventSeries: 'slc_event_series',
  eventOverride: 'slc_event_overrides',
  course: 'slc_courses',
  gradeSnapshot: 'slc_grade_snapshots',
  attendanceEvent: 'slc_attendance_events',
  academicTerm: 'slc_academic_terms',
  institution: 'slc_institutions',
  teacher: 'slc_teachers',
  courseMaterial: 'slc_course_materials',
  message: 'slc_messages',
  studentProfile: 'slc_student_profiles',
};

const PENDING_RECONCILIATION_COLLECTION = 'slc_pending_student_reconciliation';
const ACTIVITY_LOG_COLLECTION = 'slc_activity_log';

/** Record pending student reconciliations for ops whose studentExternalId does not match an existing student. */
async function recordPendingStudentReconciliations(params: {
  readonly database: Db;
  readonly userId: string;
  readonly sourceId: string;
  readonly runId: string;
  readonly ops: readonly ISlcDeltaOp[];
}): Promise<void> {
  const externalIds = new Set<string>();
  for (const op of params.ops) {
    const id = op.key?.studentExternalId;
    if (typeof id === 'string' && id.trim()) externalIds.add(id.trim());
  }
  if (externalIds.size === 0) return;

  const studentRepo = new StudentRepository(params.database);
  const students = await studentRepo.findByUserId(params.userId);
  const knownIds = new Set(students.map((s) => s.studentId).filter(Boolean) as string[]);
  const coll = params.database.collection(PENDING_RECONCILIATION_COLLECTION);
  const now = new Date();

  for (const studentExternalId of externalIds) {
    if (knownIds.has(studentExternalId)) continue;
    await coll.updateOne(
      {
        userId: params.userId,
        sourceId: params.sourceId,
        studentExternalId,
      },
      {
        $set: {
          userId: params.userId,
          sourceId: params.sourceId,
          studentExternalId,
          displayName: studentExternalId,
          runId: params.runId,
          updatedAt: now,
        },
        $setOnInsert: { createdAt: now },
      },
      { upsert: true }
    );
  }
}

const ENTITIES_WITH_ASSETS = ['course', 'courseMaterial', 'assignment', 'message'] as const;

async function applyOps(params: {
  readonly database: Db;
  readonly userId: string;
  readonly sourceId?: string;
  readonly ops: readonly ISlcDeltaOp[];
}): Promise<void> {
  const assetRepo = params.sourceId ? new AssetRepository(params.database) : null;

  for (const op of params.ops) {
    const collectionName = ENTITY_COLLECTION_MAP[op.entity];
    if (!collectionName) continue;

    const collection = params.database.collection(collectionName);
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

    if (op.op === 'delete') {
      let materialTitleForLog: string | undefined;
      if (op.entity === 'courseMaterial') {
        const existingDoc = await collection.findOne(baseFilter);
        const rec = existingDoc?.['record'] as Record<string, unknown> | undefined;
        materialTitleForLog =
          (rec?.['title'] as string) || (key.externalId as string) || 'Course material';
      }
      await collection.updateOne(
        baseFilter,
        { $set: { ...commonFields, deletedAt: new Date(op.observedAt) } },
        { upsert: true }
      );
      if (
        assetRepo &&
        params.sourceId &&
        ENTITIES_WITH_ASSETS.includes(op.entity as (typeof ENTITIES_WITH_ASSETS)[number])
      ) {
        if (op.entity === 'course') {
          await assetRepo.softDeleteByCourse(params.userId, params.sourceId, key.externalId);
        } else {
          await assetRepo.softDeleteByEntity(
            params.userId,
            params.sourceId,
            op.entity,
            key.externalId
          );
        }
      }
      if (op.entity === 'courseMaterial' && materialTitleForLog) {
        const activityColl = params.database.collection(ACTIVITY_LOG_COLLECTION);
        await activityColl.insertOne({
          userId: params.userId,
          studentExternalId: key.studentExternalId ?? undefined,
          courseExternalId: key.courseExternalId ?? undefined,
          eventType: 'material_removed',
          title: materialTitleForLog,
          metadata: { externalId: key.externalId, type: 'course_material' },
          occurredAt: new Date(op.observedAt),
          provider: key.provider,
          adapterId: key.adapterId,
        });
      }
    } else {
      if (op.entity === 'assignment' && op.record) {
        const record = op.record as Record<string, unknown>;
        const existing = await collection.findOne(baseFilter);
        const prev = (existing?.['record'] as Record<string, unknown> | undefined) ?? {};
        const gradeRelevant = (
          r: Record<string, unknown>
        ): {
          status: unknown;
          pointsEarned: unknown;
          pointsPossible: unknown;
          percentScore: unknown;
          letterGrade: unknown;
          teacherFeedback: unknown;
        } => ({
          status: r['status'],
          pointsEarned: r['pointsEarned'],
          pointsPossible: r['pointsPossible'],
          percentScore: r['percentScore'],
          letterGrade: r['letterGrade'],
          teacherFeedback: r['teacherFeedback'],
        });
        const prevGrade = gradeRelevant(prev);
        const nextGrade = gradeRelevant(record);
        const changed =
          prevGrade.status !== nextGrade.status ||
          prevGrade.pointsEarned !== nextGrade.pointsEarned ||
          prevGrade.pointsPossible !== nextGrade.pointsPossible ||
          prevGrade.percentScore !== nextGrade.percentScore ||
          prevGrade.letterGrade !== nextGrade.letterGrade ||
          prevGrade.teacherFeedback !== nextGrade.teacherFeedback;

        const historyEntry = {
          observedAt: op.observedAt,
          status: record['status'] ?? prev['status'],
          pointsEarned: record['pointsEarned'],
          pointsPossible: record['pointsPossible'],
          percentScore: record['percentScore'],
          letterGrade: record['letterGrade'],
          teacherFeedback: record['teacherFeedback'],
        };

        if (changed) {
          const updateWithHistory = {
            $set: { ...baseFilter, ...commonFields, deletedAt: null, record: op.record },
            $push: { _history: { $each: [historyEntry], $slice: -100 } },
          };
          await collection.updateOne(baseFilter, updateWithHistory as never, { upsert: true });
        } else {
          await collection.updateOne(
            baseFilter,
            { $set: { ...baseFilter, ...commonFields, deletedAt: null, record: op.record } },
            { upsert: true }
          );
        }
      } else if (op.entity === 'courseMaterial' && op.record) {
        const existing = await collection.findOne(baseFilter);
        const record = op.record as Record<string, unknown>;
        const title =
          (record['title'] as string) ?? (key.externalId as string) ?? 'Course material';
        const activityColl = params.database.collection(ACTIVITY_LOG_COLLECTION);
        if (existing) {
          await collection.updateOne(
            baseFilter,
            {
              $set: {
                ...baseFilter,
                ...commonFields,
                deletedAt: null,
                record: op.record,
              },
            },
            { upsert: true }
          );
          const prev = (existing['record'] as Record<string, unknown>) ?? {};
          const changed =
            prev['title'] !== record['title'] ||
            prev['type'] !== record['type'] ||
            (prev['courseExternalId'] as string) !== (record['courseExternalId'] as string);
          if (changed) {
            await activityColl.insertOne({
              userId: params.userId,
              studentExternalId: key.studentExternalId ?? undefined,
              courseExternalId: key.courseExternalId ?? undefined,
              eventType: 'material_updated',
              title,
              metadata: {
                externalId: key.externalId,
                type: record['type'],
                fileName: record['fileName'],
              },
              occurredAt: new Date(op.observedAt),
              provider: key.provider,
              adapterId: key.adapterId,
            });
          }
        } else {
          await collection.updateOne(
            baseFilter,
            {
              $set: {
                ...baseFilter,
                ...commonFields,
                deletedAt: null,
                record: op.record,
              },
              $setOnInsert: { createdAt: new Date() },
            },
            { upsert: true }
          );
          await activityColl.insertOne({
            userId: params.userId,
            studentExternalId: key.studentExternalId ?? undefined,
            courseExternalId: key.courseExternalId ?? undefined,
            eventType: 'material_added',
            title,
            metadata: {
              externalId: key.externalId,
              type: record['type'],
              fileName: record['fileName'],
            },
            occurredAt: new Date(op.observedAt),
            provider: key.provider,
            adapterId: key.adapterId,
          });
        }
      } else {
        await collection.updateOne(
          baseFilter,
          { $set: { ...baseFilter, ...commonFields, deletedAt: null, record: op.record } },
          { upsert: true }
        );
      }

      if (op.entity === 'gradeSnapshot' && op.op === 'upsert') {
        const rec = op.record as Record<string, unknown> | undefined;
        const pct = rec?.['percentGrade'] as number | undefined;
        if (pct != null) {
          const historyDate = (rec?.['asOfDate'] as string) || op.observedAt.split('T')[0];
          await params.database.collection('slc_grade_history').updateOne(
            {
              userId: params.userId,
              provider: key.provider,
              courseExternalId: key.courseExternalId ?? key.externalId,
              studentExternalId: key.studentExternalId ?? null,
              date: historyDate,
            },
            {
              $set: {
                userId: params.userId,
                provider: key.provider,
                adapterId: key.adapterId,
                courseExternalId: key.courseExternalId ?? key.externalId,
                studentExternalId: key.studentExternalId ?? null,
                date: historyDate,
                percentGrade: pct,
                letterGrade: (rec?.['letterGrade'] as string) || undefined,
                sourceType: (rec?.['sourceType'] as string) || undefined,
                observedAt: new Date(op.observedAt),
                updatedAt: new Date(),
              },
              $setOnInsert: { createdAt: new Date() },
            },
            { upsert: true }
          );
        }
      }
    }
  }
}

export function ingestV1Router(config: IIngestV1RouterConfig): Router {
  const router = express.Router();

  const authService = new AuthService(config.database, config.jwtSecret);
  const connectorTokenService = new ConnectorTokenService(config.jwtSecret);
  const connectorAuth = connectorAuthMiddleware(connectorTokenService, {
    database: config.database,
  });

  const deviceRepo = new IngestDeviceAuthRepository(config.database);
  const sourceRepo = new IngestSourceRepository(config.database);
  const runRepo = new IngestRunRepository(config.database);
  const studentRepo = new StudentRepository(config.database);

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
    '/connector/students',
    connectorAuth,
    asyncHandler(async (req: IConnectorAuthenticatedRequest, res: Response) => {
      const userId = req.connectorUserId ?? '';
      const students = await studentRepo.findByUserId(userId);
      const result = await Promise.all(
        students.map(async (student) => {
          const idStr = student._id?.toString() ?? '';
          const dataSources: Array<{
            sourceId: string;
            provider: string;
            displayName: string;
            portalBaseUrl?: string;
          }> = [];
          for (const ds of student.dataSources) {
            const ingestSource = await sourceRepo.findByUserIdAndSourceId(userId, ds.id);
            if (ingestSource) {
              dataSources.push({
                sourceId: ds.id,
                provider: ingestSource.provider,
                displayName: ingestSource.displayName,
                portalBaseUrl: ingestSource.portalBaseUrl,
              });
            }
          }
          return {
            id: idStr,
            name: student.name,
            externalId: student.studentId ?? idStr,
            grade: student.grade,
            dataSources,
          };
        })
      );
      res.status(200).json(result);
    })
  );

  router.get(
    '/sources',
    connectorAuth,
    asyncHandler(async (req: IConnectorAuthenticatedRequest, res: Response) => {
      const userId = req.connectorUserId ?? '';
      const sources = await sourceRepo.listByUserId(userId);
      res.status(200).json({ success: true, sources });
    })
  );

  router.get(
    '/sources/:sourceId/credentials',
    connectorAuth,
    asyncHandler(async (req: IConnectorAuthenticatedRequest, res: Response) => {
      const userId = req.connectorUserId ?? '';
      const sourceId = req.params['sourceId'];
      if (!sourceId) {
        res.status(400).json({ success: false, error: 'Missing sourceId' });
        return;
      }
      const students = await studentRepo.findByUserId(userId);
      for (const student of students) {
        const ds = student.dataSources.find((s) => s.id === sourceId);
        if (!ds?.credentials?.encrypted) continue;
        const plain = decryptCredentials({
          encrypted: ds.credentials.encrypted,
          iv: ds.credentials.iv,
        });
        if (!plain) {
          res.status(503).json({ success: false, error: 'Credentials could not be decrypted' });
          return;
        }
        let credentials: {
          authType: string;
          accessToken?: string;
          username?: string;
          password?: string;
          baseUrl?: string;
        };
        try {
          credentials = JSON.parse(plain) as typeof credentials;
        } catch {
          res.status(500).json({ success: false, error: 'Invalid credentials payload' });
          return;
        }
        const ingestSource = await sourceRepo.findByUserIdAndSourceId(userId, sourceId);
        const baseUrl = credentials.baseUrl ?? ingestSource?.portalBaseUrl ?? '';
        if (credentials.authType === 'api') {
          res.status(200).json({ baseUrl, accessToken: credentials.accessToken ?? '' });
          return;
        }
        res.status(200).json({
          baseUrl,
          username: credentials.username,
          password: credentials.password,
          accessToken: undefined,
        });
        return;
      }
      res.status(404).json({ success: false, error: 'Source not found or no credentials set' });
    })
  );

  router.post(
    '/sources',
    connectorAuth,
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
    connectorAuth,
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
    connectorAuth,
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

      await applyOps({
        database: config.database,
        userId,
        sourceId: envelope.source?.sourceId,
        ops: envelope.ops,
      });
      const sourceId = envelope.source?.sourceId ?? '';
      if (sourceId) {
        await recordPendingStudentReconciliations({
          database: config.database,
          userId,
          sourceId,
          runId,
          ops: envelope.ops,
        });
      }
      await runRepo.markUploaded(userId, runId);
      res.status(200).json({ success: true, accepted: true });
    })
  );

  router.post(
    '/runs/:runId/complete',
    connectorAuth,
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
      await generateAlertsFromIngestedAssignments({
        database: config.database,
        userId,
        queue: config.queue,
      });
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
    connectorAuth,
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
