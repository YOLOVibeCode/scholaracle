import type {
  IStudentSession,
  ITodayView,
  IWeekView,
  StudentStatus,
  WeekNeed,
} from '@scholaracle/contracts';

/**
 * Student Today / This-week composers. Read a narrow port (ITodaySource /
 * IWeekSource) — never the grades API, siblings, or parent nudge.
 */

export type WinKind = 'graded' | 'opened_pack' | 'on_time_streak';

/**
 * `missing` and `due_soon` feed Today. `upcoming` is open work due within the
 * next 7 days but beyond the due-soon window; Today ignores it, This week shows it.
 */
export type OpenTaskKind = 'missing' | 'due_soon' | 'upcoming';

export interface IWin {
  readonly kind: WinKind;
  readonly assignmentExternalId: string;
  readonly title: string;
  readonly courseName: string;
}

export interface IOpenTask {
  readonly kind: OpenTaskKind;
  readonly assignmentExternalId: string;
  readonly title: string;
  readonly courseName: string;
  readonly courseExternalId?: string;
  readonly dueAt?: string;
  readonly primaryCtaLabel: string;
  /** What the student said about this task; absent means not started. */
  readonly studentStatus?: StudentStatus;
  /** What the student needs to do it, derived once from the work-pack partition. */
  readonly needs?: readonly WeekNeed[];
}

/** Portal says turned in or graded. Carries no score. */
export interface IDoneTask {
  readonly assignmentExternalId: string;
  readonly title: string;
  readonly courseName: string;
  readonly dueAt?: string;
  /** When it was finished: submittedAt, else gradedAt, else dueAt (ISO). */
  readonly doneAt: string;
}

export interface ITodaySource {
  recentWins(): Promise<readonly IWin[]>;
  openTasks(): Promise<readonly IOpenTask[]>;
}

export interface IWeekSource extends ITodaySource {
  /**
   * Assignments the portal shows as turned in or graded. The adapter may
   * return more than a week; WeekGuide applies the rolling 7-day window.
   */
  doneThisWeek(): Promise<readonly IDoneTask[]>;
}

export interface ITodayGuide {
  load(session: IStudentSession): Promise<ITodayView>;
}

export interface IWeekGuide {
  load(session: IStudentSession, now: Date): Promise<IWeekView>;
}
