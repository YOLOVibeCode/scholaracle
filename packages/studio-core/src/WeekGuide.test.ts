/**
 * R1 — WeekGuide table-driven tests.
 *
 * Fake IWeekSource only. No Express, no grades router. Calendar-day bucketing
 * is done in the student's zone with date arithmetic, so DST never skips a day.
 * The source never cuts the horizon; WeekGuide is the only ruler.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { assertNoGradeLeak, type IStudentSession } from '@scholaracle/contracts';
import type { IDoneTask, IOpenTask, IWeekSource, IWin } from '@scholaracle/interfaces';
import { MARKED_DONE_WARNING, PAST_DUE_LABEL, WeekGuide } from './WeekGuide';

const SESSION_OFF: IStudentSession = {
  studentId: 'stu-emma',
  displayName: 'Emma Mitchell',
  showGrades: false,
};

/** Thursday 29 Jan 2026, 15:00 UTC — the horizon crosses into February. */
const NOW = new Date('2026-01-29T15:00:00.000Z');

const GRADED: IWin = {
  kind: 'graded',
  assignmentExternalId: 'demo-emma-eng10-reading-8',
  title: 'Reading response 8',
  courseName: 'English 10 Honors',
};

function task(over: Partial<IOpenTask> & Pick<IOpenTask, 'assignmentExternalId'>): IOpenTask {
  return {
    kind: 'upcoming',
    title: `Task ${over.assignmentExternalId}`,
    courseName: 'AP Biology',
    primaryCtaLabel: 'Open assignment',
    ...over,
  };
}

function done(
  over: Partial<IDoneTask> & Pick<IDoneTask, 'assignmentExternalId' | 'doneAt'>
): IDoneTask {
  return {
    title: `Done ${over.assignmentExternalId}`,
    courseName: 'AP Biology',
    ...over,
  };
}

function fakeSource(
  wins: readonly IWin[],
  tasks: readonly IOpenTask[],
  finished: readonly IDoneTask[] = []
): IWeekSource {
  return {
    recentWins: async () => wins,
    openTasks: async () => tasks,
    doneThisWeek: async () => finished,
  };
}

function load(
  tasks: readonly IOpenTask[],
  finished: readonly IDoneTask[] = [],
  options: { readonly now?: Date; readonly timeZone?: string; readonly wins?: readonly IWin[] } = {}
) {
  return new WeekGuide(fakeSource(options.wins ?? [], tasks, finished), {
    ...(options.timeZone !== undefined ? { timeZone: options.timeZone } : {}),
  }).load(SESSION_OFF, options.now ?? NOW);
}

