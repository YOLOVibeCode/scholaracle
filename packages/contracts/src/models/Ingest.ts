// ---------------------------------------------------------------------------
// Schema constants
// ---------------------------------------------------------------------------

export const SLC_INGEST_SCHEMA_VERSION_V1 = 'slc.ingest.v1' as const;

export type SlcSchemaVersion = typeof SLC_INGEST_SCHEMA_VERSION_V1;

export type SlcIngestMode = 'delta';

// ---------------------------------------------------------------------------
// Entity types
// ---------------------------------------------------------------------------

export type SlcEntityType =
  | 'assignment'
  | 'eventSeries'
  | 'eventOverride'
  | 'academicTerm'
  | 'institution'
  | 'course'
  | 'gradeSnapshot'
  | 'attendanceEvent'
  | 'teacher'
  | 'courseMaterial'
  | 'message'
  | 'studentProfile';

/** Runtime-accessible list of all valid entity types. */
export const SLC_ENTITY_TYPES: readonly SlcEntityType[] = [
  'assignment',
  'eventSeries',
  'eventOverride',
  'academicTerm',
  'institution',
  'course',
  'gradeSnapshot',
  'attendanceEvent',
  'teacher',
  'courseMaterial',
  'message',
  'studentProfile',
] as const;

export type SlcOpType = 'upsert' | 'delete';

// ---------------------------------------------------------------------------
// Envelope structure
// ---------------------------------------------------------------------------

export interface ISlcEntityKey {
  readonly provider: string;
  readonly adapterId: string;
  readonly externalId: string;
  readonly studentExternalId?: string;
  readonly institutionExternalId?: string;
  readonly courseExternalId?: string;
  readonly termExternalId?: string;
}

export interface ISlcCursorOpaque {
  readonly type: 'opaque';
  readonly value: string;
  readonly capturedAt?: string; // ISO timestamp
}

export type ISlcCursor = ISlcCursorOpaque;

export interface ISlcRunMeta {
  readonly runId: string;
  readonly startedAt: string; // ISO timestamp
  readonly endedAt?: string; // ISO timestamp
  readonly provider: string;
  readonly adapterId: string;
  readonly adapterVersion: string;
  readonly mode: SlcIngestMode; // v0.1: delta only
  readonly timezone: string; // IANA tz
  /**
   * Optional client identity / version stamp.
   * e.g. { clientType: 'mobile', coreVersion: '0.1.0', extractorBundleHash: 'abc' }
   */
  readonly meta?: Readonly<Record<string, string>>;
}

export interface ISlcSourceMeta {
  readonly sourceId: string;
  readonly displayName: string;
  readonly portalBaseUrl?: string;
}

export interface ISlcDeltaOp<TRecord = Record<string, unknown>> {
  readonly op: SlcOpType;
  readonly entity: SlcEntityType;
  readonly key: ISlcEntityKey;
  readonly observedAt: string; // ISO timestamp
  readonly record?: TRecord; // required for upsert; omitted for delete
}

export interface ISlcIngestEnvelopeV1 {
  readonly schemaVersion: SlcSchemaVersion;
  readonly run: ISlcRunMeta;
  readonly source: ISlcSourceMeta;
  readonly cursor?: ISlcCursor; // optional for cursorless delta
  readonly ops: readonly ISlcDeltaOp[];
  readonly stats?: Record<string, number>;
  readonly warnings?: readonly string[];
}

// ---------------------------------------------------------------------------
// Shared supporting types
// ---------------------------------------------------------------------------

/** Per-criterion rubric score for an assignment. */
export interface ISlcRubricScore {
  readonly criterion: string;
  readonly score?: number;
  readonly possiblePoints?: number;
  readonly rating?: string;
  readonly comments?: string;
}

/** File or link attachment. */
export interface ISlcAttachment {
  readonly name: string;
  readonly url?: string;
  readonly type?: string; // MIME type or "link", "file", "video"
  readonly size?: number; // bytes
}

/** Grade category breakdown (e.g., Tests 40%, Homework 30%). */
export interface ISlcGradeCategory {
  readonly name: string;
  readonly weight: number; // percentage 0-100
  readonly earnedPoints?: number;
  readonly possiblePoints?: number;
  readonly percentScore?: number;
  readonly letterGrade?: string;
}

// ---------------------------------------------------------------------------
// Entity shapes — enriched for full AI analysis
// ---------------------------------------------------------------------------

