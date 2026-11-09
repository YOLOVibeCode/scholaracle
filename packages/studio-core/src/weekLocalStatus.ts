import type { IWeekDone, IWeekItem, IWeekView, StudentStatus } from '@scholaracle/contracts';

/**
 * Apply a status the student just picked to the This-week view the client
 * already holds, so the screen moves before the server answers and the
 * refetch confirms. Mirrors WeekGuide's rules:
 *
 * - `done` lifts the item out of owed / days into Done this week (awaiting the
 *   school, so `confirmedBySchool: false`) and goes first in that list.
 * - any other status updates the row in place and clears the "marked done but
 *   not turned in" warning, since the student no longer claims it is done.
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

  if (status === 'done') {
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

  const update = (item: IWeekItem): IWeekItem => {
    if (item.assignmentExternalId !== assignmentExternalId) return item;
    return {
      assignmentExternalId: item.assignmentExternalId,
      title: item.title,
      courseName: item.courseName,
      humanStatus: item.humanStatus,
      studentStatus: status,
      needs: item.needs,
      primaryCtaLabel: item.primaryCtaLabel,
      ...(item.dueAt !== undefined ? { dueAt: item.dueAt } : {}),
    };
  };
  return {
    ...view,
    owed: view.owed.map(update),
    days: view.days.map((day) => ({ ...day, items: day.items.map(update) })),
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
