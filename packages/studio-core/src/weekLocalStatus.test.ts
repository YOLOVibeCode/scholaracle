/**
 * R2 — optimistic status on a held This-week view, mirroring WeekGuide:
 * done moves past-due / upcoming items to Done this week, keeps missing items
 * owed with the warning; other statuses update in place; counts follow.
 */

import type { IWeekItem, IWeekView } from '@scholaracle/contracts';
import { MARKED_DONE_WARNING, PAST_DUE_LABEL } from './WeekGuide';
import { humanAssignmentStatus } from './humanAssignmentStatus';
import { applyStudentStatusLocally } from './weekLocalStatus';

const MISSING = humanAssignmentStatus('missing');

function item(id: string, overrides: Partial<IWeekItem> = {}): IWeekItem {
  return {
    assignmentExternalId: id,
    title: `Title ${id}`,
    courseName: 'Math',
    humanStatus: 'Coming up',
    studentStatus: 'not_started',
    needs: [],
    primaryCtaLabel: 'Open worksheet',
    ...overrides,
  };
}

const VIEW: IWeekView = {
  encouragement: "Let's take the next step.",
  owed: [
    item('missing-1', { humanStatus: MISSING, dueAt: '2026-11-02T16:00:00.000Z' }),
    item('late-1', { humanStatus: PAST_DUE_LABEL, dueAt: '2026-11-06T16:00:00.000Z' }),
  ],
  days: [
    { date: '2026-11-09', label: 'Today', items: [item('today-1', { humanStatus: 'Due soon' })] },
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
  counts: { owed: 2, due: 3, done: 1 },
};

describe('applyStudentStatusLocally', () => {
  describe('done', () => {
    const moves: ReadonlyArray<{
      readonly id: string;
      readonly from: 'owed' | 'days';
      readonly label: string;
    }> = [
      { id: 'late-1', from: 'owed', label: 'past due (owed, not flagged missing)' },
      { id: 'today-1', from: 'days', label: 'due soon (today)' },
      { id: 'tmrw-1', from: 'days', label: 'coming up (tomorrow)' },
    ];

    it.each(moves)('$label moves to Done this week, awaiting the school', ({ id, from }) => {
      const next = applyStudentStatusLocally(VIEW, id, 'done');
      const stillOpen = [...next.owed, ...next.days.flatMap((d) => d.items)].map(
        (i) => i.assignmentExternalId
      );
      expect(stillOpen).not.toContain(id);
      expect(next.doneThisWeek[0]).toMatchObject({
        assignmentExternalId: id,
        confirmedBySchool: false,
      });
      expect(next.doneThisWeek[1]?.assignmentExternalId).toBe('done-1');
      expect(next.counts).toEqual({
        owed: from === 'owed' ? 1 : 2,
        due: from === 'days' ? 2 : 3,
        done: 2,
      });
      expect(next.encouragement).toBe(VIEW.encouragement);
    });

    it('keeps a missing item in Still owed with the warning, like WeekGuide', () => {
      const next = applyStudentStatusLocally(VIEW, 'missing-1', 'done');
      expect(next.owed.map((i) => i.assignmentExternalId)).toEqual(['missing-1', 'late-1']);
      expect(next.owed[0]).toMatchObject({
        studentStatus: 'done',
        humanStatus: MISSING,
        warning: MARKED_DONE_WARNING,
        dueAt: '2026-11-02T16:00:00.000Z',
      });
      expect(next.doneThisWeek).toEqual(VIEW.doneThisWeek);
      expect(next.counts).toEqual(VIEW.counts);
    });

    it('keeps the due date on the moved row and never duplicates a done row', () => {
      const once = applyStudentStatusLocally(VIEW, 'late-1', 'done');
      expect(once.doneThisWeek[0]?.dueAt).toBe('2026-11-06T16:00:00.000Z');
      const twice = applyStudentStatusLocally(once, 'late-1', 'done');
      expect(twice).toBe(once);
    });
  });

  describe('other statuses', () => {
    const statuses = ['not_started', 'working_on_it', 'need_help'] as const;

    it.each(statuses)('%s updates the row in place and clears the warning', (status) => {
      const warned = applyStudentStatusLocally(VIEW, 'missing-1', 'done');
      const next = applyStudentStatusLocally(warned, 'missing-1', status);
      expect(next.owed[0]).toMatchObject({ studentStatus: status, humanStatus: MISSING });
      expect(next.owed[0]?.warning).toBeUndefined();
      expect(next.days).toEqual(VIEW.days);
      expect(next.counts).toEqual(VIEW.counts);
    });

    it('touches only the named row', () => {
      const next = applyStudentStatusLocally(VIEW, 'tmrw-2', 'need_help');
      expect(next.days[1]?.items.map((i) => i.studentStatus)).toEqual(['not_started', 'need_help']);
      expect(next.owed).toEqual(VIEW.owed);
    });
  });

  it('leaves the view alone for an unknown id and does not mutate the input', () => {
    expect(applyStudentStatusLocally(VIEW, 'nope', 'done')).toBe(VIEW);
    const snapshot = JSON.stringify(VIEW);
    applyStudentStatusLocally(VIEW, 'tmrw-1', 'done');
    applyStudentStatusLocally(VIEW, 'missing-1', 'done');
    applyStudentStatusLocally(VIEW, 'late-1', 'need_help');
    expect(JSON.stringify(VIEW)).toBe(snapshot);
  });
});
