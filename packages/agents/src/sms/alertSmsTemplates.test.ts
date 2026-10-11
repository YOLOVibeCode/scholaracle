import { AlertType } from '@scholaracle/contracts';
import { AGENDA_REMINDER_TRIGGER, SMS_SEGMENT_LIMIT, buildAlertSmsBody } from './alertSmsTemplates';
import { isGsm7 } from './gsm7';

const ORIGIN = 'https://scholarmancy.com';
const TAIL = ' Details: https://scholarmancy.com/alerts Reply STOP to opt out.';
const shortDate = (iso: string): string =>
  new Date(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

const sms = (triggerType: string, triggerData: unknown, subject = 'Alert'): string =>
  buildAlertSmsBody({ triggerType, triggerData, subject }, ORIGIN);

function expectOneGsmSegment(body: string): void {
  expect(body.length).toBeLessThanOrEqual(SMS_SEGMENT_LIMIT);
  expect(isGsm7(body)).toBe(true);
  expect(body.startsWith('Scholarmancy: ')).toBe(true);
  expect(body.endsWith(' Reply STOP to opt out.')).toBe(true);
}

describe('buildAlertSmsBody: one concise GSM-7 segment per alert type', () => {
  const emma = { studentName: 'Emma Johnson' };
  const cases: readonly [string, unknown, string][] = [
    [
      AlertType.GRADE_DROP,
      { ...emma, course: 'Math', previousGrade: 85, currentGrade: 72.4 },
      "Emma's Math grade dropped from 85% to 72%.",
    ],
    [
      AlertType.MISSING_ASSIGNMENT,
      { ...emma, course: 'Biology', assignment: 'Lab 4: Cell Respiration', daysAgo: 2 },
      'Emma has a missing assignment in Biology: Lab 4: Cell Respiration.',
    ],
    [
      AlertType.DEADLINE,
      {
        ...emma,
        course: 'English',
        assignment: 'Essay draft',
        formattedDueDate: 'Tue, Oct 14, 11:59\u202FPM',
      },
      'Emma has Essay draft due Tue, Oct 14, 11:59 PM in English.',
    ],
    [
      AlertType.TEST,
      { ...emma, course: 'Chemistry', testName: 'Unit 3 Exam', testDate: '2026-10-16T17:00:00Z' },
      `Emma's Chemistry test is ${shortDate('2026-10-16T17:00:00Z')}: Unit 3 Exam.`,
    ],
    [
      AlertType.WORKLOAD,
      { ...emma, assignmentCount: 5, isDueThisWeek: true },
      'Emma has 5 assignments due this week.',
    ],
    [
      AlertType.POSITIVE,
      { ...emma, course: 'Math', achievement: 'raised her grade to 92%' },
      'Great work by Emma in Math: raised her grade to 92%.',
    ],
    [
      AlertType.RECOMMENDATION,
      { ...emma, title: 'Review fractions before Friday' },
      'A suggestion for Emma: Review fractions before Friday.',
    ],
    [
      AGENDA_REMINDER_TRIGGER,
      { ...emma, title: 'Field trip form', timeAt: '2026-10-14T17:00:00Z' },
      `Reminder: Field trip form for Emma, due ${shortDate('2026-10-14T17:00:00Z')}.`,
    ],
  ];

  it.each(cases)('%s reads as a complete sentence with a details link', (type, data, sentence) => {
    const body = sms(type, data);
    expect(body).toBe(`Scholarmancy: ${sentence}${TAIL}`);
    expectOneGsmSegment(body);
  });

  const nasty = {
    studentName: 'Maximiliano Alejandro de la Cruz',
    course: 'AP Calculus BC \u2014 Period 3 (Room 204, Mrs. Hern\u00E1ndez-O\u2019Brien)',
    courseName: 'AP Calculus BC',
    assignment:
      '\u{1F4DD} \u201CChapter 7 Review: Integration by Parts, Partial Fractions & Improper Integrals\u201D \u2192 show all work',
    title:
      'Chapter 7 Review: Integration by Parts, Partial Fractions and Improper Integrals with Applications',
    testName:
      'Cumulative Semester Exam \u2014 Units 1\u20137 (Calculator & Non-Calculator Sections)',
    achievement:
      'Raised the quarter grade from a C to an A\u2212 after completing every optional practice set',
    previousGrade: 91.7,
    currentGrade: 68.2,
    formattedDueDate: 'Wed, Oct 15, 11:59\u202FPM',
    testDate: '2026-12-18T15:00:00Z',
    timeAt: '2026-10-20T15:00:00Z',
    assignmentCount: 12,
    isDueThisWeek: true,
  };

  it.each(cases.map(([type]) => type))(
    '%s stays one GSM segment with long names and titles, shortening values not the sentence',
    (type) => {
      for (const origin of [ORIGIN, 'https://web-dev-8552.up.railway.app']) {
        const body = buildAlertSmsBody(
          { triggerType: type, triggerData: nasty, subject: 'x' },
          origin
        );
        expectOneGsmSegment(body);
        expect(body).toContain(` Details: ${origin}/alerts`);
        expect(body).toMatch(/\. Details: /);
        expect(body).toContain('Maximiliano');
        expect(body).not.toMatch(/\.{4}|"|\(Room/);
      }
    }
  );

  it('falls back to a sanitized subject for unknown trigger types', () => {
    const body = sms('failing_grade', {}, 'Emma \u2014 Math grade: 85% \u2192 58%');
    expect(body).toBe(`Scholarmancy: Emma - Math grade: 85% to 58%.${TAIL}`);
    expectOneGsmSegment(body);
  });

  it('fills sensible defaults when alert data is missing', () => {
    const body = sms(AlertType.MISSING_ASSIGNMENT, undefined);
    expect(body).toBe(
      `Scholarmancy: Your student has a missing assignment in a class: an assignment.${TAIL}`
    );
    expectOneGsmSegment(body);
  });
});
