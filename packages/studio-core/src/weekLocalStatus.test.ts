/**
 * R2 — optimistic status on a held This-week view: done moves the item to
 * Done this week; other statuses update in place; counts follow.
 */

import type { IWeekItem, IWeekView } from '@scholaracle/contracts';
import { MARKED_DONE_WARNING } from './WeekGuide';
import { applyStudentStatusLocally } from './weekLocalStatus';

function item(id: string, overrides: Partial<IWeekItem> = {}): IWeekItem {
  return {
    assignmentExternalId: id,
    title: `Title ${id}`,
    courseName: 'Math',
    humanStatus: 'Not turned in',
    studentStatus: 'not_started',
    needs: [],
    primaryCtaLabel: 'Open worksheet',
    ...overrides,
  };
}

const VIEW: IWeekView = {
  encouragement: "Let's take the next step.",
  owed: [item('owed-1', { dueAt: '2026-11-02T16:00:00.000Z', warning: MARKED_DONE_WARNING })],
  days: [
    { date: '2026-11-09', label: 'Today', items: [item('today-1')] },
    { date: '2026-11-10', label: 'Tomorrow', items: [item('tmrw-1'), item('tmrw-2')] },
  ],
  doneThisWeek: [
    {
      assignmentExternalId: 'done-1',
      title: 'Title done-1',
      courseName: 'Math',
      confirmedBySchool: true,
    },
  ],
  counts: { owed: 1, due: 3, done: 1 },
};

describe('applyStudentStatusLocally', () => {
  it('done lifts a day item into Done this week first, awaiting the school, and recounts', () => {
    const next = applyStudentStatusLocally(VIEW, 'tmrw-1', 'done');
    expect(next.days[1]?.items.map((i) => i.assignmentExternalId)).toEqual(['tmrw-2']);
    expect(next.doneThisWeek[0]).toEqual({
      assignmentExternalId: 'tmrw-1',
      title: 'Title tmrw-1',
      courseName: 'Math',
      confirmedBySchool: false,
    });
    expect(next.doneThisWeek[1]?.assignmentExternalId).toBe('done-1');
    expect(next.counts).toEqual({ owed: 1, due: 2, done: 2 });
    expect(next.encouragement).toBe(VIEW.encouragement);
  });

  it('done on an owed item removes it from owed and keeps its due date', () => {
    const next = applyStudentStatusLocally(VIEW, 'owed-1', 'done');
    expect(next.owed).toEqual([]);
    expect(next.doneThisWeek[0]).toMatchObject({
      assignmentExternalId: 'owed-1',
      dueAt: '2026-11-02T16:00:00.000Z',
      confirmedBySchool: false,
    });
    expect(next.counts).toEqual({ owed: 0, due: 3, done: 2 });
  });

  it('other statuses update the row in place and clear the marked-done warning', () => {
    const next = applyStudentStatusLocally(VIEW, 'owed-1', 'working_on_it');
    expect(next.owed[0]?.studentStatus).toBe('working_on_it');
    expect(next.owed[0]?.warning).toBeUndefined();
    expect(next.days).toEqual(VIEW.days);
    expect(next.counts).toEqual(VIEW.counts);

    const help = applyStudentStatusLocally(VIEW, 'today-1', 'need_help');
    expect(help.days[0]?.items[0]?.studentStatus).toBe('need_help');
    expect(help.owed).toEqual(VIEW.owed);
  });

  it('leaves the view alone for an unknown id and never duplicates a done row', () => {
    expect(applyStudentStatusLocally(VIEW, 'nope', 'done')).toBe(VIEW);
    const once = applyStudentStatusLocally(VIEW, 'today-1', 'done');
    const twice = applyStudentStatusLocally(once, 'today-1', 'done');
    expect(twice).toBe(once);
  });

  it('does not mutate the input', () => {
    const snapshot = JSON.stringify(VIEW);
    applyStudentStatusLocally(VIEW, 'tmrw-1', 'done');
    applyStudentStatusLocally(VIEW, 'owed-1', 'need_help');
    expect(JSON.stringify(VIEW)).toBe(snapshot);
  });
});
