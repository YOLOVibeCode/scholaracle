/**
 * @jest-environment jsdom
 *
 * Aeries recipe against a simulated portal. The driver swaps the document for
 * each URL the recipe visits and runs every page function directly against
 * jsdom, the way a WebView runs it in the portal page. The markup mirrors the
 * Aeries Student/Parent Portal (v10.26): see aeries-extractors.ts.
 */
import {
  runAeriesRecipe,
  aeriesPortalBase,
  resolveAeriesUrl,
  matchScheduleRow,
} from './aeries-recipe';
import {
  extractAeriesAssignments,
  extractAeriesAttendance,
  extractAeriesDashboardCourses,
  extractAeriesSchedule,
  extractAeriesStudentInfo,
  extractAeriesStudentList,
} from '../extractors/aeries/aeries-extractors';
import {
  M402SimAeriesDriver,
  buildM402AeriesAttendanceSync,
  buildM402AeriesClasses,
  buildM402AeriesDashboardSync,
  buildM402AeriesGradebook,
} from '../fixtures/fakePortalM402';
import { AERIES_SELECTORS_V1 } from '../selectors/aeriesV1';

const ROOT = 'https://district.aeries.net/student/';

describe('aeries url helpers', () => {
  it('derives the portal base from any portal url', () => {
    expect(aeriesPortalBase('https://x.aeries.net/student/')).toBe('https://x.aeries.net');
    expect(aeriesPortalBase('https://x.aeries.net/student')).toBe('https://x.aeries.net');
    expect(aeriesPortalBase('https://x.aeries.net/student/LoginParent.aspx')).toBe(
      'https://x.aeries.net'
    );
    expect(aeriesPortalBase('https://x.aeries.net')).toBe('https://x.aeries.net');
  });
  it('resolves portal-relative links against the student root', () => {
    expect(resolveAeriesUrl(ROOT, 'ChangeStudent.aspx?SC=5')).toBe(
      `${ROOT}ChangeStudent.aspx?SC=5`
    );
    expect(resolveAeriesUrl(ROOT, 'Widgets/ClassSummary/RedirectToGradebook?x=1')).toBe(
      `${ROOT}Widgets/ClassSummary/RedirectToGradebook?x=1`
    );
    expect(resolveAeriesUrl(ROOT, '/student/Attendance.aspx')).toBe(
      'https://district.aeries.net/student/Attendance.aspx'
    );
    expect(resolveAeriesUrl(ROOT, 'https://elsewhere.example/p')).toBe(
      'https://elsewhere.example/p'
    );
  });
  it('matches schedule rows by name, then by name without the a/b suffix, preferring the period', () => {
    const rows = [
      {
        courseId: '1A',
        name: 'Spanish 2 a',
        period: '1',
        term: 'F',
        teacher: '',
        teacherEmail: '',
        section: '',
        room: '',
      },
      {
        courseId: '1B',
        name: 'Spanish 2 b',
        period: '1',
        term: 'S',
        teacher: '',
        teacherEmail: '',
        section: '',
        room: '',
      },
      {
        courseId: '2A',
        name: 'Math',
        period: '3',
        term: 'Y',
        teacher: '',
        teacherEmail: '',
        section: '',
        room: '',
      },
    ];
    expect(matchScheduleRow(rows, 'Spanish 2 a', '')?.courseId).toBe('1A');
    expect(matchScheduleRow(rows, 'Spanish 2', '1')?.courseId).toBe('1A');
    expect(matchScheduleRow(rows, 'Math', '')?.courseId).toBe('2A');
    expect(matchScheduleRow(rows, 'Art', '')).toBeUndefined();
  });
});

