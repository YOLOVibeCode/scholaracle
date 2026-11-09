import {
  assertNoGradeLeak,
  type IStudentSession,
  type INextStep,
  type ITodayView,
} from '@scholaracle/contracts';
import type { IOpenTask, ITodayGuide, ITodaySource, IWin } from '@scholaracle/interfaces';
import { encouragementLine } from './encouragement';

/**
 * Pure Today composer. One encouragement line + exactly one next step.
 * Missing assignments beat due-soon even when due-soon is earlier.
 * `upcoming` tasks (later this week) belong to WeekGuide and are ignored here.
 */
export class TodayGuide implements ITodayGuide {
  private readonly _source: ITodaySource;

  constructor(source: ITodaySource) {
    this._source = source;
  }

  public async load(session: IStudentSession): Promise<ITodayView> {
    const wins = await this._source.recentWins();
    const tasks = await this._source.openTasks();
    const { next, alsoToday } = this._pickNext(tasks);
    const view: ITodayView = {
      encouragement: this._encouragement(wins, next),
      next,
      alsoToday,
    };
    // Copy never includes scores, even if the parent later enables grades.
    assertNoGradeLeak(view, session.showGrades);
    return view;
  }

  private _pickNext(tasks: readonly IOpenTask[]): {
    next: INextStep | null;
    alsoToday: readonly INextStep[];
  } {
    const missing = this._sortByDue(tasks.filter((t) => t.kind === 'missing'));
    const dueSoon = this._sortByDue(tasks.filter((t) => t.kind === 'due_soon'));
    const chosen = missing[0] ?? dueSoon[0];
    if (!chosen) {
      return { next: null, alsoToday: [] };
    }
    const rest = chosen.kind === 'missing' ? [...missing.slice(1), ...dueSoon] : dueSoon.slice(1);
    return {
      next: this._toStep(chosen),
      alsoToday: rest.map((t) => this._toStep(t)),
    };
  }

  private _sortByDue(tasks: readonly IOpenTask[]): IOpenTask[] {
    return [...tasks].sort((a, b) => this._dueMs(a) - this._dueMs(b));
  }

  private _dueMs(task: IOpenTask): number {
    if (task.dueAt == null || task.dueAt === '') return Number.POSITIVE_INFINITY;
    const ms = Date.parse(task.dueAt);
    return Number.isNaN(ms) ? Number.POSITIVE_INFINITY : ms;
  }

  private _toStep(task: IOpenTask): INextStep {
    return {
      assignmentExternalId: task.assignmentExternalId,
      title: task.title,
      courseName: task.courseName,
      primaryCtaLabel: task.primaryCtaLabel,
      ...(task.dueAt !== undefined ? { dueAt: task.dueAt } : {}),
      ...(task.courseExternalId !== undefined ? { courseExternalId: task.courseExternalId } : {}),
    };
  }

  private _encouragement(wins: readonly IWin[], next: INextStep | null): string {
    return encouragementLine(wins, next !== null);
  }
}
