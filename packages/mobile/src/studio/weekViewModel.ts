import type {
  IWeekDone,
  IWeekItem,
  IWeekView,
  StudentStatus,
  WeekDayLabel,
} from '@scholaracle/contracts';
import {
  OWED_SECTION_TITLE,
  STUDENT_STATUS_LABELS,
  STUDENT_STATUS_MARKS,
  WEEK_EMPTY_MESSAGE,
  doneSectionTitle,
  isWeekClear,
  needGlyphs,
  weekSummaryLine,
  type IWeekNeedGlyph,
} from '@scholaracle/studio-core';

export type { IWeekNeedGlyph } from '@scholaracle/studio-core';
export {
  WEEK_NEED_GLYPHS,
  STUDENT_STATUS_LABELS,
  STUDENT_STATUS_MARKS,
  WEEK_EMPTY_MESSAGE,
  needGlyphs,
} from '@scholaracle/studio-core';

/** One open assignment row. Everything the row shows is here; the view adds no copy. */
export interface IWeekRowModel {
  readonly assignmentExternalId: string;
  readonly title: string;
  readonly courseName: string;
  /** School's word: "Not turned in", "Past due", "Due soon", "Coming up". */
  readonly humanStatus: string;
  readonly studentStatus: StudentStatus;
  readonly statusLabel: string;
  readonly statusMark: string;
  readonly needs: readonly IWeekNeedGlyph[];
  /** "Due Nov 3" on owed rows only; day rows sit under their day heading. */
  readonly dueLabel: string | null;
  readonly warning: string | null;
  readonly accessibilityLabel: string;
}

export interface IWeekSectionModel {
  readonly key: string;
  readonly kind: 'owed' | 'day';
  readonly title: string;
  readonly testId: string;
  readonly rows: readonly IWeekRowModel[];
}

export interface IWeekDoneRowModel {
  readonly assignmentExternalId: string;
  readonly title: string;
  readonly courseName: string;
  /** "Turned in" when the school confirmed it, else "Marked done". */
  readonly detail: string;
  readonly accessibilityLabel: string;
}

export interface IWeekDoneSectionModel {
  readonly title: string;
  readonly testId: 'studio-week-done';
  readonly rows: readonly IWeekDoneRowModel[];
}

export interface IWeekViewModel {
  readonly testId: 'studio-week';
  readonly encouragement: string;
  readonly summary: string;
  /** Still owed first, then only the days that have something, today first. */
  readonly sections: readonly IWeekSectionModel[];
  readonly done: IWeekDoneSectionModel | null;
  /** "You're caught up." when nothing is owed or due; null otherwise. */
  readonly emptyMessage: string | null;
}

export function dayHeading(label: WeekDayLabel): string {
  return label;
}

export function formatDueShort(iso: string | undefined): string | null {
  if (iso === undefined || iso === '') return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return `Due ${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
}

export function weekRowModel(
  item: IWeekItem,
  options: { readonly showDue: boolean }
): IWeekRowModel {
  const needs = needGlyphs(item.needs);
  const statusLabel = STUDENT_STATUS_LABELS[item.studentStatus];
  const dueLabel = options.showDue ? formatDueShort(item.dueAt) : null;
  const parts = [
    item.title,
    item.courseName,
    item.humanStatus,
    statusLabel,
    ...(dueLabel !== null ? [dueLabel] : []),
    ...needs.map((need) => need.label),
    ...(item.warning !== undefined ? [item.warning] : []),
  ];
  return {
    assignmentExternalId: item.assignmentExternalId,
    title: item.title,
    courseName: item.courseName,
    humanStatus: item.humanStatus,
    studentStatus: item.studentStatus,
    statusLabel,
    statusMark: STUDENT_STATUS_MARKS[item.studentStatus],
    needs,
    dueLabel,
    warning: item.warning ?? null,
    accessibilityLabel: parts.join(', '),
  };
}

export function weekDoneRowModel(done: IWeekDone): IWeekDoneRowModel {
  const detail = done.confirmedBySchool ? 'Turned in' : 'Marked done';
  return {
    assignmentExternalId: done.assignmentExternalId,
    title: done.title,
    courseName: done.courseName,
    detail,
    accessibilityLabel: `${done.title}, ${done.courseName}, ${detail}`,
  };
}

/** Maps IWeekView to phone chrome. Drops any extra fields; never a score. */
export function weekViewModel(view: IWeekView): IWeekViewModel {
  const sections: IWeekSectionModel[] = [];
  if (view.owed.length > 0) {
    sections.push({
      key: 'owed',
      kind: 'owed',
      title: OWED_SECTION_TITLE,
      testId: 'studio-week-owed',
      rows: view.owed.map((item) => weekRowModel(item, { showDue: true })),
    });
  }
  for (const day of view.days) {
    if (day.items.length === 0) continue;
    sections.push({
      key: `day:${day.date}`,
      kind: 'day',
      title: dayHeading(day.label),
      testId: `studio-week-day-${day.date}`,
      rows: day.items.map((item) => weekRowModel(item, { showDue: false })),
    });
  }
  const done: IWeekDoneSectionModel | null =
    view.doneThisWeek.length > 0
      ? {
          title: doneSectionTitle(view.doneThisWeek.length),
          testId: 'studio-week-done',
          rows: view.doneThisWeek.map(weekDoneRowModel),
        }
      : null;
  return {
    testId: 'studio-week',
    encouragement: view.encouragement,
    summary: weekSummaryLine(view.counts),
    sections,
    done,
    emptyMessage: isWeekClear(view.counts) ? WEEK_EMPTY_MESSAGE : null,
  };
}
