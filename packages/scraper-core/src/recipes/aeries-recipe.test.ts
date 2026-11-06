/**
 * @jest-environment jsdom
 *
 * Aeries recipe against a simulated portal. The driver swaps the document for
 * each URL the recipe visits and runs every page function directly against
 * jsdom, the way a WebView runs it in the portal page. The markup mirrors the
 * Aeries Student/Parent Portal (v10.26): see aeries-extractors.ts.
 */
import type { IPageDriver } from '../driver/IPageDriver';
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

const ROOT = 'https://district.aeries.net/student/';

function header(
  current: string,
  school: string,
  grade: string,
  others: Array<[string, string, string]>
): string {
  return (
    '<nav id="AeriesFullPageStudentName"><div class="dropdown">' +
    `<div id="StudentNameDropDown" class="dropdown-toggle"><div class="LeftSide"><span class="StudentName">${current}</span><br/>${school} - Grade ${grade}</div></div>` +
    `<div id="StudentNameDropDownMenu" class="dropdown-menu core">${others
      .map(
        ([n, s, g]) =>
          `<a class="StudentNameDropDownOption" href="ChangeStudent.aspx?cache=1&amp;SC=45&amp;SN=${n.length}&amp;ReturnUrl=Dashboard.aspx"><div class="StudentProfileImage"></div><div class="LeftSide"><span class="StudentName">${n}</span><br/>${s} - Grade ${g}</div></a>`
      )
      .join(
        ''
      )}<a id="ctl00_LinkNewStudent" class="StudentNameDropDownOption LinkNewStudent" href="#"><div class="LeftSide">Link a New Student</div></a>` +
    '</div></div></nav>'
  );
}

function card(
  name: string,
  term: string,
  teacher: string,
  room: string,
  mark: string,
  pct: string,
  missing: string,
  gn: string
): string {
  return (
    `<div class="Card"><div class="RightSide ac"><span class="TextSubHeading">Grade</span><div class="Grade GradeA">${mark}<span>(${pct}%)</span></div></div>` +
    `<a class="TextHeading" title="Go to Gradebook" href="Widgets/ClassSummary/RedirectToGradebook?GradebookNumber=${gn}&amp;Term=FQT2&amp;CDS=1&amp;SC=5">${name} - ${term}</a>` +
    `\n${teacher}\n<span class="TextSubSection">${room}</span>` +
    '<div class="footer TextSubSection"><div class="RightSide"><table class="ac"><tbody class="attendance-container"><tr><td class="ac" title="Monday - 11/02/2026">-</td></tr></tbody></table></div>' +
    `Missing Assignments <span class="${missing === '0' ? 'NonMissingAssignment' : 'MissingAssignment'}">${missing}</span></div>` +
    '<div class="ClassLastUpdated" title="Last Updated"><i class="fa fa-clock-o"></i>Nov 04</div></div>'
  );
}

function dashboard(student: 'A' | 'B'): string {
  const head =
    student === 'A'
      ? header('Ann Example', 'North High School', '10', [
          ['Ben Example', 'West Middle School', '8'],
        ])
      : header('Ben Example', 'West Middle School', '8', [
          ['Ann Example', 'North High School', '10'],
        ]);
  const cards =
    student === 'A'
      ? card('Spanish 2 a', 'Quarter 2', 'Rivera, M', 'S108', '92', '92.1', '0', '111') +
        card('Geometry Honors a', 'Quarter 2', 'Okafor, J', 'M110', '78', '78.4', '2', '222')
      : card('Math 8', 'Quarter 2', 'Lindqvist, R', 'B12', '100', '100.0', '0', '333');
  return (
    `${head}<input id="txtBackpackStudentID" type="hidden" value="${student === 'A' ? '728001' : '826002'}"/>` +
    `<div id="divClass" class="widget-wrapper"><div class="widget-body classesSection">${cards}</div></div>`
  );
}

function classes(student: 'A' | 'B'): string {
  const row = (
    id: string,
    name: string,
    pd: string,
    trm: string,
    t: string,
    sec: string,
    room: string,
    mail: string
  ): string =>
    `<tr class="newRow"><td>Course ${id} - ${name}</td><td>Pd ${pd}</td><td>Trm ${trm}</td><td>Cal 1</td><td>Teacher ${t}</td><td>Sec ${sec}</td><td>Room ${room}</td><td></td><td></td><td>Email <a href="mailto:${mail}">${mail}</a></td><td></td></tr>`;
  const rows =
    student === 'A'
      ? row(
          '6033A',
          'Spanish 2 a',
          '1',
          'F',
          'Rivera, M',
          '1803',
          'S108',
          'm.rivera@district.example'
        ) +
        row(
          '6033B',
          'Spanish 2 b',
          '1',
          'S',
          'Rivera, M',
          '1810',
          'S108',
          'm.rivera@district.example'
        ) +
        row(
          '2223A',
          'Geometry Honors a',
          '4',
          'F',
          'Okafor, J',
          '1067',
          'M110',
          'j.okafor@district.example'
        )
      : row(
          '0812',
          'Math 8',
          '7',
          'Y',
          'Lindqvist, R',
          '2201',
          'B12',
          'r.lindqvist@district.example'
        );
  return (
    `${header(student === 'A' ? 'Ann Example' : 'Ben Example', 'X', '1', [])}<div class="student-id">${student === 'A' ? '728001' : '826002'}</div>` +
    '<table id="gridCourses"><thead><tr class="Data normalmode"><th></th></tr></thead><tbody>' +
    '<tr><td><div class="SectionHeader">School</div></td></tr>' +
    '<tr class="SubHeaderRow normalmode"><td>Course</td><td>Pd</td><td>Trm</td><td>Cal</td><td>Teacher</td><td>Sec</td><td>Room</td><td>More Info</td><td>Today</td><td>Email</td><td>Website</td></tr>' +
    `${rows}</tbody></table>`
  );
}

