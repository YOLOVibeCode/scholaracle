export const SLC_INGEST_SCHEMA_VERSION_V1 = 'slc.ingest.v1' as const;

export type SlcSchemaVersion = typeof SLC_INGEST_SCHEMA_VERSION_V1;

export type SlcIngestMode = 'delta';

export type SlcEntityType =
  | 'assignment'
  | 'eventSeries'
  | 'eventOverride'
  | 'academicTerm'
  | 'institution'
  | 'course'
  | 'gradeSnapshot'
  | 'attendanceEvent';

export type SlcOpType = 'upsert' | 'delete';

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

// --- Normalized entity shapes (minimum viable) ---

export interface ISlcAssignment {
  readonly title: string;
  readonly dueAt?: string; // ISO timestamp
  readonly status?: 'missing' | 'submitted' | 'graded' | 'late' | 'unknown';
  readonly pointsPossible?: number;
  readonly pointsEarned?: number;
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
}

export interface ISlcAcademicTerm {
  readonly title: string;
  readonly startDate: string; // ISO date (YYYY-MM-DD)
  readonly endDate: string; // ISO date (YYYY-MM-DD)
  readonly type?: 'semester' | 'quarter' | 'trimester' | 'year' | 'other';
}

export interface ISlcGradeSnapshot {
  readonly courseExternalId: string;
  readonly termExternalId?: string;
  readonly letterGrade?: string;
  readonly percentGrade?: number;
  readonly gpa?: number;
  readonly asOfDate: string; // ISO date (YYYY-MM-DD)
}

export interface ISlcAttendanceEvent {
  readonly date: string; // ISO date (YYYY-MM-DD)
  readonly status: 'present' | 'absent' | 'tardy' | 'excused';
  readonly periodName?: string;
  readonly notes?: string;
}

export interface ISlcInstitution {
  readonly name: string;
  readonly type?: 'school' | 'district' | 'other';
  readonly address?: string;
}
