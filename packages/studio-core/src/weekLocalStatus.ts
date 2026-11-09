import type { IWeekDone, IWeekItem, IWeekView, StudentStatus } from '@scholaracle/contracts';
import { MARKED_DONE_WARNING } from './WeekGuide';
import { humanAssignmentStatus } from './humanAssignmentStatus';

/** The school's word for a missing item, as WeekGuide writes it on the wire. */
const MISSING_LABEL = humanAssignmentStatus('missing');

/**
 * Apply a status the student just picked to the This-week view the client
 * already holds, so the screen moves before the server answers and the
 * refetch confirms. Mirrors WeekGuide's rules exactly:
 *
 * - `done` on an item the school calls missing keeps it in Still owed with the
 *   "Marked done, but the school shows not turned in" warning — the school's
 *   word wins until a sync says otherwise.
 * - `done` on anything else (past due, due this week) lifts it into Done this
 *   week, awaiting the school (`confirmedBySchool: false`), first in that list.
 * - any other status updates the row in place and clears the warning, since
 *   the student no longer claims it is done.
 * - an id that is not an open item leaves the view untouched.
 *
 * Counts follow the lists so the summary line stays honest.
 */
export function applyStudentStatusLocally(
  view: IWeekView,
  assignmentExternalId: string,
  status: StudentStatus
): IWeekView {
  const open = [...view.owed, ...view.days.flatMap((day) => day.items)];
  const target = open.find((item) => item.assignmentExternalId === assignmentExternalId);
  if (target === undefined) return view;

  if (status === 'done' && !isMissing(target)) {
    const owed = view.owed.filter((item) => item.assignmentExternalId !== assignmentExternalId);
    const days = view.days.map((day) => ({
      ...day,
      items: day.items.filter((item) => item.assignmentExternalId !== assignmentExternalId),
    }));
    const already = view.doneThisWeek.some((d) => d.assignmentExternalId === assignmentExternalId);
    const doneThisWeek = already ? view.doneThisWeek : [toDone(target), ...view.doneThisWeek];
    return {
      ...view,
      owed,
      days,
      doneThisWeek,
      counts: {
        owed: owed.length,
        due: days.reduce((sum, day) => sum + day.items.length, 0),
        done: doneThisWeek.length,
      },
    };
  }

  const update = (item: IWeekItem): IWeekItem =>
    item.assignmentExternalId === assignmentExternalId ? withStatus(item, status) : item;
  return {
    ...view,
    owed: view.owed.map(update),
    days: view.days.map((day) => ({ ...day, items: day.items.map(update) })),
  };
}

function isMissing(item: IWeekItem): boolean {
  return item.humanStatus === MISSING_LABEL;
}

/** Same row, new student status; the warning exists only for done-but-missing. */
function withStatus(item: IWeekItem, status: StudentStatus): IWeekItem {
  const warned = status === 'done' && isMissing(item);
  return {
    assignmentExternalId: item.assignmentExternalId,
    title: item.title,
    courseName: item.courseName,
    humanStatus: item.humanStatus,
    studentStatus: status,
    needs: item.needs,
    primaryCtaLabel: item.primaryCtaLabel,
    ...(item.dueAt !== undefined ? { dueAt: item.dueAt } : {}),
    ...(warned ? { warning: MARKED_DONE_WARNING } : {}),
  };
}

function toDone(item: IWeekItem): IWeekDone {
  return {
    assignmentExternalId: item.assignmentExternalId,
    title: item.title,
    courseName: item.courseName,
    confirmedBySchool: false,
    ...(item.dueAt !== undefined ? { dueAt: item.dueAt } : {}),
  };
}
