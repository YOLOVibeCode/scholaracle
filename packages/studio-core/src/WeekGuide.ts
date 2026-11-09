import {
  assertNoGradeLeak,
  type IStudentSession,
  type IWeekDay,
  type IWeekDone,
  type IWeekItem,
  type IWeekView,
} from '@scholaracle/contracts';
import type {
  IDoneTask,
  IOpenTask,
  IWeekGuide,
  IWeekSource,
  OpenTaskKind,
} from '@scholaracle/interfaces';
import { sortByDueAsc } from './dueOrder';
import { encouragementLine } from './encouragement';
import { humanAssignmentStatus } from './humanAssignmentStatus';
import {
  WEEK_DAY_COUNT,
  buildWeekDays,
  calendarDayOffset,
  isValidTimeZone,
  localDayOf,
} from './weekDays';

/** Shown on an owed item the student marked done while the portal still says missing. */
export const MARKED_DONE_WARNING = 'Marked done, but the school shows not turned in';

/** Open work past its due date that the school has not (yet) called missing. */
export const PAST_DUE_LABEL = 'Past due';

const HUMAN_STATUS: Readonly<Record<OpenTaskKind, string>> = {
  missing: humanAssignmentStatus('missing'),
  overdue: PAST_DUE_LABEL,
  due_soon: 'Due soon',
  upcoming: 'Coming up',
};

export interface IWeekGuideOptions {
  /** IANA zone for day bucketing. Invalid or absent falls back to UTC. */
  readonly timeZone?: string;
}

/**
 * Pure This-week composer on the IWeekSource port: owed (missing, then past
 * due, each oldest first), the next seven local days, and what got finished.
 * The source does not cut the horizon; this composer alone decides what falls
 * inside the seven local days and drops the rest. Same encouragement rules as
 * Today. Never grades, siblings, or parent nudge.
 */
export class WeekGuide implements IWeekGuide {
  private readonly _source: IWeekSource;
  private readonly _timeZone: string;

  constructor(source: IWeekSource, options: IWeekGuideOptions = {}) {
    this._source = source;
    const requested = options.timeZone ?? 'UTC';
    this._timeZone = isValidTimeZone(requested) ? requested : 'UTC';
  }

  public async load(session: IStudentSession, now: Date): Promise<IWeekView> {
    const [wins, tasks, finished] = await Promise.all([
      this._source.recentWins(),
      this._source.openTasks(),
      this._source.doneThisWeek(),
    ]);

    const slots = buildWeekDays(now, this._timeZone);
    const buckets = new Map<string, IWeekItem[]>(slots.map((slot) => [slot.date, []]));
    const missing: IWeekItem[] = [];
    const overdue: IWeekItem[] = [];
    const studentDone: IWeekDone[] = [];

    for (const task of tasks) {
      if (task.kind === 'missing') {
        missing.push(this._toItem(task, task.studentStatus === 'done'));
        continue;
      }
      if (task.studentStatus === 'done') {
        studentDone.push(this._toDone(task, false));
        continue;
      }
      if (task.kind === 'overdue') {
        overdue.push(this._toItem(task, false));
        continue;
      }
      const day = localDayOf(task.dueAt, this._timeZone);
      const bucket = day !== undefined ? buckets.get(day) : undefined;
      if (bucket) bucket.push(this._toItem(task, false));
    }

    const owed = [...sortByDueAsc(missing), ...sortByDueAsc(overdue)];
    const days: IWeekDay[] = slots.map((slot) => ({
      date: slot.date,
      label: slot.label,
      items: sortByDueAsc(buckets.get(slot.date) ?? []),
    }));
    const doneThisWeek = this._mergeDone(studentDone, this._confirmedThisWeek(finished, now));
    const due = days.reduce((sum, day) => sum + day.items.length, 0);

    const view: IWeekView = {
      encouragement: encouragementLine(wins, owed.length + due > 0),
      owed,
      days,
      doneThisWeek,
      counts: { owed: owed.length, due, done: doneThisWeek.length },
    };
    assertNoGradeLeak(view, session.showGrades);
    return view;
  }

  /** Portal-confirmed work finished in the last seven local days or due inside the horizon. */
  private _confirmedThisWeek(finished: readonly IDoneTask[], now: Date): IWeekDone[] {
    const first = calendarDayOffset(now, this._timeZone, -(WEEK_DAY_COUNT - 1));
    const last = calendarDayOffset(now, this._timeZone, WEEK_DAY_COUNT - 1);
    return [...finished]
      .filter((task) => {
        const day = localDayOf(task.doneAt, this._timeZone);
        return day !== undefined && day >= first && day <= last;
      })
      .sort((a, b) => Date.parse(b.doneAt) - Date.parse(a.doneAt))
      .map((task) => this._toDone(task, true));
  }

  /** Student-marked first (awaiting the school), then confirmed; the school's word wins a tie. */
  private _mergeDone(
    studentDone: readonly IWeekDone[],
    confirmed: readonly IWeekDone[]
  ): IWeekDone[] {
    const seen = new Set(confirmed.map((d) => d.assignmentExternalId));
    const pending = studentDone.filter((d) => !seen.has(d.assignmentExternalId));
    return [...pending, ...confirmed];
  }

  private _toItem(task: IOpenTask, markedDoneButMissing: boolean): IWeekItem {
    return {
      assignmentExternalId: task.assignmentExternalId,
      title: task.title,
      courseName: task.courseName,
      humanStatus: HUMAN_STATUS[task.kind],
      studentStatus: task.studentStatus ?? 'not_started',
      needs: [...(task.needs ?? [])],
      primaryCtaLabel: task.primaryCtaLabel,
      ...(task.dueAt !== undefined ? { dueAt: task.dueAt } : {}),
      ...(markedDoneButMissing ? { warning: MARKED_DONE_WARNING } : {}),
    };
  }

  private _toDone(
    task: Pick<IOpenTask, 'assignmentExternalId' | 'title' | 'courseName' | 'dueAt'>,
    confirmedBySchool: boolean
  ): IWeekDone {
    return {
      assignmentExternalId: task.assignmentExternalId,
      title: task.title,
      courseName: task.courseName,
      confirmedBySchool,
      ...(task.dueAt !== undefined ? { dueAt: task.dueAt } : {}),
    };
  }
}
