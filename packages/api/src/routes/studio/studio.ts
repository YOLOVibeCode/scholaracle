import { Router, type Request, type Response } from 'express';
import type { Db, Document, WithId } from 'mongodb';
import { StudentRepository, UserRepository, type Student } from '@scholaracle/database';
import {
  NotFoundError,
  ValidationError,
  STUDENT_STATUSES,
  STUDENT_HELP_NOTE_MAX_CHARS,
  type IStudentStatusUpdateResponse,
  type StudentStatus,
} from '@scholaracle/contracts';
import { TodayGuide, WeekGuide, WorkPack } from '@scholaracle/studio-core';
import { resolveStudentTimeZone } from '@scholaracle/agents';
import { asyncHandler } from '../../middleware/asyncHandler';
import { resolveStudioStudent, slcStudentFilter, toStudentSession } from './studioScope';
import { createMongoTodaySource } from './mongoTodaySource';
import { createMongoWorkPackSource } from './mongoWorkPackSource';
import { buildOfflinePack } from './mongoOfflinePackSource';
import {
  HELP_FIELDS_UNSET,
  StudentHelpRequests,
  type IAlertJobQueue,
  type IHelpRequestAssignment,
} from './studentHelpRequests';

export interface IStudioRouterConfig {
  readonly database: Db;
  readonly baseUrl?: string;
  readonly jwtSecret?: string;
  /** Request clock; one instant per request feeds both the adapter and the composer. Tests inject it. */
  readonly clock?: () => Date;
  /**
   * Notify queue. server.ts passes the MongoQueue the ingest alerts use, so a "Need help" tap
   * enqueues a student_needs_help notify job through the same path; tests inject a fake.
   */
  readonly alertQueue?: IAlertJobQueue;
}

const VALID_STUDENT_STATUSES = new Set<string>(STUDENT_STATUSES);

interface IStatusBody {
  readonly status: StudentStatus | null;
  readonly note?: string;
}

/** The owner's IANA time zone (settings.ts stores it on the user). Unknown → undefined. */
async function ownerTimeZoneById(
  userRepository: UserRepository,
  ownerUserId: string
): Promise<string | undefined> {
  try {
    const owner = await userRepository.findById(ownerUserId);
    return owner?.timezone;
  } catch {
    return undefined;
  }
}

function parseNote(raw: unknown): string | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw !== 'string') {
    throw new ValidationError('note must be a string');
  }
  const trimmed = raw.trim();
  if (Array.from(trimmed).length > STUDENT_HELP_NOTE_MAX_CHARS) {
    throw new ValidationError(`note must be at most ${STUDENT_HELP_NOTE_MAX_CHARS} characters`);
  }
  return trimmed === '' ? undefined : trimmed;
}

function parseStatusBody(body: unknown): IStatusBody {
  const raw = (body ?? {}) as { status?: unknown; note?: unknown };
  const status = raw.status === null || raw.status === '' ? null : raw.status;
  if (status !== null && (typeof status !== 'string' || !VALID_STUDENT_STATUSES.has(status))) {
    throw new ValidationError(`Invalid status. Must be one of: ${STUDENT_STATUSES.join(', ')}`);
  }
  const note = parseNote(raw.note);
  return { status: status as StudentStatus | null, ...(note !== undefined ? { note } : {}) };
}

/**
 * Title, course and due date for the alert copy. The course name reads `record.title`
 * first and `record.name` second, the same precedence ingest uses for alert copy.
 */
async function describeAssignment(
  database: Db,
  student: Student,
  doc: WithId<Document>
): Promise<IHelpRequestAssignment> {
  const record = (doc['record'] ?? {}) as Record<string, unknown>;
  const title = record['title'];
  const dueAt = record['dueAt'];
  const courseExternalId = doc['courseExternalId'];
  const base: IHelpRequestAssignment = {
    externalId: String(doc['externalId'] ?? ''),
    title: typeof title === 'string' && title !== '' ? title : 'Assignment',
    ...(typeof courseExternalId === 'string' ? { courseExternalId } : {}),
    ...(typeof dueAt === 'string' ? { dueAt } : {}),
  };
  if (base.courseExternalId === undefined) return base;
  const course = await database.collection('slc_courses').findOne({
    userId: student.dataUserId(),
    externalId: base.courseExternalId,
    deletedAt: null,
  });
  const courseRecord = (course?.['record'] ?? {}) as Record<string, unknown>;
  const name = [courseRecord['title'], courseRecord['name']].find(
    (value): value is string => typeof value === 'string' && value !== ''
  );
  return name !== undefined ? { ...base, courseName: name } : base;
}

