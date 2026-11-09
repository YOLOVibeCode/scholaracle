/**
 * Slice 0 — studio wire contracts.
 *
 * Pins ITodayView / IWorkPackView shape, rejects gradebook leakage, and
 * asserts this file never imports IStudentGradesResponse (ISP).
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  STUDENT_SESSION_KEYS,
  STUDENT_HELP_NOTE_MAX_CHARS,
  TODAY_VIEW_KEYS,
  WORK_PACK_VIEW_KEYS,
  NEXT_STEP_KEYS,
  WEEK_VIEW_KEYS,
  WEEK_ITEM_KEYS,
  WEEK_DAY_LABELS,
  WEEK_NEEDS,
  parseTodayView,
  parseWorkPackView,
  parseWeekView,
  parseStudentStatusUpdateResponse,
  studioStatusPatchBody,
  assertNoGradeLeak,
  type IStudentSession,
  type IStudentStatusUpdateRequest,
  type IStudentStatusUpdateResponse,
  type ITodayView,
  type IWorkPackView,
  type INextStep,
  type IWeekDay,
  type IWeekDone,
  type IWeekItem,
  type IWeekView,
} from './studio';

describe('student status PATCH contract (student review R3)', () => {
  it('lists the four student statuses and caps the need-help note at 140 characters', () => {
    expect([...STUDENT_STATUSES]).toEqual(['not_started', 'working_on_it', 'need_help', 'done']);
    expect(STUDENT_HELP_NOTE_MAX_CHARS).toBe(140);
  });

  it('request carries status plus an optional note; response reports notified/nextAllowedAt', () => {
    const request: IStudentStatusUpdateRequest = { status: 'need_help', note: "I don't get #7" };
    const limited: IStudentStatusUpdateResponse = {
      success: true,
      studentStatus: 'need_help',
      studentNote: request.note,
      notified: false,
      nextAllowedAt: '2026-11-10T18:00:00.000Z',
    };
    const plain: IStudentStatusUpdateResponse = { success: true, studentStatus: 'done' };
    expect(Object.keys(request)).toEqual(['status', 'note']);
    expect(limited.notified).toBe(false);
    expect(plain.notified).toBeUndefined();
  });
});
import type { ICourseMaterial } from './materials';

const NEXT: INextStep = {
  assignmentExternalId: 'demo-emma-ap-bio-a5',
  title: 'Cell Division worksheet',
  courseName: 'AP Biology',
  dueAt: '2026-08-27T16:00:00.000Z',
  primaryCtaLabel: 'Open worksheet',
};

const TODAY: ITodayView = {
  encouragement: 'Nice work on Reading response 8.',
  next: NEXT,
  alsoToday: [
    {
      assignmentExternalId: 'demo-emma-eng10-essay',
      title: 'Essay draft',
      courseName: 'English 10 Honors',
      primaryCtaLabel: 'Open rubric',
    },
  ],
};

const PACK: IWorkPackView = {
  title: 'Cell Division worksheet',
  courseName: 'AP Biology',
  dueAt: '2026-08-27T16:00:00.000Z',
  humanStatus: 'Not turned in',
  instructionsText: 'Complete the Cell Division worksheet and submit via Canvas.',
  primaryAsset: {
    assetId: 'demo-asset-demo-emma-ap-bio-lab-safety',
    contentHash: 'demo-demo-emma-ap-bio-lab-safety-hash',
    fileName: 'lab-safety.pdf',
    mimeType: 'application/pdf',
  },
  needsSchoolLogin: [
    {
      label: 'View in Canvas',
      href: 'https://school.instructure.com/courses/bio101/assignments/cell-division',
      kind: 'school-login',
    },
  ],
  moreFromCourse: [
    {
      title: 'AP Biology Syllabus',
      asset: {
        assetId: 'demo-asset-demo-emma-ap-bio-syllabus',
        contentHash: 'demo-demo-emma-ap-bio-syllabus-hash',
        fileName: 'syllabus.pdf',
      },
    },
  ],
  capturedPages: [],
};

describe('IStudentSession', () => {
  it('is student-facing only: studentId, displayName, showGrades — no siblings, no grades payload', () => {
    const session: IStudentSession = {
      studentId: 'stu-emma',
      displayName: 'Emma Mitchell',
      showGrades: false,
    };
    expect(Object.keys(session).sort()).toEqual([...STUDENT_SESSION_KEYS].sort());
    expect(session.showGrades).toBe(false);
    expect(session).not.toHaveProperty('grades');
    expect(session).not.toHaveProperty('siblings');
  });
});

describe('ITodayView', () => {
  it('has encouragement plus optional next (single object, not an array)', () => {
    expect(TODAY.encouragement).toEqual(expect.any(String));
    expect(TODAY.next).toEqual(
      expect.objectContaining({ assignmentExternalId: expect.any(String) })
    );
    expect(Array.isArray(TODAY.next)).toBe(false);
    expect(Array.isArray(TODAY.alsoToday)).toBe(true);
  });

  it('JSON keys for a fully populated view are exactly the allowlist', () => {
    expect(Object.keys(TODAY).sort()).toEqual([...TODAY_VIEW_KEYS].sort());
  });

  it('INextStep required keys are assignmentExternalId, title, courseName, primaryCtaLabel', () => {
    expect([...NEXT_STEP_KEYS]).toEqual(
      expect.arrayContaining(['assignmentExternalId', 'title', 'courseName', 'primaryCtaLabel'])
    );
    for (const key of Object.keys(NEXT)) {
      expect(NEXT_STEP_KEYS).toContain(key);
    }
    expect(NEXT.assignmentExternalId).toBe('demo-emma-ap-bio-a5');
    expect(NEXT.primaryCtaLabel).toBe('Open worksheet');
  });

  it('parseTodayView accepts a valid payload and returns ITodayView', () => {
    const parsed = parseTodayView(JSON.parse(JSON.stringify(TODAY)) as unknown);
    expect(parsed.encouragement).toBe(TODAY.encouragement);
    expect(parsed.next?.assignmentExternalId).toBe(NEXT.assignmentExternalId);
    expect(parsed.alsoToday).toHaveLength(1);
  });

  it('parseTodayView accepts next: null and empty alsoToday', () => {
    const parsed = parseTodayView({
      encouragement: "You're caught up.",
      next: null,
      alsoToday: [],
    });
    expect(parsed.next).toBeNull();
    expect(parsed.alsoToday).toEqual([]);
  });

  it('parseTodayView rejects next as an array', () => {
    expect(() =>
      parseTodayView({
        encouragement: 'Go.',
        next: [NEXT],
        alsoToday: [],
      })
    ).toThrow(/next/i);
  });

  it('parseTodayView rejects a gradebook dump mixed into Today (letterGrade / percent)', () => {
    expect(() =>
      parseTodayView({
        ...TODAY,
        letterGrade: 'A-',
      })
    ).toThrow(/letterGrade|unexpected/i);
    expect(() =>
      parseTodayView({
        ...TODAY,
        percent: 91,
      })
    ).toThrow(/percent|unexpected/i);
  });
});

describe('IWorkPackView', () => {
  it('has instructions, primary asset, school-login links, and moreFromCourse — not a course dump at top level', () => {
    expect(PACK.instructionsText.length).toBeGreaterThan(0);
    expect(PACK.primaryAsset).not.toBeNull();
    expect(PACK.primaryAsset?.fileName).toBe('lab-safety.pdf');
    expect(PACK.needsSchoolLogin[0]?.kind).toBe('school-login');
    expect(PACK.moreFromCourse[0]?.title).toBe('AP Biology Syllabus');
    expect(PACK).not.toHaveProperty('courseMaterials');
    expect(PACK).not.toHaveProperty('allMaterials');
    expect(PACK.humanStatus).toBe('Not turned in');
    expect(PACK.humanStatus).not.toMatch(/^(missing|submitted|graded|late|unknown)$/);
  });

  it('JSON keys for a fully populated pack are exactly the allowlist', () => {
    expect(Object.keys(PACK).sort()).toEqual([...WORK_PACK_VIEW_KEYS].sort());
  });

  it('parseWorkPackView accepts a valid payload', () => {
    const parsed = parseWorkPackView(JSON.parse(JSON.stringify(PACK)) as unknown);
    expect(parsed.primaryAsset?.assetId).toBe(PACK.primaryAsset?.assetId);
    expect(parsed.needsSchoolLogin).toHaveLength(1);
    expect(parsed.moreFromCourse).toHaveLength(1);
  });

  it('parseWorkPackView accepts a pack with no hosted file', () => {
    const parsed = parseWorkPackView({
      title: 'Vocab quiz',
      courseName: 'Spanish II',
      humanStatus: 'Not turned in',
      instructionsText: 'Study the list.',
      primaryAsset: null,
      needsSchoolLogin: [],
      moreFromCourse: [],
    });
    expect(parsed.primaryAsset).toBeNull();
    expect(parsed.capturedPages).toEqual([]);
  });

  it('parseWorkPackView rejects a course dump mixed at top level', () => {
    expect(() =>
      parseWorkPackView({
        ...PACK,
        courseMaterials: [{ title: 'Syllabus' }],
      })
    ).toThrow(/courseMaterials|unexpected/i);
  });
});

describe('assertNoGradeLeak', () => {
  it('passes when showGrades is false and copy has no percent, letter, or points', () => {
    expect(() => assertNoGradeLeak(TODAY, false)).not.toThrow();
    expect(() => assertNoGradeLeak(PACK, false)).not.toThrow();
  });

  it('throws when showGrades is false and encouragement contains a percent', () => {
    expect(() =>
      assertNoGradeLeak({ ...TODAY, encouragement: 'Nice work — 91% on the quiz.' }, false)
    ).toThrow(/grade|percent/i);
  });

  it('throws when showGrades is false and encouragement contains a letter grade', () => {
    expect(() =>
      assertNoGradeLeak({ ...TODAY, encouragement: 'Nice work, you got an A-.' }, false)
    ).toThrow(/grade|letter/i);
  });

  it('throws when showGrades is false and encouragement contains points', () => {
    expect(() =>
      assertNoGradeLeak({ ...TODAY, encouragement: 'You earned 9/10 points.' }, false)
    ).toThrow(/grade|points/i);
  });

  it('does not throw on the same copy when showGrades is true', () => {
    expect(() =>
      assertNoGradeLeak({ ...TODAY, encouragement: 'Nice work — 91% on the quiz.' }, true)
    ).not.toThrow();
  });
});

describe('parser error paths', () => {
  it('parseTodayView rejects non-objects and a non-array alsoToday', () => {
    expect(() => parseTodayView(null)).toThrow(/ITodayView/);
    expect(() => parseTodayView({ encouragement: 'Go.', next: null, alsoToday: 'nope' })).toThrow(
      /alsoToday/
    );
  });

  it('parseWorkPackView rejects non-objects and non-array lists', () => {
    expect(() => parseWorkPackView('nope')).toThrow(/IWorkPackView/);
    expect(() =>
      parseWorkPackView({
        title: 'T',
        courseName: 'C',
        humanStatus: 'Not turned in',
        instructionsText: 'Do it.',
        primaryAsset: null,
        needsSchoolLogin: 'nope',
        moreFromCourse: [],
      })
    ).toThrow(/needsSchoolLogin/);
    expect(() =>
      parseWorkPackView({
        title: 'T',
        courseName: 'C',
        humanStatus: 'Not turned in',
        instructionsText: 'Do it.',
        primaryAsset: null,
        needsSchoolLogin: [],
        moreFromCourse: 'nope',
      })
    ).toThrow(/moreFromCourse/);
  });

  it('nested parsers reject non-objects and an invalid link kind', () => {
    expect(() =>
      parseTodayView({
        encouragement: 'Go.',
        next: 'nope',
        alsoToday: [],
      })
    ).toThrow(/next/);
    expect(() =>
      parseWorkPackView({
        title: 'T',
        courseName: 'C',
        humanStatus: 'Not turned in',
        instructionsText: 'Do it.',
        primaryAsset: 'nope',
        needsSchoolLogin: [],
        moreFromCourse: [],
      })
    ).toThrow(/primaryAsset/);
    expect(() =>
      parseWorkPackView({
        title: 'T',
        courseName: 'C',
        humanStatus: 'Not turned in',
        instructionsText: 'Do it.',
        primaryAsset: null,
        needsSchoolLogin: [{ label: 'Canvas', href: 'https://example.com', kind: 'portal' }],
        moreFromCourse: [],
      })
    ).toThrow(/kind/);
    expect(() =>
      parseWorkPackView({
        title: 'T',
        courseName: 'C',
        humanStatus: 'Not turned in',
        instructionsText: 'Do it.',
        primaryAsset: null,
        needsSchoolLogin: ['nope'],
        moreFromCourse: [],
      })
    ).toThrow(/needsSchoolLogin/);
    expect(() =>
      parseWorkPackView({
        title: 'T',
        courseName: 'C',
        humanStatus: 'Not turned in',
        instructionsText: 'Do it.',
        primaryAsset: null,
        needsSchoolLogin: [],
        moreFromCourse: ['nope'],
      })
    ).toThrow(/moreFromCourse/);
    expect(() =>
      parseTodayView({
        encouragement: '',
        next: null,
        alsoToday: [],
      })
    ).toThrow(/encouragement/);
  });
});

describe('ICourseMaterial contentHash', () => {
  it('accepts contentHash when an asset exists', () => {
    const material: ICourseMaterial = {
      externalId: 'demo-emma-ap-bio-lab-safety',
      title: 'Lab Safety Handout',
      type: 'handout',
      fileName: 'lab-safety.pdf',
      assetId: 'demo-asset-demo-emma-ap-bio-lab-safety',
      contentHash: 'demo-demo-emma-ap-bio-lab-safety-hash',
      assignmentExternalId: 'demo-emma-ap-bio-a5',
    };
    expect(material.contentHash).toBe('demo-demo-emma-ap-bio-lab-safety-hash');
  });
});

describe('ISP — studio types do not import the gradebook', () => {
  it('studio.ts source does not mention IStudentGradesResponse or ./grades', () => {
    const src = fs.readFileSync(path.join(__dirname, 'studio.ts'), 'utf8');
    expect(src).not.toMatch(/IStudentGradesResponse/);
    expect(src).not.toMatch(/from ['"]\.\/grades['"]/);
    expect(src).not.toMatch(/letterGrade/);
    expect(src).not.toMatch(/pointsEarned/);
    expect(src).not.toMatch(/INudgePublisher/);
  });
});

describe('IWeekView — student review (R1)', () => {
  const ITEM: IWeekItem = {
    assignmentExternalId: 'demo-emma-ap-bio-a5',
    title: 'Cell Division worksheet',
    courseName: 'AP Biology',
    dueAt: '2026-08-27T16:00:00.000Z',
    humanStatus: 'Due soon',
    studentStatus: 'not_started',
    needs: ['saved_file', 'internet'],
    primaryCtaLabel: 'Open worksheet',
  };

  const OWED: IWeekItem = {
    ...ITEM,
    assignmentExternalId: 'demo-emma-alg2-missing-1',
    title: 'Missing assignment 1',
    courseName: 'Algebra II',
    humanStatus: 'Not turned in',
    studentStatus: 'done',
    needs: [],
    warning: 'Marked done, but the school shows not turned in',
  };

  const TODAY_DAY: IWeekDay = { date: '2026-08-27', label: 'Today', items: [ITEM] };

  const DONE: IWeekDone = {
    assignmentExternalId: 'demo-emma-eng10-a9',
    title: 'Essay draft',
    courseName: 'English 10 Honors',
    dueAt: '2026-08-30T16:00:00.000Z',
    confirmedBySchool: true,
  };

  const WEEK: IWeekView = {
    encouragement: 'Nice work on Reading response 8.',
    owed: [OWED],
    days: [
      TODAY_DAY,
      { date: '2026-08-28', label: 'Tomorrow', items: [] },
      { date: '2026-08-29', label: 'Sat', items: [] },
    ],
    doneThisWeek: [DONE],
    counts: { owed: 1, due: 1, done: 1 },
  };

  it('pins the wire keys', () => {
    expect(WEEK_VIEW_KEYS).toEqual(['encouragement', 'owed', 'days', 'doneThisWeek', 'counts']);
    expect(WEEK_ITEM_KEYS).toEqual([
      'assignmentExternalId',
      'title',
      'courseName',
      'dueAt',
      'humanStatus',
      'studentStatus',
      'needs',
      'primaryCtaLabel',
      'warning',
    ]);
    expect(WEEK_DAY_LABELS).toEqual([
      'Today',
      'Tomorrow',
      'Sun',
      'Mon',
      'Tue',
      'Wed',
      'Thu',
      'Fri',
      'Sat',
    ]);
    expect(STUDENT_STATUSES).toEqual(['not_started', 'working_on_it', 'need_help', 'done']);
    expect(WEEK_NEEDS).toEqual(['saved_file', 'school_login', 'internet']);
  });

  it('parseWeekView round-trips a valid view', () => {
    expect(parseWeekView(JSON.parse(JSON.stringify(WEEK)))).toEqual(WEEK);
  });

  it('parseWeekView rejects a gradebook field smuggled onto an item', () => {
    const poisoned = {
      ...WEEK,
      owed: [{ ...OWED, pointsEarned: 4 }],
    };
    expect(() => parseWeekView(poisoned)).toThrow(/unexpected/);
  });

  it('parseWeekView rejects an unknown studentStatus, need, or list shape', () => {
    const day = TODAY_DAY;
    expect(() =>
      parseWeekView({ ...WEEK, days: [{ ...day, items: [{ ...ITEM, studentStatus: 'x' }] }] })
    ).toThrow(/studentStatus/);
    expect(() =>
      parseWeekView({ ...WEEK, days: [{ ...day, items: [{ ...ITEM, needs: ['wifi'] }] }] })
    ).toThrow(/needs/);
    expect(() => parseWeekView({ ...WEEK, days: 'nope' })).toThrow(/days/);
    expect(() => parseWeekView({ ...WEEK, counts: { owed: 1, due: 1 } })).toThrow(/counts/);
    expect(() => parseWeekView(null)).toThrow(/IWeekView/);
  });

  it('assertNoGradeLeak scans encouragement, items, warnings, and done titles', () => {
    const day = TODAY_DAY;
    expect(() => assertNoGradeLeak(WEEK, false)).not.toThrow();
    expect(() =>
      assertNoGradeLeak({ ...WEEK, encouragement: 'You are at 91% now.' }, false)
    ).toThrow(/grade|percent/i);
    expect(() =>
      assertNoGradeLeak(
        { ...WEEK, days: [{ ...day, items: [{ ...ITEM, title: 'Quiz (A-)' }] }] },
        false
      )
    ).toThrow(/grade|letter/i);
    expect(() =>
      assertNoGradeLeak(
        { ...WEEK, owed: [{ ...OWED, warning: 'School shows 4/10 points' }] },
        false
      )
    ).toThrow(/grade|points/i);
    expect(() =>
      assertNoGradeLeak({ ...WEEK, owed: [{ ...OWED, humanStatus: 'Graded 85%' }] }, false)
    ).toThrow(/grade|percent/i);
    expect(() =>
      assertNoGradeLeak({ ...WEEK, doneThisWeek: [{ ...DONE, title: 'Essay 9/10' }] }, false)
    ).toThrow(/grade|points/i);
    expect(() => assertNoGradeLeak({ ...WEEK, encouragement: '91% now.' }, true)).not.toThrow();
  });
});

describe('status PATCH body + response (R2 clients, R3 server)', () => {
  it('studioStatusPatchBody sends a trimmed note only when there is one', () => {
    expect(studioStatusPatchBody('need_help', "  I don't get #7 ")).toEqual({
      status: 'need_help',
      note: "I don't get #7",
    });
    expect(studioStatusPatchBody('need_help', '   ')).toEqual({ status: 'need_help' });
    expect(studioStatusPatchBody('done')).toEqual({ status: 'done' });
    expect(studioStatusPatchBody(null, undefined)).toEqual({ status: null });
  });

  it('parseStudentStatusUpdateResponse keeps notified / nextAllowedAt when present', () => {
    expect(
      parseStudentStatusUpdateResponse({
        success: true,
        studentStatus: 'need_help',
        studentNote: 'stuck',
        notified: false,
        nextAllowedAt: '2026-11-10T18:00:00.000Z',
      })
    ).toEqual({
      success: true,
      studentStatus: 'need_help',
      studentNote: 'stuck',
      notified: false,
      nextAllowedAt: '2026-11-10T18:00:00.000Z',
    });
    expect(
      parseStudentStatusUpdateResponse({
        success: true,
        studentStatus: 'need_help',
        notified: true,
      })
    ).toEqual({ success: true, studentStatus: 'need_help', notified: true });
  });

  it('parseStudentStatusUpdateResponse accepts an older server that never says notified', () => {
    expect(parseStudentStatusUpdateResponse({ success: true, studentStatus: 'done' })).toEqual({
      success: true,
      studentStatus: 'done',
    });
    expect(parseStudentStatusUpdateResponse({ success: true, studentStatus: null })).toEqual({
      success: true,
      studentStatus: null,
    });
    expect(parseStudentStatusUpdateResponse({ success: true })).toEqual({
      success: true,
      studentStatus: null,
    });
  });

  it('parseStudentStatusUpdateResponse rejects garbage', () => {
    expect(() => parseStudentStatusUpdateResponse(null)).toThrow(/expected object/);
    expect(() => parseStudentStatusUpdateResponse({ success: false })).toThrow(/success/);
    expect(() =>
      parseStudentStatusUpdateResponse({ success: true, studentStatus: 'late' })
    ).toThrow(/studentStatus/);
    expect(() =>
      parseStudentStatusUpdateResponse({
        success: true,
        studentStatus: 'need_help',
        notified: 'yes',
      })
    ).toThrow(/notified/);
    expect(() =>
      parseStudentStatusUpdateResponse({
        success: true,
        studentStatus: 'need_help',
        nextAllowedAt: 5,
      })
    ).toThrow(/nextAllowedAt/);
  });
});
