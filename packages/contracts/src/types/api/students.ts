/**
 * Wire contract for GET /api/students.
 *
 * Server is source of truth: packages/api/src/routes/students/students.ts
 * (list handler projection). Web keeps a hand-mirror at
 * packages/web/lib/api/students.ts — update it manually if this changes.
 */

/** Student stats as serialized over JSON (dates become ISO strings). */
export interface IStudentStatsWire {
  readonly currentGPA?: number;
  readonly totalAssignments?: number;
  readonly missingAssignments?: number;
  readonly onTimeRate?: number;
  readonly lastUpdated?: string;
}

/** One entry of the GET /api/students response array. */
export interface IStudentListItem {
  /** Mongo ObjectId string — THE identifier for all /api/students/:id/* calls. */
  readonly id: string;
  readonly userId: string;
  readonly name: string;
  readonly grade?: number;
  /** External (SIS/portal) student id — used only for ingest-op matching, never as a URL param. */
  readonly studentId?: string;
  readonly stats?: IStudentStatsWire;
}