export function studioRouter(config: IStudioRouterConfig): Router {
  const router = Router();
  const studentRepository = new StudentRepository(config.database);
  const userRepository = new UserRepository(config.database);
  const baseUrl = config.baseUrl ?? '';
  const clock = config.clock ?? ((): Date => new Date());
  const helpRequests = new StudentHelpRequests({
    database: config.database,
    queue: config.alertQueue,
    webOrigin: baseUrl,
    resolveTimeZone: (ownerUserId) => ownerTimeZoneById(userRepository, ownerUserId),
    now: clock,
  });

  router.get(
    '/today',
    asyncHandler(async (req: Request, res: Response) => {
      const student = await resolveStudioStudent(req, studentRepository);
      const session = toStudentSession(student);
      const guide = new TodayGuide(
        createMongoTodaySource({
          database: config.database,
          student,
          baseUrl,
          jwtSecret: config.jwtSecret,
          now: clock(),
        })
      );
      const view = await guide.load(session);
      res.status(200).json(view);
    })
  );

  router.get(
    '/week',
    asyncHandler(async (req: Request, res: Response) => {
      const student = await resolveStudioStudent(req, studentRepository);
      const session = toStudentSession(student);
      // Day bucketing: the student login's zone, else the owner's, else America/New_York —
      // the same rule the weekly-review worker applies, so the push matches the screen.
      const timeZone = await resolveStudentTimeZone(config.database, student);
      // One instant for the whole request: classification and day slots agree at midnight.
      const now = clock();
      const guide = new WeekGuide(
        createMongoTodaySource({
          database: config.database,
          student,
          baseUrl,
          jwtSecret: config.jwtSecret,
          now,
        }),
        { timeZone }
      );
      const view = await guide.load(session, now);
      res.status(200).json(view);
    })
  );

  router.get(
    '/assignments/:externalId',
    asyncHandler(async (req: Request, res: Response) => {
      const externalId = req.params['externalId'] ?? '';
      if (externalId === '') {
        throw new ValidationError('Missing assignment external ID');
      }
      const student = await resolveStudioStudent(req, studentRepository);
      const session = toStudentSession(student);
      const pack = new WorkPack(
        createMongoWorkPackSource({
          database: config.database,
          student,
          baseUrl,
          jwtSecret: config.jwtSecret,
        })
      );
      const view = await pack.load(session, externalId);
      res.status(200).json(view);
    })
  );

  router.get(
    '/courses/:courseExternalId/offline-pack',
    asyncHandler(async (req: Request, res: Response) => {
      const courseExternalId = req.params['courseExternalId'] ?? '';
      if (courseExternalId === '') {
        throw new ValidationError('Missing courseExternalId');
      }
      const student = await resolveStudioStudent(req, studentRepository);
      const pack = await buildOfflinePack({
        database: config.database,
        student,
        courseExternalId,
        baseUrl: config.baseUrl ?? '',
        jwtSecret: config.jwtSecret,
      });
      res.status(200).json(pack);
    })
  );

  /**
   * Student status tap. `need_help` also tells the adults (student review spec §3.2):
   * the note (≤140 chars) is stored on the assignment and travels with the alert; one alert
   * per assignment per 24 h. Any other status clears the note and the ask.
   */
  router.patch(
    '/assignments/:externalId/status',
    asyncHandler(async (req: Request, res: Response) => {
      const externalId = req.params['externalId'] ?? '';
      if (externalId === '') {
        throw new ValidationError('Missing assignment external ID');
      }
      const student = await resolveStudioStudent(req, studentRepository);
      const { status, note } = parseStatusBody(req.body);
      const assignments = config.database.collection('slc_assignments');
      const doc = await assignments.findOne({ ...slcStudentFilter(student), externalId });
      if (doc === null) {
        throw new NotFoundError('Assignment not found');
      }
      const now = clock();

      if (status !== 'need_help') {
        await assignments.updateOne(
          { _id: doc._id },
          { $set: { studentStatus: status, updatedAt: now }, $unset: HELP_FIELDS_UNSET }
        );
        const body: IStudentStatusUpdateResponse = { success: true, studentStatus: status };
        res.status(200).json(body);
        return;
      }

      const alreadyAsking =
        doc['studentStatus'] === 'need_help' && doc['studentHelpRequestedAt'] instanceof Date;
      await assignments.updateOne(
        { _id: doc._id },
        {
          $set: {
            studentStatus: status,
            updatedAt: now,
            ...(note !== undefined ? { studentNote: note, studentNoteAt: now } : {}),
            ...(alreadyAsking ? {} : { studentHelpRequestedAt: now }),
          },
        }
      );
      const assignment = await describeAssignment(config.database, student, doc);
      const outcome = await helpRequests.notifyAdults(student, assignment, note);
      const body: IStudentStatusUpdateResponse = {
        success: true,
        studentStatus: status,
        ...(note !== undefined ? { studentNote: note } : {}),
        ...outcome,
      };
      res.status(200).json(body);
    })
  );

  return router;
}