describe('aeries extractors on simulated pages', () => {
  it('lists the current student and the switcher entries with clean school names', () => {
    document.body.innerHTML = buildM402AeriesDashboardSync('A');
    const list = extractAeriesStudentList(AERIES_SELECTORS_V1);
    expect(list).toEqual([
      {
        name: 'Ann Example',
        grade: '10',
        school: 'North High School',
        switchHref: '',
        isCurrent: true,
      },
      expect.objectContaining({
        name: 'Ben Example',
        grade: '8',
        school: 'West Middle School',
        isCurrent: false,
      }),
    ]);
    expect(list[1]!.switchHref).toMatch(/^ChangeStudent\.aspx\?/);
    expect(extractAeriesStudentInfo(AERIES_SELECTORS_V1)).toEqual({
      studentId: '728001',
      name: 'Ann Example',
      grade: '10',
      school: 'North High School',
    });
  });

  it('reads class cards: name, term, teacher, room, mark, percent, missing count, link', () => {
    document.body.innerHTML = buildM402AeriesDashboardSync('A');
    const cards = extractAeriesDashboardCourses(AERIES_SELECTORS_V1);
    expect(cards).toHaveLength(2);
    expect(cards[0]).toMatchObject({
      name: 'Spanish 2 a',
      term: 'Quarter 2',
      teacher: 'Rivera, M',
      room: 'S108',
      currentGrade: 92,
      currentPercent: 92.1,
      missingCount: 0,
      lastUpdated: 'Nov 04',
    });
    expect(cards[0]!.gradebookHref).toContain('RedirectToGradebook?GradebookNumber=111');
    expect(cards[1]).toMatchObject({
      name: 'Geometry Honors a',
      missingCount: 2,
      currentGrade: 78,
    });
  });

  it('reads the schedule grid with labels stripped', () => {
    document.body.innerHTML = buildM402AeriesClasses('A');
    const rows = extractAeriesSchedule(AERIES_SELECTORS_V1);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toEqual({
      courseId: '6033A',
      name: 'Spanish 2 a',
      period: '1',
      term: 'F',
      teacher: 'Rivera, M',
      teacherEmail: 'm.rivera@district.example',
      section: '1803',
      room: 'S108',
    });
  });

  it('reads assignments from the table-view rows only and flags missing work', () => {
    document.body.innerHTML = buildM402AeriesGradebook('222');
    const rows = extractAeriesAssignments(AERIES_SELECTORS_V1);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({
      number: '7',
      title: 'Unit 2 Test',
      category: 'Summative',
      scoreEarned: 55,
      scorePossible: 100,
      percentCorrect: 55,
      dateAssigned: '10/19/2026',
      dateDue: '11/04/2026',
      dateCompleted: '11/04/2026',
      gradingComplete: true,
      isMissing: false,
      comment: '',
    });
    expect(rows[1]).toMatchObject({
      number: '8',
      title: 'Homework 3.2',
      scoreEarned: null,
      isMissing: true,
      gradingComplete: false,
    });
  });

  it('reads attendance as one record per marked day or period, skipping clean days', () => {
    document.body.innerHTML = buildM402AeriesAttendanceSync();
    const att = extractAeriesAttendance(AERIES_SELECTORS_V1);
    expect(att).toEqual([
      { date: '09/07/2026', period: '', status: 'HOLIDAY', reason: '', course: '' },
      { date: '10/02/2026', period: '4', status: 'T', reason: '', course: 'Geometry Honors a' },
      { date: '10/06/2026', period: '', status: 'Testing', reason: '', course: '' },
      { date: '10/06/2026', period: '1', status: 'C', reason: '', course: 'Spanish 2 a' },
      { date: '10/06/2026', period: '4', status: 'C', reason: '', course: 'Geometry Honors a' },
    ]);
  });
});

describe('runAeriesRecipe', () => {
  it('scrapes every student on the account, joining cards, schedule, gradebooks and attendance', async () => {
    const driver = new M402SimAeriesDriver(ROOT);
    const result = await runAeriesRecipe(driver, 'https://district.aeries.net/student/');

    expect(result.students.map((s) => s.name)).toEqual(['Ann Example', 'Ben Example']);
    const ann = result.students[0]!;
    expect(ann).toMatchObject({ studentId: '728001', grade: '10', school: 'North High School' });
    expect(ann.courses).toHaveLength(2);
    expect(ann.courses[0]).toMatchObject({
      period: '1',
      name: 'Spanish 2 a',
      term: 'Quarter 2',
      teacher: 'Rivera, Marta',
      teacherEmail: 'm.rivera@district.example',
      room: 'S108',
      currentGrade: 92,
      currentPercent: 92.1,
      missingCount: 0,
      courseId: '6033A',
      section: '1803',
    });
    expect(ann.courses[0]!.assignments.map((a) => a.title)).toEqual(['Family Tree', 'Prueba 2']);
    expect(ann.courses[1]).toMatchObject({ period: '4', courseId: '2223A', missingCount: 2 });
    expect(ann.courses[1]!.assignments[1]).toMatchObject({
      title: 'Homework 3.2',
      isMissing: true,
    });
    expect(ann.attendance).toHaveLength(5);

    const ben = result.students[1]!;
    expect(ben).toMatchObject({ studentId: '826002', grade: '8', school: 'West Middle School' });
    expect(ben.courses).toHaveLength(1);
    expect(ben.courses[0]).toMatchObject({
      period: '7',
      name: 'Math 8',
      teacher: 'Lindqvist, Rita',
      courseId: '0812',
    });
    expect(ben.courses[0]!.assignments).toHaveLength(1);
    expect(ben.attendance).toEqual([]);

    const switches = driver.visited.filter((u) => u.includes('ChangeStudent.aspx'));
    expect(switches).toHaveLength(1);
    expect(driver.visited.filter((u) => u === `${ROOT}Dashboard.aspx`)).toHaveLength(2);
    expect(driver.visited.every((u) => u.startsWith('https://district.aeries.net/'))).toBe(true);
  });

  it('handles a single-student account and a missing schedule page', async () => {
    const driver = new M402SimAeriesDriver(ROOT);
    const original = driver.goto.bind(driver);
    driver.goto = async (url: string): Promise<void> => {
      await original(url);
      if (url.endsWith('Dashboard.aspx')) {
        document.body.innerHTML = document.body.innerHTML.replace(
          /<div id="StudentNameDropDownMenu"[\s\S]*?<\/div><\/div><\/nav>/,
          '</div></nav>'
        );
      }
      if (url.endsWith('Classes.aspx')) document.body.innerHTML = '<p>Not Found</p>';
    };
    const result = await runAeriesRecipe(driver, 'https://district.aeries.net/student');
    expect(result.students).toHaveLength(1);
    expect(result.students[0]!.courses[0]).toMatchObject({
      period: '1',
      teacherEmail: 'm.rivera@district.example',
      courseId: undefined,
    });
  });
});