describe('WeekGuide — owed', () => {
  it('lists missing work oldest first; no due date sorts last', async () => {
    const view = await load([
      task({ assignmentExternalId: 'jan20', kind: 'missing', dueAt: '2026-01-20T16:00:00.000Z' }),
      task({ assignmentExternalId: 'nodue', kind: 'missing' }),
      task({ assignmentExternalId: 'jan10', kind: 'missing', dueAt: '2026-01-10T16:00:00.000Z' }),
      task({ assignmentExternalId: 'jan25', kind: 'missing', dueAt: '2026-01-25T16:00:00.000Z' }),
    ]);
    expect(view.owed.map((i) => i.assignmentExternalId)).toEqual([
      'jan10',
      'jan20',
      'jan25',
      'nodue',
    ]);
    expect(view.counts.owed).toBe(4);
    expect(view.owed[0]?.warning).toBeUndefined();
    expect(view.owed.every((i) => i.humanStatus === 'Not turned in')).toBe(true);
  });

  it('missing work due in the future (portal says missing) is still owed, never a day item', async () => {
    const view = await load([
      task({
        assignmentExternalId: 'future-missing',
        kind: 'missing',
        dueAt: '2026-02-02T16:00:00.000Z',
      }),
    ]);
    expect(view.owed.map((i) => i.assignmentExternalId)).toEqual(['future-missing']);
    expect(view.days.every((d) => d.items.length === 0)).toBe(true);
  });

  it('overdue work (past due, school has not said missing) is owed after missing, oldest first, as "Past due"', async () => {
    const view = await load([
      task({
        assignmentExternalId: 'od-jan27',
        kind: 'overdue',
        dueAt: '2026-01-27T16:00:00.000Z',
      }),
      task({
        assignmentExternalId: 'ms-jan28',
        kind: 'missing',
        dueAt: '2026-01-28T16:00:00.000Z',
      }),
      task({
        assignmentExternalId: 'od-jan05',
        kind: 'overdue',
        dueAt: '2026-01-05T16:00:00.000Z',
      }),
      task({
        assignmentExternalId: 'ms-jan10',
        kind: 'missing',
        dueAt: '2026-01-10T16:00:00.000Z',
      }),
    ]);
    expect(view.owed.map((i) => [i.assignmentExternalId, i.humanStatus])).toEqual([
      ['ms-jan10', 'Not turned in'],
      ['ms-jan28', 'Not turned in'],
      ['od-jan05', PAST_DUE_LABEL],
      ['od-jan27', PAST_DUE_LABEL],
    ]);
    expect(PAST_DUE_LABEL).toBe('Past due');
    expect(view.counts).toEqual({ owed: 4, due: 0, done: 0 });
    expect(view.days.every((d) => d.items.length === 0)).toBe(true);
  });

  it('an overdue item the student marked done is pending in doneThisWeek, not owed (no portal verdict yet)', async () => {
    const view = await load([
      task({
        assignmentExternalId: 'od-done',
        kind: 'overdue',
        dueAt: '2026-01-27T16:00:00.000Z',
        studentStatus: 'done',
      }),
    ]);
    expect(view.owed).toEqual([]);
    expect(view.doneThisWeek.map((d) => [d.assignmentExternalId, d.confirmedBySchool])).toEqual([
      ['od-done', false],
    ]);
  });
});