export interface ISlcAssignment {
  readonly title: string;
  /** Full assignment description or instructions (HTML or plain text). */
  readonly description?: string;
  readonly dueAt?: string; // ISO timestamp
  /** When the assignment was posted/assigned. */
  readonly assignedAt?: string; // ISO timestamp
  readonly status?:
    | 'missing'
    | 'submitted'
    | 'graded'
    | 'late'
    | 'not_started'
    | 'in_progress'
    | 'excused'
    | 'unknown';
  readonly pointsPossible?: number;
  readonly pointsEarned?: number;
  /** Computed or scraped percentage score. */
  readonly percentScore?: number;
  /** Per-assignment letter grade if available. */
  readonly letterGrade?: string;
  /** Grading category: "Tests", "Homework", "Projects", "Classwork", etc. */
  readonly category?: string;
  /** Weight of this category in the overall grade (0-100). */
  readonly categoryWeight?: number;
  /** When the student submitted. */
  readonly submittedAt?: string; // ISO timestamp
  /** When the teacher graded it. */
  readonly gradedAt?: string; // ISO timestamp
  /** Teacher feedback or comments on the submission. */
  readonly teacherFeedback?: string;
  /** Per-criterion rubric breakdown. */
  readonly rubricScores?: readonly ISlcRubricScore[];
  readonly isLate?: boolean;
  readonly isMissing?: boolean;
  readonly isExcused?: boolean;
  /** Human-readable description of how late it was turned in. */
  readonly turnedInLateBy?: string;
  /** Attached files or links. */
  readonly attachments?: readonly ISlcAttachment[];
  /** Submission type: "online", "paper", "external_tool". */
  readonly submissionType?: string;
  /** Link to the assignment on the platform. */
  readonly url?: string;
  /** Link to the parent course entity. */
  readonly courseExternalId?: string;
  /** Link to the grading period. */
  readonly termExternalId?: string;
}

export interface ISlcEventSeries {
  readonly title: string;
  readonly category:
    | 'test'
    | 'quiz'
    | 'classwork'
    | 'project'
    | 'meeting'
    | 'field_trip'
    | 'activity'
    | 'deadline'
    | 'other';
  readonly timezone: string; // IANA tz
  readonly startsAt: string; // ISO (local tz representation acceptable)
  readonly endsAt?: string; // ISO
  readonly durationMinutes?: number;
  readonly recurrence: {
    readonly rrule: string; // RFC 5545 RRULE
    readonly until?: string; // ISO timestamp
    readonly count?: number;
    readonly exDates?: readonly string[]; // ISO timestamps
  };
}

export interface ISlcEventOverride {
  readonly seriesExternalId: string;
  readonly occurrenceStartAt: string; // ISO (series timezone)
  readonly op: 'modify' | 'cancel';
  readonly startsAt?: string; // required if modify
  readonly endsAt?: string;
  readonly title?: string;
  readonly category?: ISlcEventSeries['category'];
}

export interface ISlcCourse {
  readonly title: string;
  readonly courseCode?: string;
  readonly subjectArea?: string;
  readonly teacherName?: string;
  /** Teacher email address for this course. */
  readonly teacherEmail?: string;
  /** Class period: "1st", "3rd", "A", etc. */
  readonly period?: string;
  /** Room number or location. */
  readonly room?: string;
  /** Daily start time HH:MM. */
  readonly startTime?: string;
  /** Daily end time HH:MM. */
  readonly endTime?: string;
  /** Days the class meets: 0=Sun, 1=Mon, ... 6=Sat. */
  readonly daysOfWeek?: readonly number[];
  /** Link to the grading period/term entity. */
  readonly termExternalId?: string;
  /** Course description or syllabus summary. */
  readonly description?: string;
  /** Link to the course on the platform. */
  readonly url?: string;
}

/**
 * Academic term: school year, semester, quarter, or grading period.
 * Hierarchy: year → semesters (e.g. 2) → grading periods (e.g. 3–4 per semester).
 * Use parentTermExternalId to link grading periods to a semester, semesters to a year.
 */
export interface ISlcAcademicTerm {
  readonly title: string;
  readonly startDate: string; // ISO date (YYYY-MM-DD)
  readonly endDate: string; // ISO date (YYYY-MM-DD)
  /** year | semester | quarter | trimester | grading_period | other */
  readonly type?: 'semester' | 'quarter' | 'trimester' | 'year' | 'grading_period' | 'other';
  /** Parent term's externalId (e.g. grading period → semester, semester → year). */
  readonly parentTermExternalId?: string;
}

