import express, { type Request, type Response, type Router } from 'express';
import { randomUUID } from 'node:crypto';
import type { Db } from 'mongodb';
import { AuthService, ConnectorTokenService } from '@scholaracle/auth';
import {
  SLC_INGEST_SCHEMA_VERSION_V1,
  AuthenticationError,
  InternalError,
  NotFoundError,
  ValidationError,
  type ISlcIngestEnvelopeV1,
  type ISlcDeltaOp,
  type ISlcAssignment,
  type ISlcEventSeries,
  type ISlcEventOverride,
  type IIngestRunStartResponse,
  type IIngestSourceRegisterResponse,
  type IIngestRunCompleteResponse,
  type IIngestEnvelopeAcceptResponse,
} from '@scholaracle/contracts';
import { authMiddleware } from '../../../middleware/auth';
import { requireParent } from '../../../middleware/requireRole';
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
  getCurrentSemesterStart,
} from '@scholaracle/database';
import { AlertType } from '@scholaracle/contracts';
import type { MongoQueue } from '@scholaracle/agents';
import { decryptCredentials } from '../../../utils/credentialsCipher';
import { AssetRepository } from '../../../services/assets/AssetRepository';
import {
  mergeCourses,
  reconcileAssignments,
  type IAssignmentForReconciliation,
  type IAssignmentMatch,
  type ISourceCourse,
} from '@scholaracle/connector';
import { logger } from '../../../logger';
import { prepareIngestOps, resolveEnrichOpsMode, type EnrichOpsMode } from './enrichOps';
import { scheduleGuidanceJobsFromOps } from '../../../services/guidance/scheduleFromIngest';