describe('WeekGuide — rolling 7 days', () => {
  it('buckets by local day across a month boundary; beyond day 7 is dropped from every section and count', async () => {
    const view = await load([
      task({ assignmentExternalId: 'today', kind: 'due_soon', dueAt: '2026-01-29T20:00:00.000Z' }),
      task({
        assignmentExternalId: 'tomorrow',
        kind: 'due_soon',
        dueAt: '2026-01-30T16:00:00.000Z',
      }),
      task({ assignmentExternalId: 'sun', kind: 'upcoming', dueAt: '2026-02-01T16:00:00.000Z' }),
      task({
        assignmentExternalId: 'wed-late',
        kind: 'upcoming',
        dueAt: '2026-02-04T16:00:00.000Z',
      }),
      task({
        assignmentExternalId: 'wed-early',
        kind: 'upcoming',
        dueAt: '2026-02-04T09:00:00.000Z',
      }),
      task({
        assignmentExternalId: 'next-thu',
        kind: 'upcoming',
        dueAt: '2026-02-05T16:00:00.000Z',
      }),
      task({
        assignmentExternalId: 'next-month',
        kind: 'upcoming',
        dueAt: '2026-03-01T16:00:00.000Z',
      }),
    ]);
    expect(view.days.map((d) => d.date)).toEqual([
      '2026-01-29',
      '2026-01-30',
      '2026-01-31',
      '2026-02-01',
      '2026-02-02',
      '2026-02-03',
      '2026-02-04',
    ]);
    expect(view.days.map((d) => d.label)).toEqual([
      'Today',
      'Tomorrow',
      'Sat',
      'Sun',
      'Mon',
      'Tue',
      'Wed',
    ]);
    expect(view.days.map((d) => d.items.map((i) => i.assignmentExternalId))).toEqual([
      ['today'],
      ['tomorrow'],
      [],
      ['sun'],
      [],
      [],
      ['wed-early', 'wed-late'],
    ]);
    expect(view.counts).toEqual({ owed: 0, due: 5, done: 0 });
    expect(JSON.stringify(view)).not.toContain('next-thu');
    expect(JSON.stringify(view)).not.toContain('next-month');
    expect(view.days[0]?.items[0]?.humanStatus).toBe('Due soon');
    expect(view.days[3]?.items[0]?.humanStatus).toBe('Coming up');
  });

  it('one ruler: inside 7×24h but on the 8th local day is dropped (Chicago, Mon 23:00 → next Mon 22:00)', async () => {
    // Mon 2 Feb 2026 23:00 CST = 03 Feb 05:00Z; next Mon 22:00 CST = 10 Feb 04:00Z (6 d 23 h later).
    const view = await load(
      [task({ assignmentExternalId: 'eighth-day', dueAt: '2026-02-10T04:00:00.000Z' })],
      [],
      { now: new Date('2026-02-03T05:00:00.000Z'), timeZone: 'America/Chicago' }
    );
    expect(view.days.map((d) => d.date)).toEqual([
      '2026-02-02',
      '2026-02-03',
      '2026-02-04',
      '2026-02-05',
      '2026-02-06',
      '2026-02-07',
      '2026-02-08',
    ]);
    expect(JSON.stringify(view)).not.toContain('eighth-day');
    expect(view.counts).toEqual({ owed: 0, due: 0, done: 0 });
  });

  it('one ruler: DST fall-back keeps the 7th local day even when it is more than 7×24h away', async () => {
    // Sat 31 Oct 2026 23:30 CDT = 01 Nov 04:30Z. DST ends 1 Nov. Fri 6 Nov 23:00 CST = 07 Nov 05:00Z,
    // which is 7 d 0 h 30 m after now — a 7×24h cut would have dropped it.
    const view = await load(
      [task({ assignmentExternalId: 'seventh-day', dueAt: '2026-11-07T05:00:00.000Z' })],
      [],
      { now: new Date('2026-11-01T04:30:00.000Z'), timeZone: 'America/Chicago' }
    );
    expect(view.days.map((d) => d.date)).toEqual([
      '2026-10-31',
      '2026-11-01',
      '2026-11-02',
      '2026-11-03',
      '2026-11-04',
      '2026-11-05',
      '2026-11-06',
    ]);
    expect(view.days[6]?.label).toBe('Fri');
    expect(view.days[6]?.items.map((i) => i.assignmentExternalId)).toEqual(['seventh-day']);
    expect(view.counts.due).toBe(1);
  });

  it.each([
    [
      'spring forward (America/Chicago, 23:30 CST the night before DST starts)',
      '2026-03-08T05:30:00.000Z',
      [
        '2026-03-07',
        '2026-03-08',
        '2026-03-09',
        '2026-03-10',
        '2026-03-11',
        '2026-03-12',
        '2026-03-13',
      ],
      ['Today', 'Tomorrow', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
    ],
    [
      'fall back (America/Chicago, 01:30 CDT on the day DST ends)',
      '2026-11-01T06:30:00.000Z',
      [
        '2026-11-01',
        '2026-11-02',
        '2026-11-03',
        '2026-11-04',
        '2026-11-05',
        '2026-11-06',
        '2026-11-07',
      ],
      ['Today', 'Tomorrow', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
    ],
  ])('%s: seven consecutive local days', async (_name, nowIso, dates, labels) => {
    const view = await load([], [], { now: new Date(nowIso), timeZone: 'America/Chicago' });
    expect(view.days.map((d) => d.date)).toEqual(dates);
    expect(view.days.map((d) => d.label)).toEqual(labels);
  });

  it('places a task by its local due day, not its UTC day', async () => {
    // 2026-03-09T04:30Z is 23:30 CDT on Sunday 8 March in Chicago.
    const view = await load(
      [task({ assignmentExternalId: 'late-sunday', dueAt: '2026-03-09T04:30:00.000Z' })],
      [],
      { now: new Date('2026-03-08T05:30:00.000Z'), timeZone: 'America/Chicago' }
    );
    expect(view.days[1]?.date).toBe('2026-03-08');
    expect(view.days[1]?.items.map((i) => i.assignmentExternalId)).toEqual(['late-sunday']);
  });

  it('falls back to UTC when the time zone is not a real zone', async () => {
    const view = await load([], [], { timeZone: 'Mars/Olympus_Mons' });
    expect(view.days[0]?.date).toBe('2026-01-29');
  });

  it('an empty week still has seven days and zero counts', async () => {
    const view = await load([]);
    expect(view.days).toHaveLength(7);
    expect(view.owed).toEqual([]);
    expect(view.doneThisWeek).toEqual([]);
    expect(view.counts).toEqual({ owed: 0, due: 0, done: 0 });
  });
});

describe('WeekGuide — done', () => {
  it('a student-marked done item leaves days and joins doneThisWeek, unconfirmed', async () => {
    const view = await load([
      task({
        assignmentExternalId: 'essay',
        kind: 'due_soon',
        dueAt: '2026-01-30T16:00:00.000Z',
        studentStatus: 'done',
      }),
      task({ assignmentExternalId: 'quiz', kind: 'due_soon', dueAt: '2026-01-30T17:00:00.000Z' }),
    ]);
    expect(view.days[1]?.items.map((i) => i.assignmentExternalId)).toEqual(['quiz']);
    expect(view.doneThisWeek).toEqual([
      {
        assignmentExternalId: 'essay',
        title: 'Task essay',
        courseName: 'AP Biology',
        dueAt: '2026-01-30T16:00:00.000Z',
        confirmedBySchool: false,
      },
    ]);
    expect(view.counts).toEqual({ owed: 0, due: 1, done: 1 });
  });

  it('portal says missing after the student marked done → back in owed with the warning', async () => {
    const view = await load([
      task({
        assignmentExternalId: 'ws',
        kind: 'missing',
        dueAt: '2026-01-27T16:00:00.000Z',
        studentStatus: 'done',
      }),
    ]);
    expect(view.owed).toHaveLength(1);
    expect(view.owed[0]?.studentStatus).toBe('done');
    expect(view.owed[0]?.humanStatus).toBe('Not turned in');
    expect(view.owed[0]?.warning).toBe(MARKED_DONE_WARNING);
    expect(view.owed[0]?.warning).toBe('Marked done, but the school shows not turned in');
    expect(view.doneThisWeek).toEqual([]);
  });

  it('portal-confirmed work counts when finished in the last 7 local days or due inside the horizon', async () => {
    const view = await load(
      [],
      [
        done({ assignmentExternalId: 'yesterday', doneAt: '2026-01-28T20:00:00.000Z' }),
        done({ assignmentExternalId: 'six-days-ago', doneAt: '2026-01-23T08:00:00.000Z' }),
        done({ assignmentExternalId: 'seven-days-ago', doneAt: '2026-01-22T23:00:00.000Z' }),
        done({
          assignmentExternalId: 'submitted-early',
          doneAt: '2026-02-04T16:00:00.000Z',
          dueAt: '2026-02-04T16:00:00.000Z',
        }),
        done({ assignmentExternalId: 'beyond-horizon', doneAt: '2026-02-05T16:00:00.000Z' }),
        done({ assignmentExternalId: 'bad-date', doneAt: 'not-a-date' }),
      ]
    );
    expect(view.doneThisWeek.map((d) => d.assignmentExternalId)).toEqual([
      'submitted-early',
      'yesterday',
      'six-days-ago',
    ]);
    expect(view.doneThisWeek.every((d) => d.confirmedBySchool)).toBe(true);
    expect(view.doneThisWeek[0]?.dueAt).toBe('2026-02-04T16:00:00.000Z');
    expect(view.counts.done).toBe(3);
  });

  it('student-marked items come first; the school’s confirmation wins a duplicate id', async () => {
    const view = await load(
      [
        task({
          assignmentExternalId: 'pending',
          kind: 'upcoming',
          dueAt: '2026-02-02T16:00:00.000Z',
          studentStatus: 'done',
        }),
        task({
          assignmentExternalId: 'both',
          kind: 'upcoming',
          dueAt: '2026-02-03T16:00:00.000Z',
          studentStatus: 'done',
        }),
      ],
      [done({ assignmentExternalId: 'both', doneAt: '2026-01-29T10:00:00.000Z' })]
    );
    expect(view.doneThisWeek.map((d) => [d.assignmentExternalId, d.confirmedBySchool])).toEqual([
      ['pending', false],
      ['both', true],
    ]);
  });
});

describe('WeekGuide — item fields', () => {
  it('carries humanStatus, studentStatus and needs; absent means not started and nothing needed', async () => {
    const view = await load([
      task({
        assignmentExternalId: 'help',
        kind: 'due_soon',
        dueAt: '2026-01-29T20:00:00.000Z',
        studentStatus: 'need_help',
        needs: ['saved_file', 'school_login'],
        primaryCtaLabel: 'Open worksheet',
      }),
      task({ assignmentExternalId: 'plain', kind: 'missing' }),
    ]);
    expect(view.days[0]?.items[0]).toEqual({
      assignmentExternalId: 'help',
      title: 'Task help',
      courseName: 'AP Biology',
      dueAt: '2026-01-29T20:00:00.000Z',
      humanStatus: 'Due soon',
      studentStatus: 'need_help',
      needs: ['saved_file', 'school_login'],
      primaryCtaLabel: 'Open worksheet',
    });
    expect(view.owed[0]?.studentStatus).toBe('not_started');
    expect(view.owed[0]?.needs).toEqual([]);
    expect(view.owed[0]).not.toHaveProperty('dueAt');
  });

  it('reads the three source ports once each, in parallel', async () => {
    const order: string[] = [];
    const slow = <T>(name: string, value: T): (() => Promise<T>) => {
      return () =>
        new Promise<T>((resolve) => {
          order.push(`${name}:start`);
          setTimeout(() => {
            order.push(`${name}:end`);
            resolve(value);
          }, 5);
        });
    };
    const source: IWeekSource = {
      recentWins: slow('wins', [] as readonly IWin[]),
      openTasks: slow('tasks', [] as readonly IOpenTask[]),
      doneThisWeek: slow('done', [] as readonly IDoneTask[]),
    };
    await new WeekGuide(source).load(SESSION_OFF, NOW);
    expect(order.slice(0, 3)).toEqual(['wins:start', 'tasks:start', 'done:start']);
    expect(order).toHaveLength(6);
  });
});

describe('WeekGuide — encouragement (same rules as Today)', () => {
  it('names a graded win', async () => {
    const view = await load([task({ assignmentExternalId: 'x', kind: 'missing' })], [], {
      wins: [GRADED],
    });
    expect(view.encouragement).toBe('Nice work on Reading response 8.');
  });

  it('nothing open and no wins → caught up', async () => {
    const view = await load([]);
    expect(view.encouragement).toMatch(/caught up/i);
  });

  it('open work and no wins → next step', async () => {
    const view = await load([
      task({ assignmentExternalId: 'x', kind: 'due_soon', dueAt: '2026-01-29T20:00:00.000Z' }),
    ]);
    expect(view.encouragement).toBe("Let's take the next step.");
  });
});

describe('WeekGuide — no grade leak', () => {
  it('passes assertNoGradeLeak with grades off', async () => {
    const view = await load([task({ assignmentExternalId: 'x', kind: 'missing' })], [], {
      wins: [GRADED],
    });
    expect(() => assertNoGradeLeak(view, false)).not.toThrow();
    expect(JSON.stringify(view)).not.toMatch(/\d+\s*%/);
    expect(JSON.stringify(view)).not.toMatch(/points?/i);
  });

  it('refuses to return a view whose copy carries a score', async () => {
    await expect(
      load([task({ assignmentExternalId: 'x', kind: 'missing', title: 'Quiz 3 (91%)' })])
    ).rejects.toThrow(/grade|percent/i);
  });

  it('does not call a grades API hanging off the source object', async () => {
    const getGrades = jest.fn(() => {
      throw new Error('grades API must not be called');
    });
    const source: IWeekSource & { getGrades: () => never } = {
      ...fakeSource([GRADED], [task({ assignmentExternalId: 'x', kind: 'missing' })]),
      getGrades: getGrades as () => never,
    };
    await new WeekGuide(source).load(SESSION_OFF, NOW);
    expect(getGrades).not.toHaveBeenCalled();
  });
});

describe('ISP — studio-core stays host-agnostic', () => {
  it('WeekGuide.ts does not import Express, React, Next, or the gradebook', () => {
    const src = readFileSync(join(__dirname, 'WeekGuide.ts'), 'utf8');
    expect(src).not.toMatch(/from ['"]express['"]/);
    expect(src).not.toMatch(/from ['"]react['"]/);
    expect(src).not.toMatch(/from ['"]next/);
    expect(src).not.toMatch(/IStudentGradesResponse/);
    expect(src).not.toMatch(/mongodb/);
  });
});
