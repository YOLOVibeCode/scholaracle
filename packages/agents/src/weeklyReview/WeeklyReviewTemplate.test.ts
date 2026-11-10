import type { IWeekItem, IWeekView } from '@scholaracle/contracts';
import {
  WEEKLY_REVIEW_PUSH_TITLE,
  WEEKLY_REVIEW_TRIGGER,
  buildParentWeeklyReviewCopy,
  buildStudentWeeklyReviewEmail,
  buildStudentWeeklyReviewPush,
  parentStudentUrl,
  parentSummaryLine,
  studentWeekUrl,
  titleList,
} from './WeeklyReviewTemplate';

function item(title: string, courseName: string): IWeekItem {
  return {
    assignmentExternalId: title.toLowerCase().replace(/\W+/g, '-'),
    title,
    courseName,
    humanStatus: 'Not turned in',
    studentStatus: 'not_started',
    needs: [],
    primaryCtaLabel: 'Open assignment',
  };
}

const FULL_WEEK: IWeekView = {
  encouragement: 'You finished 4 things. Nice.',
  owed: [item('Ch. 4 worksheet', 'Math')],
  days: [
    { date: '2026-11-08', label: 'Today', items: [item('Essay draft', 'English')] },
    { date: '2026-11-09', label: 'Tomorrow', items: [item('Ch. 5 problems', 'Math')] },
    { date: '2026-11-10', label: 'Tue', items: [] },
    { date: '2026-11-11', label: 'Wed', items: [item('Lab report', 'Science')] },
    { date: '2026-11-12', label: 'Thu', items: [] },
    { date: '2026-11-13', label: 'Fri', items: [] },
    { date: '2026-11-14', label: 'Sat', items: [] },
  ],
  doneThisWeek: [
    { assignmentExternalId: 'd1', title: 'Quiz 2', courseName: 'Math', confirmedBySchool: true },
    { assignmentExternalId: 'd2', title: 'Map', courseName: 'History', confirmedBySchool: true },
    { assignmentExternalId: 'd3', title: 'Vocab', courseName: 'English', confirmedBySchool: false },
    {
      assignmentExternalId: 'd4',
      title: 'Reading',
      courseName: 'English',
      confirmedBySchool: true,
    },
  ],
  counts: { owed: 1, due: 3, done: 4 },
};

const EMPTY_WEEK: IWeekView = {
  encouragement: 'All clear.',
  owed: [],
  days: FULL_WEEK.days.map((d) => ({ ...d, items: [] })),
  doneThisWeek: [],
  counts: { owed: 0, due: 0, done: 0 },
};

const ctx = (view: IWeekView): Parameters<typeof buildStudentWeeklyReviewPush>[0] => ({
  studentName: 'Gideon Vega',
  studentId: '64b000000000000000000001',
  view,
  webOrigin: 'https://scholarmancy.com/',
});

describe('WeeklyReviewTemplate', () => {
  it('uses the push type the phone routes to This week', () => {
    expect(WEEKLY_REVIEW_TRIGGER).toBe('weekly_review');
  });

  it('push: title plus the shared summary line', () => {
    expect(buildStudentWeeklyReviewPush(ctx(FULL_WEEK))).toEqual({
      subject: WEEKLY_REVIEW_PUSH_TITLE,
      body: 'This week: 3 due · 1 still owed · you finished 4. Tap to see the plan.',
    });
    expect(buildStudentWeeklyReviewPush(ctx(EMPTY_WEEK)).body).toBe("You're caught up.");
  });

  it('student email: first name, counts, titles, the This week link, no score', () => {
    const email = buildStudentWeeklyReviewEmail(ctx(FULL_WEEK));
    expect(email.subject).toBe('Your week: 3 due · 1 still owed · you finished 4');
    expect(email.body).toBe(
      [
        'Hi Gideon,',
        '',
        'This week: 3 due · 1 still owed · you finished 4.',
        '',
        'Still owed: "Ch. 4 worksheet" (Math).',
        '',
        'Coming up: "Essay draft" (English), "Ch. 5 problems" (Math), "Lab report" (Science).',
        '',
        'You finished 4 things this week. Nice.',
        '',
        'See the plan: https://scholarmancy.com/studio/week',
      ].join('\n')
    );
    expect(email.body).not.toMatch(/%/);
  });

  it('student email for an empty week says caught up and still links the plan', () => {
    const email = buildStudentWeeklyReviewEmail(ctx(EMPTY_WEEK));
    expect(email.subject).toBe("You're caught up, Gideon");
    expect(email.body).toContain("You're caught up.");
    expect(email.body).not.toContain('Still owed');
    expect(email.body).not.toContain('Coming up');
    expect(email.body).toContain('https://scholarmancy.com/studio/week');
  });

  it('parent copy: parent-framed counts and a link to the board, never the studio', () => {
    const copy = buildParentWeeklyReviewCopy(ctx(FULL_WEEK));
    expect(copy.subject).toBe("Gideon's week: 3 due · 1 still owed · 4 finished");
    expect(copy.body).toContain("A copy of Gideon's weekly review, as Gideon saw it:");
    expect(copy.body).toContain(
      'This week: 3 due · 1 still owed · you finished 4. Tap to see the plan.'
    );
    expect(copy.body).toContain('Still owed: "Ch. 4 worksheet" (Math).');
    expect(copy.body).toContain(
      "Open Gideon's board: https://scholarmancy.com/dashboard/students/64b000000000000000000001"
    );
    expect(copy.body).not.toContain('/studio/week');
  });

  it('helpers: first name, title list cap, urls without double slashes', () => {
    expect(parentSummaryLine({ due: 0, owed: 2, done: 1 })).toBe(
      '0 due · 2 still owed · 1 finished'
    );
    const five = ['A', 'B', 'C', 'D', 'E'].map((t) => item(t, 'Math'));
    expect(titleList(five)).toBe('"A" (Math), "B" (Math), "C" (Math) and 2 more');
    expect(titleList(five.slice(0, 2))).toBe('"A" (Math), "B" (Math)');
    expect(titleList([])).toBe('');
    expect(studentWeekUrl('https://x.test//')).toBe('https://x.test/studio/week');
    expect(parentStudentUrl('https://x.test', 'a b')).toBe(
      'https://x.test/dashboard/students/a%20b'
    );
  });
});