function gradebook(gn: string): string {
  const option = (p: string, name: string, sel: boolean): string =>
    `<option value="${gn}_FQT2_1" ${sel ? 'selected="selected"' : ''}>${p}- ${name}- Quarter 2 10/19/2026 - 12/18/2026</option>`;
  const assignment = (
    n: string,
    title: string,
    cat: string,
    score: string,
    pct: string,
    due: string,
    done: string,
    gc: string,
    missing: boolean
  ): string =>
    `<tr class="tinymode FullWidth CardView forceHide"><td>Score ${score} Complete</td></tr>` +
    `<tr class="assignment-info zebra highlight-row normalmode TableView forceShow${missing ? ' MissingAssignment' : ''}">` +
    `<td class="PlainDataClear al vat NoWrap r"><i class="icon-small-collapsed"></i>${n}<div class="assignment-details">Date Assigned: 10/19/2026 Due Time: </div></td>` +
    `<td class="PlainDataClear al vat">${title}</td><td class="PlainDataClear al vat">${cat}</td>` +
    `<td class="PlainDataClear ar vat score gc"><table><tr><td>${score}</td></tr></table></td><td class="PlainDataClear ar vat row-span">${score}</td>` +
    `<td class="PlainDataClear ar vat row-span">${pct}</td><td class="PlainDataClear al vat row-span"></td>` +
    `<td class="PlainDataClear ar vat row-span">${done}</td><td class="PlainDataClear ar vat row-span">${due}</td>` +
    `<td class="PlainDataClear ac vat row-span">${gc}</td><td class="PlainDataClear al vat row-span"></td></tr>` +
    '<tr><td colspan="11"></td></tr><tr><td colspan="11"></td></tr>';
  const byGn: Record<
    string,
    { p: string; name: string; teacher: string; mail: string; rows: string }
  > = {
    '111': {
      p: '1',
      name: 'Spanish 2 a',
      teacher: 'Rivera, Marta',
      mail: 'm.rivera@district.example',
      rows:
        assignment(
          '13',
          'Family Tree',
          'Summative',
          '100 / 100',
          '100.00%',
          '10/20/2026',
          '10/20/2026',
          'Yes',
          false
        ) +
        assignment(
          '14',
          'Prueba 2',
          'Formative',
          '85 / 100',
          '85.00%',
          '10/22/2026',
          '10/22/2026',
          'Yes',
          false
        ),
    },
    '222': {
      p: '4',
      name: 'Geometry Honors a',
      teacher: 'Okafor, Jide',
      mail: 'j.okafor@district.example',
      rows:
        assignment(
          '7',
          'Unit 2 Test',
          'Summative',
          '55 / 100',
          '55.00%',
          '11/04/2026',
          '11/04/2026',
          'Yes',
          false
        ) +
        assignment('8', 'Homework 3.2', 'Formative', 'Missing', '', '11/05/2026', '', 'No', true),
    },
    '333': {
      p: '7',
      name: 'Math 8',
      teacher: 'Lindqvist, Rita',
      mail: 'r.lindqvist@district.example',
      rows: assignment(
        '9',
        'Unit 3 Quiz',
        'Formative',
        '100 / 100',
        '100.00%',
        '10/23/2026',
        '10/23/2026',
        'Yes',
        false
      ),
    },
  };
  const g = byGn[gn]!;
  return (
    `<div class="student-id">${gn === '333' ? '826002' : '728001'}</div>` +
    '<table id="ctl00_MainContent_subGBS_tblEverything"><tr><td>' +
    `<select name="ctl00$MainContent$subGBS$dlGN">${option('9', 'Other Class', false)}${option(g.p, g.name, true)}</select>` +
    `<span id="ctl00_MainContent_subGBS_lblTeacherName">${g.teacher}</span> <a class="link-style" href="mailto:${g.mail}">${g.mail}</a>` +
    '<div id="ctl00_MainContent_subGBS_assignmentsView" class="assignments-view"><table class="GradebookDetailsTable ResultsTable">' +
    '<tr><th>#</th><th>Description</th><th>Category</th><th>Score</th><th># Correct</th><th>%</th><th>Comment</th><th>Date Completed</th><th>Due Date</th><th>Grading Complete</th><th>Documents</th></tr>' +
    `${g.rows}</table></div></td></tr></table>`
  );
}

