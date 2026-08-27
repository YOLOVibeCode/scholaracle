import type { IStudentSession, ITodayView } from '@scholaracle/contracts';

/**
 * Student Today composer. Reads a narrow port (ITodaySource) — never the
 * grades API, siblings, or parent nudge.
 */

export type WinKind = 'graded' | 'opened_pack' | 'on_time_streak';

export type OpenTaskKind = 'missing' | 'due_soon';

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
}

export interface ITodaySource {
  recentWins(): Promise<readonly IWin[]>;
  openTasks(): Promise<readonly IOpenTask[]>;
}

export interface ITodayGuide {
  load(session: IStudentSession): Promise<ITodayView>;
}
