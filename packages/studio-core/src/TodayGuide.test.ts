/**
 * Slice 1 — TodayGuide table-driven tests.
 *
 * Fake ITodaySource only. No Express, no grades router.
 * Missing beats due-soon even when the due-soon item is earlier.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { assertNoGradeLeak, type IStudentSession } from '@scholaracle/contracts';
import type { IOpenTask, ITodaySource, IWin } from '@scholaracle/interfaces';
import { TodayGuide } from './TodayGuide';
import { loadEmmaFixtureToday } from './fixtures/emma';

const SESSION_OFF: IStudentSession = {
  studentId: 'stu-emma',
  displayName: 'Emma Mitchell',
  showGrades: false,
};

const SESSION_ON: IStudentSession = { ...SESSION_OFF, showGrades: true };

const GRADED: IWin = {
  kind: 'graded',
  assignmentExternalId: 'demo-emma-eng10-reading-8',
  title: 'Reading response 8',
  courseName: 'English 10 Honors',
};

const OPENED: IWin = {
  kind: 'opened_pack',
  assignmentExternalId: 'demo-emma-eng10-reading-8',
  title: 'Reading response 8',
  courseName: 'English 10 Honors',
};

const STREAK: IWin = {
  kind: 'on_time_streak',
  assignmentExternalId: 'streak',
  title: 'On-time work',
  courseName: 'School',
};

const CELL_DIVISION: IOpenTask = {
  kind: 'missing',
  assignmentExternalId: 'demo-emma-ap-bio-a5',
  title: 'Cell Division worksheet',
  courseName: 'AP Biology',
  dueAt: '2026-08-29T16:00:00.000Z',
  primaryCtaLabel: 'Open worksheet',
};

const VOCAB: IOpenTask = {
  kind: 'due_soon',
  assignmentExternalId: 'demo-emma-span2-vocab',
  title: 'Vocab quiz',
  courseName: 'Spanish II',
  dueAt: '2026-08-25T16:00:00.000Z',
  primaryCtaLabel: 'Open quiz',
};

const ESSAY: IOpenTask = {
  kind: 'due_soon',
  assignmentExternalId: 'demo-emma-eng10-essay',
  title: 'Essay draft',
  courseName: 'English 10 Honors',
  dueAt: '2026-08-24T16:00:00.000Z',
  primaryCtaLabel: 'Open rubric',
};

function fakeSource(wins: readonly IWin[], tasks: readonly IOpenTask[]): ITodaySource {
  return {
    recentWins: async () => wins,
    openTasks: async () => tasks,
  };
}

describe('TodayGuide', () => {
  it('recent graded + one missing due soon → encouragement names the graded item; next is the missing worksheet', async () => {
    const view = await new TodayGuide(fakeSource([GRADED], [CELL_DIVISION])).load(SESSION_OFF);
    expect(view.encouragement).toContain('Reading response 8');
    expect(view.next).not.toBeNull();
    expect(view.next?.assignmentExternalId).toBe('demo-emma-ap-bio-a5');
    expect(view.next?.primaryCtaLabel).toBe('Open worksheet');
    expect(Array.isArray(view.next)).toBe(false);
    expect(view.alsoToday).toEqual([]);
    expect(() => assertNoGradeLeak(view, false)).not.toThrow();
  });

  it('two due soon, none missing → next is the earliest due; the other is alsoToday', async () => {
    const view = await new TodayGuide(fakeSource([], [VOCAB, ESSAY])).load(SESSION_OFF);
    expect(view.next?.assignmentExternalId).toBe('demo-emma-eng10-essay');
    expect(view.alsoToday.map((s) => s.assignmentExternalId)).toEqual(['demo-emma-span2-vocab']);
  });

  it('missing beats due-soon even when the due-soon item is earlier', async () => {
    // Vocab is due 25 Aug; Cell Division missing is due 29 Aug. Missing still wins.
    const view = await new TodayGuide(fakeSource([], [VOCAB, CELL_DIVISION])).load(SESSION_OFF);
    expect(view.next?.assignmentExternalId).toBe('demo-emma-ap-bio-a5');
    expect(view.alsoToday.map((s) => s.assignmentExternalId)).toEqual(['demo-emma-span2-vocab']);
  });

  it('showGrades false → encouragement has no percent, letter, or points', async () => {
    const view = await new TodayGuide(fakeSource([GRADED], [CELL_DIVISION])).load(SESSION_OFF);
    expect(view.encouragement).not.toMatch(/\d+\s*%/);
    expect(view.encouragement).not.toMatch(/\b[ABCDF][+-]/);
    expect(view.encouragement).not.toMatch(/\bpoints?\b/i);
    expect(view.encouragement).not.toMatch(/\b\d+\s*\/\s*\d+\b/);
    expect(() => assertNoGradeLeak(view, false)).not.toThrow();
  });

  it('showGrades true still omits scores until product asks for them', async () => {
    const view = await new TodayGuide(fakeSource([GRADED], [CELL_DIVISION])).load(SESSION_ON);
    expect(view.encouragement).toBe(
      (await new TodayGuide(fakeSource([GRADED], [CELL_DIVISION])).load(SESSION_OFF)).encouragement
    );
    expect(view.encouragement).not.toMatch(/\d+\s*%/);
  });

  it('nothing due, recent win → positive encouragement; next is null; alsoToday empty', async () => {
    const view = await new TodayGuide(fakeSource([GRADED], [])).load(SESSION_OFF);
    expect(view.encouragement).toContain('Reading response 8');
    expect(view.next).toBeNull();
    expect(view.alsoToday).toEqual([]);
  });

  it('nothing due, no wins → still positive (“You’re caught up”); next is null', async () => {
    const view = await new TodayGuide(fakeSource([], [])).load(SESSION_OFF);
    expect(view.encouragement.toLowerCase()).toMatch(/caught up/);
    expect(view.encouragement).not.toMatch(/no data/i);
    expect(view.next).toBeNull();
    expect(view.alsoToday).toEqual([]);
  });

  it('opened pack yesterday → encouragement mentions it without grades', async () => {
    const view = await new TodayGuide(fakeSource([OPENED], [])).load(SESSION_OFF);
    expect(view.encouragement).toMatch(/opened/i);
    expect(view.encouragement).toContain('Reading response 8');
    expect(view.next).toBeNull();
    expect(() => assertNoGradeLeak(view, false)).not.toThrow();
  });

  it('on-time streak → encouragement is positive without grades', async () => {
    const view = await new TodayGuide(fakeSource([STREAK], [])).load(SESSION_OFF);
    expect(view.encouragement.toLowerCase()).toMatch(/streak|on-time|keep it up/);
    expect(view.next).toBeNull();
    expect(() => assertNoGradeLeak(view, false)).not.toThrow();
  });

  it('does not call a grades API hanging off the source object', async () => {
    const getGrades = jest.fn(() => {
      throw new Error('grades API must not be called');
    });
    const source: ITodaySource & { getGrades: () => never } = {
      recentWins: async () => [GRADED],
      openTasks: async () => [CELL_DIVISION],
      getGrades: getGrades as () => never,
    };
    await new TodayGuide(source).load(SESSION_OFF);
    expect(getGrades).not.toHaveBeenCalled();
  });

  it('next is never an array (runtime)', async () => {
    const view = await new TodayGuide(fakeSource([], [CELL_DIVISION, VOCAB])).load(SESSION_OFF);
    expect(Array.isArray(view.next)).toBe(false);
  });

  it('Emma fixture: encouragement names Reading response 8; next is Cell Division', async () => {
    const view = await loadEmmaFixtureToday();
    expect(view.encouragement).toContain('Reading response 8');
    expect(view.next?.assignmentExternalId).toBe('demo-emma-ap-bio-a5');
    expect(view.next?.primaryCtaLabel).toBe('Open worksheet');
    expect(view.alsoToday.map((s) => s.assignmentExternalId)).toEqual(['demo-emma-span2-vocab']);
    expect(() => assertNoGradeLeak(view, false)).not.toThrow();
  });
});

describe('ISP — studio-core stays host-agnostic', () => {
  it('TodayGuide.ts does not import Express, React, or Next', () => {
    const src = readFileSync(join(__dirname, 'TodayGuide.ts'), 'utf8');
    expect(src).not.toMatch(/from ['"]express['"]/);
    expect(src).not.toMatch(/from ['"]react['"]/);
    expect(src).not.toMatch(/from ['"]next/);
    expect(src).not.toMatch(/IStudentGradesResponse/);
  });
});