export interface ISlcGradeSnapshot {
  readonly courseExternalId: string;
  readonly termExternalId?: string;
  readonly letterGrade?: string;
  readonly percentGrade?: number;
  readonly gpa?: number;
  readonly asOfDate: string; // ISO date (YYYY-MM-DD)
  /** Total points earned across all assignments. */
  readonly earnedPoints?: number;
  /** Total points possible across all assignments. */
  readonly possiblePoints?: number;
  /** Number of missing assignments in this course. */
  readonly missingCount?: number;
  /** Number of late assignments in this course. */
  readonly lateCount?: number;
  /** Per-category grade breakdown (e.g., Tests 40%, Homework 30%). */
  readonly categories?: readonly ISlcGradeCategory[];
  /** Grade trajectory. */
  readonly trend?: 'improving' | 'declining' | 'stable' | 'unknown';
  /** Class average if the platform shows it. */
  readonly classAverage?: number;
  /** Class rank or percentile if available. */
  readonly classRank?: string;
  /** Teacher report card comments. */
  readonly teacherComments?: string;
}

export interface ISlcAttendanceEvent {
  readonly date: string; // ISO date (YYYY-MM-DD)
  readonly status:
    'present' | 'absent' | 'tardy' | 'excused' | 'unexcused' | 'partial' | 'field_trip';
  readonly periodName?: string;
  /** Course name for period-level attendance. */
  readonly courseName?: string;
  /** Link to the course entity. */
  readonly courseExternalId?: string;
  readonly notes?: string;
  /** Minutes of class missed. */
  readonly minutesMissed?: number;
  /** Reason for the excuse (illness, appointment, etc.). */
  readonly excuseReason?: string;
}

export interface ISlcInstitution {
  readonly name: string;
  readonly type?: 'school' | 'district' | 'other';
  readonly address?: string;
}

// --- Extended entity shapes ---

export interface ISlcTeacher {
  /** Teacher's display name. */
  readonly name: string;
  /** Email address (if available). */
  readonly email?: string;
  /** Phone number (if available). */
  readonly phone?: string;
  /** Department or subject area. */
  readonly department?: string;
  /** Honorific: "Mr.", "Mrs.", "Dr.", etc. */
  readonly title?: string;
  /** Office hours description. */
  readonly officeHours?: string;
  /** Preferred contact method: "email", "phone", "portal message". */
  readonly preferredContact?: string;
  /** External IDs of courses this teacher is associated with. */
  readonly courseExternalIds?: readonly string[];
}

export interface ISlcCourseMaterial {
  /** Title of the document or material. */
  readonly title: string;
  /** Which course this material belongs to. */
  readonly courseExternalId: string;
  /** Assignment this material is attached to (if assignment-scoped). */
  readonly assignmentExternalId?: string;
  /** Material type. */
  readonly type:
    | 'document'
    | 'link'
    | 'syllabus'
    | 'handout'
    | 'rubric'
    | 'study_guide'
    | 'presentation'
    | 'video'
    | 'other';
  /** URL to the document/resource (if available). */
  readonly url?: string;
  /** File name (if it's a downloadable file). */
  readonly fileName?: string;
  /** MIME type (if known). */
  readonly mimeType?: string;
  /** When the material was posted. */
  readonly postedAt?: string;
  /** Description or notes. */
  readonly description?: string;
  /** Text content extracted from the document (for AI analysis). */
  readonly extractedText?: string;
  /** File size in bytes. */
  readonly fileSize?: number;
  /** Whether the link is public, behind auth, or unknown. */
  readonly linkAccessibility?: 'public' | 'authenticated' | 'unknown';
}

export interface ISlcMessage {
  /** Subject line. */
  readonly subject: string;
  /** Message body (plain text or HTML). */
  readonly body: string;
  /** Who sent the message. */
  readonly senderName: string;
  /** Sender's role. */
  readonly senderRole?: 'teacher' | 'admin' | 'counselor' | 'system' | 'parent' | 'student';
  /** When the message was sent. */
  readonly sentAt: string;
  /** Whether the message has been read. */
  readonly read?: boolean;
  /** Associated course (if any). */
  readonly courseExternalId?: string;
  /** Attached files or links. */
  readonly attachments?: readonly ISlcAttachment[];
  /** Audience description: "all parents", "Period 3", etc. */
  readonly recipients?: string;
  /** Message importance level. */
  readonly importance?: 'normal' | 'important' | 'urgent';
  /** Message category. */
  readonly category?: 'academic' | 'administrative' | 'event' | 'reminder' | 'behavioral' | 'other';
}