function attendance(): string {
  const hdr = (pd: string, cls: string, t: string): string =>
    `<td class="k-header"><div class="HeaderPD">${pd}</div><div class="HeaderTime">8:30 AM</div><div class="HeaderClass">(1803) ${cls}</div><div class="HeaderTeacher">${t}</div></td>`;
  const day = (d: string, date: string, allDay: string, cells: string[]): string =>
    `<tr><td><span class="gridDay">${d}</span> <span class="gridDate">${date}</span></td><td><span class="AllDayCodeReadOnly defaultpadding">${allDay}</span></td>${cells
      .map((c) =>
        c === 'x'
          ? '<td><div class="NoClass">-</div></td>'
          : `<td><span class="defaultpadding">${c}</span></td>`
      )
      .join('')}</tr>`;
  return (
    '<div class="student-id">728001</div><table id="tblNewFlex"><tbody>' +
    `<tr class="InlineHeaderTR"><td class="k-header">Date</td><td class="k-header">All Day code</td>${hdr('1', 'Spanish 2 a', 'Rivera, M')}${hdr('4', 'Geometry Honors a', 'Okafor, J')}</tr>` +
    `${day('Mon', '09/07/2026', 'HOLIDAY', ['x', 'x'])}${day('Fri', '10/02/2026', '', ['', 'T'])}${day('Tue', '10/06/2026', 'Testing', ['C', 'C'])}${day('Wed', '10/07/2026', '', ['', ''])}` +
    '</tbody></table>'
  );
}

/** Serves a document per URL and tracks which student is "current". */
class SimPortalDriver implements IPageDriver {
  readonly visited: string[] = [];
  private current: 'A' | 'B' = 'A';
  private currentUrl = `${ROOT}Dashboard.aspx`;

  async goto(url: string): Promise<void> {
    this.visited.push(url);
    this.currentUrl = url;
    const path = url.replace(ROOT, '');
    if (path.startsWith('ChangeStudent.aspx')) {
      this.current = this.current === 'A' ? 'B' : 'A';
      document.body.innerHTML = dashboard(this.current);
      return;
    }
    if (path.startsWith('Dashboard.aspx')) document.body.innerHTML = dashboard(this.current);
    else if (path.startsWith('Classes.aspx')) document.body.innerHTML = classes(this.current);
    else if (path.startsWith('Attendance.aspx'))
      document.body.innerHTML =
        this.current === 'A' ? attendance() : '<table id="tblNewFlex"></table>';
    else if (path.startsWith('Widgets/ClassSummary/RedirectToGradebook')) {
      const gn = new URL(url).searchParams.get('GradebookNumber') ?? '';
      document.body.innerHTML = gradebook(gn);
    } else document.body.innerHTML = '<p>Not Found</p>';
  }
  url(): string {
    return this.currentUrl;
  }
  async evaluate<TArgs extends unknown[], TResult>(
    fn: (...args: TArgs) => TResult | Promise<TResult>,
    ...args: TArgs
  ): Promise<TResult> {
    return fn(...args);
  }
  async content(): Promise<string> {
    return document.documentElement.outerHTML;
  }
  async waitForLoad(): Promise<void> {}
  async waitForUrlIncludes(): Promise<void> {}
  async sleep(): Promise<void> {}
  onNewPage(): void {}
}

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
    document.body.innerHTML = dashboard('A');
    const list = extractAeriesStudentList();
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
    expect(extractAeriesStudentInfo()).toEqual({
      studentId: '728001',
      name: 'Ann Example',
      grade: '10',
      school: 'North High School',
    });
  });

  it('reads class cards: name, term, teacher, room, mark, percent, missing count, link', () => {
    document.body.innerHTML = dashboard('A');
    const cards = extractAeriesDashboardCourses();
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
    document.body.innerHTML = classes('A');
    const rows = extractAeriesSchedule();
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
    document.body.innerHTML = gradebook('222');
    const rows = extractAeriesAssignments();
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
    document.body.innerHTML = attendance();
    const att = extractAeriesAttendance();
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
    const driver = new SimPortalDriver();
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

    // Switched exactly once, through the switcher link, then reloaded the dashboard.
    const switches = driver.visited.filter((u) => u.includes('ChangeStudent.aspx'));
    expect(switches).toHaveLength(1);
    expect(driver.visited.filter((u) => u === `${ROOT}Dashboard.aspx`)).toHaveLength(2);
    // Never waits on network idle.
    expect(driver.visited.every((u) => u.startsWith('https://district.aeries.net/'))).toBe(true);
  });

  it('handles a single-student account and a missing schedule page', async () => {
    const driver = new SimPortalDriver();
    // Make the switcher empty and the schedule 404 by overriding goto for those paths.
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
    // Period still comes from the gradebook page; email from the gradebook page.
    expect(result.students[0]!.courses[0]).toMatchObject({
      period: '1',
      teacherEmail: 'm.rivera@district.example',
      courseId: undefined,
    });
  });
});