export interface IIngestV1RouterConfig {
  readonly database: Db;
  readonly jwtSecret?: string;
  /** When set, enqueue notify jobs after creating alerts so notifications are delivered. */
  readonly queue?: MongoQueue;
  /**
   * Join-gap enrichment mode for envelope ingest. Defaults to ENRICH_OPS_MODE
   * or `off`. Tests inject this so they do not mutate process.env.
   */
  readonly enrichOpsMode?: EnrichOpsMode;
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

/** Run assignment reconciliation (Canvas missing vs Skyward graded) and persist to slc_assignment_reconciliation. */
async function runAssignmentReconciliation(params: {
  readonly database: Db;
  readonly userId: string;
}): Promise<readonly IAssignmentMatch[]> {
  const courseDocs = await params.database
    .collection('slc_courses')
    .find({ userId: params.userId, deletedAt: null })
    .toArray();
  const sources: ISourceCourse[] = courseDocs.map((c) => {
    const rec = (c['record'] as Record<string, unknown>) ?? {};
    return {
      externalId: (c['externalId'] as string) ?? '',
      sourceId: (c['sourceId'] as string) ?? '',
      provider: (c['provider'] as string) ?? '',
      title: (rec['title'] as string) ?? (rec['name'] as string) ?? '',
      teacherName: rec['teacherName'] as string | undefined,
      period: rec['period'] as string | undefined,
    };
  });
  const merged = mergeCourses(sources);
  const extIdToMergedId = new Map<string, string>();
  for (const group of merged) {
    for (const src of group.sources) {
      extIdToMergedId.set(src.externalId, group.mergedId);
    }
  }

  const assignmentDocs = await params.database
    .collection('slc_assignments')
    .find({ userId: params.userId, deletedAt: null })
    .toArray();

  const toForReconciliation = (doc: Record<string, unknown>): IAssignmentForReconciliation => {
    const rec = (doc['record'] as Record<string, unknown>) ?? {};
    const courseExtId = (doc['courseExternalId'] as string) ?? '';
    const mergedCourseId = extIdToMergedId.get(courseExtId) ?? courseExtId;
    return {
      externalId: (doc['externalId'] as string) ?? '',
      title: (rec['title'] as string) ?? '',
      courseExternalId: courseExtId,
      mergedCourseId,
      status: (rec['status'] as string) ?? '',
      dueAt: rec['dueAt'] as string | undefined,
      pointsPossible: rec['pointsPossible'] as number | undefined,
      pointsEarned: rec['pointsEarned'] as number | undefined,
      category: rec['category'] as string | undefined,
      observedAt: (doc['observedAt'] as string) ?? undefined,
      provider: (doc['provider'] as string) ?? '',
      assignedAt: rec['assignedAt'] as string | undefined,
    };
  };

  const LMS_PROVIDERS = ['canvas', 'google_classroom'] as const;

  const lms = assignmentDocs
    .filter(
      (d) =>
        LMS_PROVIDERS.includes(d['provider'] as string as 'canvas' | 'google_classroom') &&
        (d['record'] as Record<string, unknown>)?.['status'] === 'missing'
    )
    .map((d) => toForReconciliation(d as Record<string, unknown>));
  const sis = assignmentDocs
    .filter(
      (d) =>
        (d['provider'] as string) === 'skyward' &&
        ['graded', 'submitted'].includes(
          (d['record'] as Record<string, unknown>)?.['status'] as string
        )
    )
    .map((d) => toForReconciliation(d as Record<string, unknown>));

  const matches = reconcileAssignments(lms, sis);
  const now = new Date();

  // Log reconciliation summary to activity log
  const matched = matches.filter((m) => m.skywardExternalId !== null);
  const unmatched = matches.filter((m) => m.skywardExternalId === null);
  const flaggedForReview = matches.filter((m) => m.requiresReview === true);
  const avgConfidence =
    matched.length > 0
      ? matched.reduce((sum, m) => sum + (m.aggregateScore ?? 0), 0) / matched.length
      : 0;

  await params.database.collection(ACTIVITY_LOG_COLLECTION).insertOne({
    activityId: randomUUID(),
    userId: params.userId,
    studentExternalId: null,
    courseExternalId: null,
    assignmentExternalId: null,
    eventType: 'reconciliation_summary',
    timestamp: now,
    metadata: {
      totalLms: lms.length,
      totalSis: sis.length,
      matched: matched.length,
      unmatched: unmatched.length,
      flaggedForReview: flaggedForReview.length,
      avgConfidence: avgConfidence.toFixed(3),
    },
    createdAt: now,
  });

  await params.database
    .collection(ASSIGNMENT_RECONCILIATION_COLLECTION)
    .updateOne(
      { userId: params.userId },
      { $set: { userId: params.userId, matches: [...matches], updatedAt: now } },
      { upsert: true }
    );
  return matches;
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

  const reconciliationMatches = await runAssignmentReconciliation({
    database: params.database,
    userId: params.userId,
  });

  /** Map assignment studentExternalId -> Student MongoDB _id for notify job payloads. */
  let studentIdByExternal: Map<string, string> | undefined;
  if (params.queue) {
    const students = await studentRepo.findOwnedByUserId(params.userId);
    studentIdByExternal = new Map<string, string>();
    for (const s of students) {
      if (!s._id) continue;
      // Map by external studentId when available
      if (s.studentId) studentIdByExternal.set(s.studentId, s._id.toString());
      // Also map by MongoDB _id so lookups work even when external studentId is null
      studentIdByExternal.set(s._id.toString(), s._id.toString());
    }
    // Wildcard: when only one student has data sources, use it as the default
    const studentsWithSources = students.filter(
      (s) => s._id && Array.isArray(s.dataSources) && s.dataSources.length > 0
    );
    if (studentsWithSources.length === 1 && studentsWithSources[0]?._id) {
      studentIdByExternal.set('*', studentsWithSources[0]._id.toString());
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
      string | undefined;
    if (extId && endDate) termEndDates.set(extId, endDate);
  }

  const semesterStartYmd = await getCurrentSemesterStart(params.database, params.userId, now);

  // Due soon assignments (ISO string comparison works for UTC ISO format)
  const dueSoon = await params.database
    .collection('slc_assignments')
    .find({
      userId: params.userId,
      deletedAt: null,
      'record.dueAt': { $gte: now.toISOString(), $lte: windowEnd.toISOString() },
    })
    .toArray();

  // Past-due missing assignments (within current semester) — alert even though due date has passed
  const pastDueMissing = await params.database
    .collection('slc_assignments')
    .find({
      userId: params.userId,
      deletedAt: null,
      'record.status': 'missing',
      'record.dueAt': { $gte: semesterStartYmd, $lt: now.toISOString() },
    })
    .toArray();

  // Merge: dueSoon + pastDueMissing (deduplicate by externalId)
  const seenExternalIds = new Set(dueSoon.map((d) => d['externalId'] as string));
  for (const doc of pastDueMissing) {
    const extId = doc['externalId'] as string;
    if (!seenExternalIds.has(extId)) {
      dueSoon.push(doc);
      seenExternalIds.add(extId);
    }
  }

  // Pre-fetch course names and student names for human-readable alert data
  const courseNameMap = new Map<string, string>();
  const courseDocs = await params.database
    .collection('slc_courses')
    .find({ userId: params.userId, deletedAt: null })
    .project({ externalId: 1, 'record.title': 1, 'record.name': 1 })
    .toArray();
  for (const c of courseDocs) {
    const name = (c['record']?.title as string) ?? (c['record']?.name as string);
    if (name && c['externalId']) courseNameMap.set(c['externalId'] as string, name);
  }

  const studentNameMap = new Map<string, string>();
  const studentDocs = await studentRepo.findOwnedByUserId(params.userId);
  // First pass: map by external studentId (indirect matches)
  for (const s of studentDocs) {
    if (s.studentId) studentNameMap.set(s.studentId, s.name ?? 'Student');
  }
  // Second pass: map by _id (direct matches override indirect — these are the canonical students)
  for (const s of studentDocs) {
    if (s._id) studentNameMap.set(s._id.toString(), s.name ?? 'Student');
  }

  for (const doc of dueSoon) {
    const dueAt = doc['record']?.dueAt as string | undefined;
    const title = doc['record']?.title as string | undefined;
    const status = doc['record']?.status as string | undefined;
    if (!dueAt || !title) continue;

    const courseExtId = doc['courseExternalId'] as string | undefined;
    const courseName =
      (courseExtId ? courseNameMap.get(courseExtId) : undefined) ?? 'Unknown Course';
    const studentExtId = (doc['studentExternalId'] as string | undefined) ?? 'unknown-student';
    const studentName = studentNameMap.get(studentExtId) ?? 'Student';
    const daysAgo = Math.max(
      0,
      Math.round((now.getTime() - new Date(dueAt).getTime()) / 86_400_000)
    );

    const baseFingerprint = `${doc['provider']}|${doc['adapterId']}|${doc['externalId']}|${dueAt}`;

    // Missing assignment = critical (skip if assignment's term has ended or before current semester)
    if (status === 'missing') {
      const termExternalId = (doc['record'] as Record<string, unknown> | undefined)?.[
        'termExternalId'
      ] as string | undefined;
      const endDate = termExternalId ? termEndDates.get(termExternalId) : undefined;
      if (termExternalId && endDate && endDate < todayYMD) continue;
      const assignmentDateYmd = (dueAt ?? (doc['observedAt'] as string | undefined))?.slice(0, 10);
      if (assignmentDateYmd && assignmentDateYmd < semesterStartYmd) continue;
      // Skip MISSING_ASSIGNMENT when LMS assignment (Canvas/Google Classroom) is matched to a Skyward graded/submitted assignment
      const LMS_PROVIDERS = ['canvas', 'google_classroom'];
      if (LMS_PROVIDERS.includes(doc['provider'] as string)) {
        const match = reconciliationMatches.find(
          (m) => m.canvasExternalId === (doc['externalId'] as string)
        );
        if (
          match?.skywardExternalId &&
          (match.skywardStatus === 'graded' || match.skywardStatus === 'submitted')
        ) {
          continue;
        }
      }
      const fingerprint = `missing:${baseFingerprint}`;
      const existing = await params.database.collection('alerts').findOne({
        userId: params.userId,
        type: AlertType.MISSING_ASSIGNMENT,
        'relatedData.fingerprint': fingerprint,
      });
      if (existing) continue;

      const enrichedMissingData = {
        fingerprint,
        dueAt,
        title,
        assignment: title,
        course: courseName,
        studentName,
        daysAgo,
        provider: doc['provider'],
        adapterId: doc['adapterId'],
        externalId: doc['externalId'],
        courseExternalId: doc['courseExternalId'],
        institutionExternalId: doc['institutionExternalId'],
        termExternalId: doc['termExternalId'],
      };
      await alertRepo.create({
        userId: params.userId,
        studentId: studentExtId,
        type: AlertType.MISSING_ASSIGNMENT,
        severity: 'critical',
        message: `Missing assignment: ${title}`,
        relatedData: enrichedMissingData,
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
                  relatedData: enrichedMissingData,
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

    const dueDate = new Date(dueAt);
    const formattedDueDate = dueDate.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
    const enrichedDeadlineData = {
      fingerprint,
      dueAt,
      dueDate: dueAt,
      title,
      assignment: title,
      course: courseName,
      studentName,
      formattedDueDate,
      provider: doc['provider'],
      adapterId: doc['adapterId'],
      externalId: doc['externalId'],
      courseExternalId: doc['courseExternalId'],
      institutionExternalId: doc['institutionExternalId'],
      termExternalId: doc['termExternalId'],
    };
    await alertRepo.create({
      userId: params.userId,
      studentId: studentExtId,
      type: AlertType.DEADLINE,
      severity: 'warning',
      message: `Due soon: ${title}`,
      relatedData: enrichedDeadlineData,
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
                relatedData: enrichedDeadlineData,
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

// ---------------------------------------------------------------------------
// LLM-based material-to-assignment matching (Layer 3)
// ---------------------------------------------------------------------------

/**
 * For materials that Layers 1+2 (modules, descriptions) couldn't match,
 * use an LLM to semantically match file names to assignment titles.
 * Fire-and-forget — failures are non-fatal.
 */
async function matchUnmatchedMaterialsViaLlm(params: {
  readonly database: Db;
  readonly userId: string;
}): Promise<void> {
  const apiKey = process.env['ANTHROPIC_API_KEY'];
  if (!apiKey) return;

  const materialsColl = params.database.collection('slc_course_materials');
  const assignmentsColl = params.database.collection('slc_assignments');

  // Find materials with no assignmentExternalId
  const unmatched = await materialsColl
    .find({
      userId: params.userId,
      deletedAt: null,
      $or: [
        { 'record.assignmentExternalId': null },
        { 'record.assignmentExternalId': { $exists: false } },
      ],
    })
    .toArray();

  if (unmatched.length === 0) return;

  // Group by course
  const byCourse = new Map<string, typeof unmatched>();
  for (const m of unmatched) {
    const cid = m['courseExternalId'] as string;
    if (!cid) continue;
    if (!byCourse.has(cid)) byCourse.set(cid, []);
    byCourse.get(cid)!.push(m);
  }

  // eslint-disable-next-line @typescript-eslint/naming-convention
  const { LlmClient } = await import('@scholaracle/agents');
  const llm = new LlmClient({ apiKey });

  for (const [courseExtId, materials] of byCourse) {
    const assignments = await assignmentsColl
      .find({
        userId: params.userId,
        deletedAt: null,
        courseExternalId: courseExtId,
      })
      .project({ externalId: 1, 'record.title': 1 })
      .toArray();

    if (assignments.length === 0) continue;

    const assignmentList = assignments.map((a) => ({
      id: a['externalId'] as string,
      title: (a['record'] as Record<string, unknown>)?.['title'] as string,
    }));

    const fileList = materials.map((m) => {
      const rec = m['record'] as Record<string, unknown>;
      const entry: { id: string; name: string; description?: string } = {
        id: m['externalId'] as string,
        name: (rec?.['title'] as string) ?? '',
      };
      const extracted = rec?.['extractedText'] as string | undefined;
      if (extracted) entry.description = extracted;
      return entry;
    });

    try {
      const response = await llm.complete(
        [
          {
            role: 'user',
            content: `Match these course files to their most relevant assignment. Return a JSON array of objects with "fileId", "assignmentId", and "confidence" (0-1). Only include matches with confidence >= 0.7. If no good match exists for a file, omit it. Some files have a "description" field with AI-analyzed content — use it for matching when the filename alone is ambiguous.\n\nFiles:\n${JSON.stringify(fileList)}\n\nAssignments:\n${JSON.stringify(assignmentList)}`,
          },
        ],
        {
          maxTokens: 4096,
          system:
            'You are a school data matching assistant. Match course material filenames to assignment titles based on semantic similarity, topic overlap, and naming patterns (e.g. "5.A" prefix matches "5.A - Independent Practice", "Camera Parts.pptx" matches "Parts of a camera"). Return ONLY a valid JSON array, no markdown fences.',
        }
      );

      // Extract JSON from response (handle possible markdown fences)
      const jsonStr = response.content
        .replace(/```json\s*/g, '')
        .replace(/```\s*/g, '')
        .trim();
      const matches = JSON.parse(jsonStr) as Array<{
        fileId: string;
        assignmentId: string;
        confidence: number;
      }>;

      for (const m of matches) {
        if (m.confidence < 0.7) continue;
        await materialsColl.updateOne(
          { userId: params.userId, externalId: m.fileId },
          { $set: { 'record.assignmentExternalId': m.assignmentId } }
        );
      }

      // eslint-disable-next-line no-console
      console.log(
        `[MaterialMatcher] LLM matched ${matches.filter((m) => m.confidence >= 0.7).length}/${fileList.length} files for course ${courseExtId}`
      );
    } catch (err) {
      console.error(`[MaterialMatcher] LLM matching failed for course ${courseExtId}:`, err);
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

const ACTIVITY_LOG_COLLECTION = 'slc_activity_log';
const ASSIGNMENT_RECONCILIATION_COLLECTION = 'slc_assignment_reconciliation';

/**
 * Resolves the data-owner userId for slc_* writes/reads.
 *
 * Ingest always authenticates the *actor* (the account whose connector token was used).
 * When the actor is a co-parent with shared access, the owner is the student's primary
 * owner and all slc_* data must land in the owner's partition.
 *
 * Resolution order:
 *  1. If `sourceId` given, find the student that has this source → return owner userId.
 *  2. If `studentExternalId` given, find the student by externalId → return owner userId.
 *  3. Fall back to actorUserId (first-time owner setup; no shared student exists yet).
 */
async function resolveDataUserId(
  database: Db,
  actorUserId: string,
  sourceId?: string,
  studentExternalId?: string
): Promise<string> {
  const repo = new StudentRepository(database);
  const students = await repo.findByUserId(actorUserId);

  if (sourceId) {
    const match = students.find((s) => s.dataSources.some((ds) => ds.id === sourceId));
    if (match) return match.dataUserId();
  }

  if (studentExternalId) {
    const match = students.find((s) => {
      if (!s.studentId) return false;
      const parts = s.studentId.split(':', 2);
      const extId = parts.length === 2 ? parts[1]! : s.studentId;
      return extId === studentExternalId;
    });
    if (match) return match.dataUserId();
  }

  return actorUserId;
}

/** Auto-create Student records for new studentExternalId values encountered in ops.
 *  Matches by studentExternalId (not composite key) so that the same student
 *  from different platforms (Canvas, Skyward) merges into ONE record. */
async function autoCreateStudentsFromOps(params: {
  readonly database: Db;
  readonly userId: string;
  readonly sourceId: string;
  readonly ops: readonly ISlcDeltaOp[];
  readonly provider: string;
  readonly adapterId: string;
  readonly portalBaseUrl?: string;
}): Promise<void> {
  // Extract unique studentExternalId values (with their institutionExternalId)
  const studentExtIds = new Map<string, string | undefined>();
  for (const op of params.ops) {
    const studentExtId = op.key?.studentExternalId;
    const institutionExtId = op.key?.institutionExternalId;
    if (typeof studentExtId === 'string' && studentExtId.trim()) {
      if (!studentExtIds.has(studentExtId)) {
        studentExtIds.set(
          studentExtId,
          typeof institutionExtId === 'string' ? institutionExtId : undefined
        );
      }
    }
  }
  if (studentExtIds.size === 0) return;

  const studentRepo = new StudentRepository(params.database);
  const students = await studentRepo.findByUserId(params.userId);

  // Build lookup by studentExternalId — handle both new format ("ava-lewis")
  // and legacy composite ("institution:student") stored in studentId.
  const studentsByExtId = new Map<string, (typeof students)[0]>();
  for (const s of students) {
    if (!s.studentId) continue;
    const parts = s.studentId.split(':', 2);
    const extId = parts.length === 2 ? parts[1]! : s.studentId;
    studentsByExtId.set(extId, s);
  }

  // Extract student profile names from ops (keyed by studentExternalId)
  const profileNames = new Map<string, string>();
  for (const op of params.ops) {
    if (op.entity === 'studentProfile' && op.op === 'upsert') {
      const studentExtId = op.key?.studentExternalId;
      const name = (op.record?.['name'] as string | undefined) ?? '';
      if (studentExtId && name) {
        profileNames.set(studentExtId, name);
      }
    }
  }

  for (const [studentExtId, institutionExtId] of studentExtIds) {
    const newDataSource = {
      id: params.sourceId,
      pluginId: params.adapterId,
      enabled: true,
      provider: params.provider,
      baseUrl: params.portalBaseUrl,
      institutionExternalId: institutionExtId,
    };

    const existing = studentsByExtId.get(studentExtId);

    if (existing) {
      const hasSource = existing.dataSources.some((ds) => ds.id === params.sourceId);
      if (!hasSource) {
        await studentRepo.update(existing._id!, {
          dataSources: [...existing.dataSources, newDataSource],
        });
      }
      // Migrate legacy composite studentId to plain studentExternalId
      if (existing.studentId && existing.studentId.includes(':')) {
        await studentRepo.update(existing._id!, { studentId: studentExtId });
      }
    } else {
      // Guard: do not create a new student under a co-parent userId when a student
      // with this externalId already exists under a different owner.  resolveDataUserId
      // should have already returned the owner's userId, so params.userId IS the owner.
      // But if we're still seeing "not found" it means this is a brand-new student.
      const studentName = profileNames.get(studentExtId) ?? studentExtId;
      await studentRepo.create({
        userId: params.userId,
        name: studentName,
        studentId: studentExtId,
        dataSources: [newDataSource],
      });
    }
  }
}

const ENTITIES_WITH_ASSETS = ['course', 'courseMaterial', 'assignment', 'message'] as const;

async function logDataQuality(params: {
  readonly database: Db;
  readonly userId: string;
  readonly ops: readonly ISlcDeltaOp[];
}): Promise<void> {
  const assignmentOps = params.ops.filter((op) => op.entity === 'assignment' && op.op === 'upsert');
  if (assignmentOps.length === 0) return;

  const assignmentsWithoutDate = assignmentOps.filter((op) => {
    const record = op.record as ISlcAssignment | undefined;
    return !record?.dueAt;
  });

  if (assignmentsWithoutDate.length > 0) {
    console.warn(
      `[Ingest] Data quality: ${assignmentsWithoutDate.length} of ${assignmentOps.length} assignments for user ${params.userId} have no dueAt`
    );

    const courseGroups = new Map<string, number>();
    for (const op of assignmentsWithoutDate) {
      const record = op.record as ISlcAssignment | undefined;
      const courseId = record?.courseExternalId ?? 'unknown';
      courseGroups.set(courseId, (courseGroups.get(courseId) ?? 0) + 1);
    }

    const coll = params.database.collection(ACTIVITY_LOG_COLLECTION);
    const now = new Date();

    for (const [courseId, count] of courseGroups.entries()) {
      await coll.insertOne({
        activityId: randomUUID(),
        userId: params.userId,
        studentExternalId: null,
        courseExternalId: courseId,
        assignmentExternalId: null,
        eventType: 'data_quality_warning',
        timestamp: now,
        metadata: {
          message: `${count} assignment(s) in this course have no due date — date-based filtering unavailable`,
          count,
        },
        createdAt: now,
      });
    }
  }
}

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
        // Preserve LLM/vision-derived fields when the incoming op doesn't provide them.
        // These fields are set by post-processing (Layers 3+4) and would be lost if
        // overwritten with undefined on every sync.
        if (existing) {
          const prev = (existing['record'] as Record<string, unknown>) ?? {};
          // eslint-disable-next-line max-depth
          if (!record['assignmentExternalId'] && prev['assignmentExternalId']) {
            record['assignmentExternalId'] = prev['assignmentExternalId'];
          }
          // eslint-disable-next-line max-depth
          if (!record['extractedText'] && prev['extractedText']) {
            record['extractedText'] = prev['extractedText'];
          }
        }
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
                record,
              },
            },
            { upsert: true }
          );
          const prev = (existing['record'] as Record<string, unknown>) ?? {};
          const changed =
            prev['title'] !== record['title'] ||
            prev['type'] !== record['type'] ||
            (prev['courseExternalId'] as string) !== (record['courseExternalId'] as string);
          // eslint-disable-next-line max-depth
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

        // Server-side vision analysis: if this is an image with a stored URL and no
        // extractedText, analyze it with Claude vision (API key stays server-side).
        if (!record['extractedText']) {
          const storedUrl = record['url'] as string | undefined;
          const mimeType = record['mimeType'] as string | undefined;
          const fileName = record['fileName'] as string | undefined;
          void import('../../../services/VisionAnalysisService').then(
            ({ analyzeCourseMaterialImage }) => {
              analyzeCourseMaterialImage({
                database: params.database,
                collection: collection.collectionName,
                filter: baseFilter,
                mimeType,
                storedUrl,
                fileName,
              }).catch(() => {});
            }
          );
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
        throw new ValidationError('Missing deviceCode');
      }

      const result = await deviceRepo.deliverTokenOnce(deviceCode);
      if (result.status === 'expired') {
        throw new NotFoundError('Device code expired or not found');
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
    requireParent,
    asyncHandler(async (req: Request, res: Response) => {
      const userCode = (req.body?.userCode as string | undefined) ?? '';
      const userId = (req as unknown as { userId?: string }).userId ?? '';
      if (!userCode) {
        throw new ValidationError('Missing userCode');
      }
      if (!userId) {
        throw new AuthenticationError('Unauthorized');
      }

      const token = connectorTokenService.createToken(userId, randomUUID());
      const ok = await deviceRepo.approveByUserCode(userCode, userId, token);
      if (!ok) {
        throw new NotFoundError('User code not found or expired');
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
          const ownerUserId = student.dataUserId();
          const dataSources: Array<{
            sourceId: string;
            provider: string;
            displayName: string;
            portalBaseUrl?: string;
          }> = [];
          for (const ds of student.dataSources) {
            const ingestSource = await sourceRepo.findByUserIdAndSourceId(ownerUserId, ds.id);
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
        throw new ValidationError('Missing sourceId');
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
          throw new InternalError('Invalid credentials payload');
        }
        const ingestSource = await sourceRepo.findByUserIdAndSourceId(
          student.dataUserId(),
          sourceId
        );
        const baseUrl = credentials.baseUrl ?? ingestSource?.portalBaseUrl ?? '';
        if (credentials.authType === 'api') {
          res.status(200).json({ baseUrl, accessToken: credentials.accessToken ?? '' });
          return;
        }
        // authType was 'login' — portal passwords are no longer vaulted on the server.
        // Return 410 so callers know this endpoint will never return a portal password.
        res.status(410).json({
          success: false,
          error:
            'Portal login credentials are no longer stored on the server. Use the mobile app, browser extension, or local CLI to manage school portal credentials.',
        });
        return;
      }
      throw new NotFoundError('Source not found or no credentials set');
    })
  );

  router.post(
    '/sources',
    connectorAuth,
    asyncHandler(async (req: IConnectorAuthenticatedRequest, res: Response) => {
      const userId = req.connectorUserId ?? '';
      const { sourceId, provider, adapterId, displayName, portalBaseUrl } = req.body ?? {};
      if (!sourceId || !provider || !adapterId || !displayName) {
        throw new ValidationError('Missing required fields');
      }

      const stored = await sourceRepo.upsert({
        userId,
        sourceId,
        provider,
        adapterId,
        displayName,
        portalBaseUrl,
      });

      res
        .status(200)
        .json({ success: true, source: stored } satisfies IIngestSourceRegisterResponse);
    })
  );

  router.post(
    '/runs',
    connectorAuth,
    asyncHandler(async (req: IConnectorAuthenticatedRequest, res: Response) => {
      const actorUserId = req.connectorUserId ?? '';
      const { sourceId, clientMeta, runId: clientRunId } = req.body ?? {};
      if (!sourceId) {
        throw new ValidationError('Missing sourceId');
      }

      const dataUserId = await resolveDataUserId(config.database, actorUserId, sourceId);
      const lastCursor = await runRepo.findLastCommittedCursor(dataUserId, sourceId);
      const runId =
        typeof clientRunId === 'string' && clientRunId.length > 0 ? clientRunId : randomUUID();
      const meta =
        clientMeta && typeof clientMeta === 'object' && !Array.isArray(clientMeta)
          ? (clientMeta as Record<string, string>)
          : null;
      await runRepo.startRun({
        userId: dataUserId,
        actorUserId,
        sourceId,
        runId,
        lastCursor,
        clientMeta: meta,
      });

      res.status(200).json({
        success: true,
        runId,
        mode: 'delta',
        lastCursor,
      } satisfies IIngestRunStartResponse);
    })
  );

  router.post(
    '/runs/:runId/envelope',
    connectorAuth,
    asyncHandler(async (req: IConnectorAuthenticatedRequest, res: Response) => {
      const actorUserId = req.connectorUserId ?? '';
      const runId = req.params['runId'];
      if (!runId) {
        throw new ValidationError('Missing runId');
      }
      const envelope = req.body as ISlcIngestEnvelopeV1;

      const v = validateEnvelope(envelope);
      if (!v.valid) {
        throw new ValidationError(v.error ?? 'Invalid envelope');
      }
      if (envelope.run.runId !== runId) {
        throw new ValidationError('runId mismatch');
      }

      // Resolve the owner's userId from the ops' studentExternalId.
      const firstStudentExtId = envelope.ops.find(
        (op) => typeof op.key?.studentExternalId === 'string'
      )?.key?.studentExternalId;
      const dataUserId = await resolveDataUserId(
        config.database,
        actorUserId,
        envelope.source?.sourceId,
        firstStudentExtId
      );

      const prepared = await prepareIngestOps({
        ops: envelope.ops,
        mode: resolveEnrichOpsMode(config.enrichOpsMode),
        revalidate: (ops) => validateEnvelope({ ...envelope, ops }),
      });
      logger.info(
        {
          runId,
          enrichOpsMode: prepared.mode,
          enrichPatchCount: prepared.patchCount,
          enrichApplied: prepared.applied,
          enrichFailed: prepared.failed,
          clientEnrichmentSource: envelope.run.meta?.['enrichmentSource'] ?? 'none',
        },
        'ingest envelope enrichment'
      );

      await applyOps({
        database: config.database,
        userId: dataUserId,
        sourceId: envelope.source?.sourceId,
        ops: prepared.ops,
      });

      await scheduleGuidanceJobsFromOps({
        queue: config.queue,
        database: config.database,
        userId: dataUserId,
        timezone: envelope.run.timezone,
        ops: prepared.ops,
      });

      await logDataQuality({
        database: config.database,
        userId: dataUserId,
        ops: prepared.ops,
      });

      const sourceId = envelope.source?.sourceId ?? '';
      if (sourceId) {
        await autoCreateStudentsFromOps({
          database: config.database,
          userId: dataUserId,
          sourceId,
          ops: prepared.ops,
          provider: envelope.run?.provider ?? 'unknown',
          adapterId: envelope.run?.adapterId ?? 'unknown',
          portalBaseUrl: envelope.source?.portalBaseUrl,
        });

        // Ensure the ingest source metadata is stored under the owner's partition
        // (important when a co-parent registers the source under their own userId).
        if (dataUserId !== actorUserId) {
          await sourceRepo.upsert({
            userId: dataUserId,
            sourceId,
            provider: envelope.run?.provider ?? 'unknown',
            adapterId: envelope.run?.adapterId ?? 'unknown',
            displayName: envelope.source?.portalBaseUrl ?? sourceId,
            portalBaseUrl: envelope.source?.portalBaseUrl,
          });
        }
      }
      await runRepo.markUploaded(dataUserId, runId);
      res
        .status(200)
        .json({ success: true, accepted: true } satisfies IIngestEnvelopeAcceptResponse);
    })
  );

  router.post(
    '/runs/:runId/complete',
    connectorAuth,
    asyncHandler(async (req: IConnectorAuthenticatedRequest, res: Response) => {
      const actorUserId = req.connectorUserId ?? '';
      const runId = req.params['runId'];
      if (!runId) {
        throw new ValidationError('Missing runId');
      }

      // Look up the run (which is stored under dataUserId/owner) by runId only.
      const existingRun = await runRepo.findByRunId(runId);
      if (!existingRun) {
        throw new NotFoundError('Run not found');
      }
      // Verify the actor initiated this run or is the owner.
      const runActorUserId = existingRun.actorUserId?.toString() ?? existingRun.userId.toString();
      const runDataUserId = existingRun.userId.toString();
      if (runActorUserId !== actorUserId && runDataUserId !== actorUserId) {
        throw new AuthenticationError('Not authorized to complete this run');
      }

      const status = (req.body?.status as string | undefined) ?? 'success';
      if (status === 'failed') {
        const error =
          typeof req.body?.error === 'string' && req.body.error.length > 0
            ? req.body.error
            : 'Run failed';
        await runRepo.failRun({ userId: runDataUserId, runId, error });
        res.status(200).json({ success: true, committed: false, failed: true, error });
        return;
      }

      const cursor = req.body?.cursor as { type: 'opaque'; value: string } | undefined;
      await runRepo.commitRun({ userId: runDataUserId, runId, newCursor: cursor ?? null });
      // Stamp lastSyncedAt on the data source
      const committedRun = await runRepo.findByUserIdAndRunId(runDataUserId, runId);
      if (committedRun?.sourceId) {
        await sourceRepo.updateLastSyncedAt(runDataUserId, committedRun.sourceId);
      }
      // Generate user-facing alerts from ingested tasks (value loop)
      await generateAlertsFromIngestedAssignments({
        database: config.database,
        userId: runDataUserId,
        queue: config.queue,
      });
      // LLM-based material matching (Layer 3) — fire-and-forget
      void matchUnmatchedMaterialsViaLlm({
        database: config.database,
        userId: runDataUserId,
      }).catch((err: unknown) => {
        console.error('[MaterialMatcher] post-ingest LLM matching failed:', err);
      });
      res.status(200).json({
        success: true,
        committed: true,
        newCursor: cursor ?? null,
        derivedAlertsQueued: true,
      } satisfies IIngestRunCompleteResponse);
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