/** Student identity and demographic information. */
export interface ISlcStudentProfile {
  /** Full display name. */
  readonly name: string;
  readonly firstName?: string;
  readonly lastName?: string;
  /** School-issued student ID. */
  readonly studentId?: string;
  /** Grade level: "9th", "10th", "Junior", etc. */
  readonly gradeLevel?: string;
  /** School name. */
  readonly school?: string;
  /** District name. */
  readonly district?: string;
  /** Enrollment status: "active", "withdrawn", etc. */
  readonly enrollmentStatus?: string;
  /** Assigned counselor name. */
  readonly counselor?: string;
  /** Assigned advisor name. */
  readonly advisor?: string;
  /** Homeroom identifier. */
  readonly homeroom?: string;
}

// ---------------------------------------------------------------------------
// Runtime validation
// ---------------------------------------------------------------------------

export interface IEntityRecordValidationResult {
  readonly valid: boolean;
  readonly errors: readonly string[];
}

function ok(): IEntityRecordValidationResult {
  return { valid: true, errors: [] };
}

function fail(...errors: string[]): IEntityRecordValidationResult {
  return { valid: false, errors };
}

function requireString(entity: string, field: string, value: unknown): string | null {
  if (value === undefined || value === null) return `${entity}.${field} is required`;
  if (typeof value !== 'string') return `${entity}.${field} must be a string`;
  if (value.trim().length === 0) return `${entity}.${field} must be non-empty`;
  return null;
}

/**
 * Validates that a record conforms to the required fields for a given entity type.
 * Optional fields are not checked — only required fields are enforced.
 */
// eslint-disable-next-line complexity
export function validateEntityRecord(
  entity: SlcEntityType,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  record: Record<string, any>
): IEntityRecordValidationResult {
  if (!SLC_ENTITY_TYPES.includes(entity)) {
    return fail(`Unknown entity type: ${entity}`);
  }

  const errors: string[] = [];
  const r = record as Record<string, unknown>;

  switch (entity) {
    case 'assignment': {
      const e = requireString('assignment', 'title', r['title']);
      if (e) errors.push(e);
      break;
    }

    case 'gradeSnapshot': {
      const e1 = requireString('gradeSnapshot', 'courseExternalId', r['courseExternalId']);
      const e2 = requireString('gradeSnapshot', 'asOfDate', r['asOfDate']);
      if (e1) errors.push(e1);
      if (e2) errors.push(e2);
      break;
    }

    case 'course': {
      const e = requireString('course', 'title', r['title']);
      if (e) errors.push(e);
      break;
    }

    case 'studentProfile': {
      const e = requireString('studentProfile', 'name', r['name']);
      if (e) errors.push(e);
      break;
    }

    case 'attendanceEvent': {
      const e1 = requireString('attendanceEvent', 'date', r['date']);
      const e2 = requireString('attendanceEvent', 'status', r['status']);
      if (e1) errors.push(e1);
      if (e2) errors.push(e2);
      break;
    }

    case 'teacher': {
      const e = requireString('teacher', 'name', r['name']);
      if (e) errors.push(e);
      break;
    }

    case 'courseMaterial': {
      const e1 = requireString('courseMaterial', 'title', r['title']);
      const e2 = requireString('courseMaterial', 'courseExternalId', r['courseExternalId']);
      const e3 = requireString('courseMaterial', 'type', r['type']);
      if (e1) errors.push(e1);
      if (e2) errors.push(e2);
      if (e3) errors.push(e3);
      break;
    }

    case 'message': {
      const e1 = requireString('message', 'subject', r['subject']);
      const e2 = requireString('message', 'body', r['body']);
      const e3 = requireString('message', 'senderName', r['senderName']);
      const e4 = requireString('message', 'sentAt', r['sentAt']);
      if (e1) errors.push(e1);
      if (e2) errors.push(e2);
      if (e3) errors.push(e3);
      if (e4) errors.push(e4);
      break;
    }

    case 'academicTerm': {
      const e1 = requireString('academicTerm', 'title', r['title']);
      const e2 = requireString('academicTerm', 'startDate', r['startDate']);
      const e3 = requireString('academicTerm', 'endDate', r['endDate']);
      if (e1) errors.push(e1);
      if (e2) errors.push(e2);
      if (e3) errors.push(e3);
      break;
    }

    case 'institution': {
      const e = requireString('institution', 'name', r['name']);
      if (e) errors.push(e);
      break;
    }

    case 'eventSeries': {
      const e1 = requireString('eventSeries', 'title', r['title']);
      if (e1) errors.push(e1);
      break;
    }

    case 'eventOverride': {
      const e1 = requireString('eventOverride', 'seriesExternalId', r['seriesExternalId']);
      if (e1) errors.push(e1);
      break;
    }
  }

  return errors.length > 0 ? fail(...errors) : ok();
}
