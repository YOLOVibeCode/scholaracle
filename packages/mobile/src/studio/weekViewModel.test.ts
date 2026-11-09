import type { IWeekItem, IWeekView } from '@scholaracle/contracts';
import {
  WEEK_NEED_GLYPHS,
  formatDueShort,
  needGlyphs,
  weekDoneRowModel,
  weekRowModel,
  weekViewModel,
} from './weekViewModel';

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
  encouragement: 'You finished 4 things. Nice.',
  owed: [
    item('ch4', {
      title: 'Ch. 4 worksheet',
      humanStatus: 'Not turned in',
      studentStatus: 'need_help',
      dueAt: '2026-11-03T16:00:00.000Z',
      needs: ['saved_file'],
    }),
    item('late', { humanStatus: 'Past due', dueAt: '2026-11-06T16:00:00.000Z' }),
  ],
  days: [
    {
      date: '2026-11-09',
      label: 'Today',
      items: [
        item('essay', {
          title: 'Essay draft',
          courseName: 'English',
          humanStatus: 'Due soon',
          needs: ['school_login'],
        }),
      ],
    },
    { date: '2026-11-10', label: 'Tomorrow', items: [] },
    {
      date: '2026-11-11',
      label: 'Wed',
      items: [
        item('ch5', {
          title: 'Ch. 5 problems',
          studentStatus: 'working_on_it',
          needs: ['saved_file', 'internet'],
        }),
      ],
    },
    { date: '2026-11-12', label: 'Thu', items: [item('lab', { needs: ['internet'] })] },
    { date: '2026-11-13', label: 'Fri', items: [] },
    { date: '2026-11-14', label: 'Sat', items: [] },
    { date: '2026-11-15', label: 'Sun', items: [] },
  ],
  doneThisWeek: [
    { assignmentExternalId: 'd1', title: 'Quiz 3', courseName: 'Math', confirmedBySchool: true },
    {
      assignmentExternalId: 'd2',
      title: 'Reading log',
      courseName: 'English',
      confirmedBySchool: false,
    },
  ],
  counts: { owed: 2, due: 3, done: 2 },
};

describe('weekViewModel', () => {
  it('orders sections Still owed, then only the days with work (today first), then Done', () => {
    const model = weekViewModel(VIEW);
    expect(model.testId).toBe('studio-week');
    expect(model.encouragement).toBe('You finished 4 things. Nice.');
    expect(model.summary).toBe('3 due · 2 still owed · you finished 2');
    expect(model.sections.map((s) => s.title)).toEqual(['Still owed', 'Today', 'Wed', 'Thu']);
    expect(model.sections.map((s) => s.kind)).toEqual(['owed', 'day', 'day', 'day']);
    expect(model.sections[0]?.testId).toBe('studio-week-owed');
    expect(model.sections[1]?.testId).toBe('studio-week-day-2026-11-09');
    expect(model.done?.title).toBe('Done this week (2)');
    expect(model.done?.rows.map((r) => r.detail)).toEqual(['Turned in', 'Marked done']);
    expect(model.emptyMessage).toBeNull();
  });

  it('owed rows carry the due date; day rows do not repeat their heading', () => {
    const model = weekViewModel(VIEW);
    expect(model.sections[0]?.rows[0]?.dueLabel).toMatch(/^Due /);
    expect(model.sections[1]?.rows[0]?.dueLabel).toBeNull();
    expect(formatDueShort(undefined)).toBeNull();
    expect(formatDueShort('not a date')).toBeNull();
    expect(formatDueShort('2026-11-03T16:00:00.000Z')).toMatch(/^Due \w+ \d+$/);
  });

  it('maps needs to glyphs: 📄 saved, 🔒 school login, 🌐 needs internet', () => {
    expect(WEEK_NEED_GLYPHS.saved_file.glyph).toBe('📄');
    expect(WEEK_NEED_GLYPHS.school_login.glyph).toBe('🔒');
    expect(WEEK_NEED_GLYPHS.internet.glyph).toBe('🌐');
    expect(needGlyphs(['saved_file', 'internet']).map((g) => `${g.glyph} ${g.label}`)).toEqual([
      '📄 saved',
      '🌐 needs internet',
    ]);
    const model = weekViewModel(VIEW);
    const ch5 = model.sections[2]?.rows[0];
    expect(ch5?.needs.map((n) => n.glyph)).toEqual(['📄', '🌐']);
    expect(model.sections[1]?.rows[0]?.needs.map((n) => n.label)).toEqual(['school login']);
  });

  it('rows carry the student status label and mark, and a spoken label with everything', () => {
    const row = weekRowModel(VIEW.owed[0] as IWeekItem, { showDue: true });
    expect(row.statusLabel).toBe('Need help');
    expect(row.statusMark).toBe('⚠');
    expect(row.humanStatus).toBe('Not turned in');
    expect(row.accessibilityLabel).toMatch(
      /^Ch\. 4 worksheet, Math, Not turned in, Need help, Due .+, saved$/
    );
    const working = weekRowModel(item('x', { studentStatus: 'working_on_it' }), {
      showDue: false,
    });
    expect(working.statusMark).toBe('◐');
    expect(working.warning).toBeNull();
  });

  it('keeps the marked-done warning on the row and in its spoken label', () => {
    const warned = weekRowModel(
      item('w', { warning: 'Marked done, but the school shows not turned in' }),
      { showDue: false }
    );
    expect(warned.warning).toBe('Marked done, but the school shows not turned in');
    expect(warned.accessibilityLabel).toContain('Marked done, but the school shows not turned in');
  });

  it('done rows say Turned in when the school confirmed, else Marked done', () => {
    expect(
      weekDoneRowModel({
        assignmentExternalId: 'a',
        title: 'Quiz',
        courseName: 'Math',
        confirmedBySchool: true,
      })
    ).toEqual({
      assignmentExternalId: 'a',
      title: 'Quiz',
      courseName: 'Math',
      detail: 'Turned in',
      accessibilityLabel: 'Quiz, Math, Turned in',
    });
    expect(
      weekDoneRowModel({
        assignmentExternalId: 'b',
        title: 'Log',
        courseName: 'English',
        confirmedBySchool: false,
      }).detail
    ).toBe('Marked done');
  });

  it("shows You're caught up. when nothing is owed or due, even with done work", () => {
    const clear = weekViewModel({
      encouragement: "You're caught up.",
      owed: [],
      days: VIEW.days.map((d) => ({ ...d, items: [] })),
      doneThisWeek: VIEW.doneThisWeek,
      counts: { owed: 0, due: 0, done: 2 },
    });
    expect(clear.sections).toEqual([]);
    expect(clear.emptyMessage).toBe("You're caught up.");
    expect(clear.done?.rows).toHaveLength(2);
    expect(clear.summary).toBe('0 due · 0 still owed · you finished 2');

    const empty = weekViewModel({
      encouragement: "You're caught up.",
      owed: [],
      days: [],
      doneThisWeek: [],
      counts: { owed: 0, due: 0, done: 0 },
    });
    expect(empty.done).toBeNull();
    expect(empty.emptyMessage).toBe("You're caught up.");
  });

  it('never carries a score, even from a poisoned payload', () => {
    const poisoned = {
      ...VIEW,
      owed: [{ ...(VIEW.owed[0] as IWeekItem), percent: '92%', letterGrade: 'A-' }],
    } as unknown as IWeekView;
    const json = JSON.stringify(weekViewModel(poisoned));
    expect(json).not.toMatch(/92%/);
    expect(json).not.toMatch(/letterGrade|percent/);
  });
});
