/**
 * Shared HTML for the M4-02 simulated Aeries and Skyward portals.
 * Used by scraper-core jsdom tests and the `@scholaracle/e2e-fake-portal` server.
 */

import type { IPageDriver } from '../driver/IPageDriver';

/** Example origin for docs; fake server uses `http://127.0.0.1:2855/fake-aeries`. */
export const FAKE_PORTAL_AERIES_DEMO_ORIGIN = 'http://127.0.0.1:2855/fake-aeries';
export const FAKE_PORTAL_AERIES_STUDENT_ROOT = `${FAKE_PORTAL_AERIES_DEMO_ORIGIN}/student/`;

/** Expected extraction sizes — must match runAeriesRecipe on the simulated driver. */
export const FAKE_PORTAL_AERIES_EXPECTED = {
  studentNames: ['Ann Example', 'Ben Example'] as const,
  ann: {
    studentId: '728001',
    courseCount: 2,
    totalAssignments: 4,
    attendanceCount: 5,
  },
  ben: {
    studentId: '826002',
    courseCount: 1,
    totalAssignments: 1,
    attendanceCount: 0,
  },
} as const;

/** Expected extraction sizes — must match runSkywardRecipe on the simulated gradebook. */
export const FAKE_PORTAL_SKYWARD_EXPECTED = {
  courseCount: 2,
  assignmentRowCount: 2,
  courseNames: ['Algebra I', 'Biology'] as const,
} as const;

export function buildM402AeriesHeader(
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

export function buildM402AeriesCard(
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

/** Immediate dashboard (jsdom tests, SimAeries driver). */
export function buildM402AeriesDashboardSync(student: 'A' | 'B'): string {
  const head =
    student === 'A'
      ? buildM402AeriesHeader('Ann Example', 'North High School', '10', [
          ['Ben Example', 'West Middle School', '8'],
        ])
      : buildM402AeriesHeader('Ben Example', 'West Middle School', '8', [
          ['Ann Example', 'North High School', '10'],
        ]);
  const cards =
    student === 'A'
      ? buildM402AeriesCard(
          'Spanish 2 a',
          'Quarter 2',
          'Rivera, M',
          'S108',
          '92',
          '92.1',
          '0',
          '111'
        ) +
        buildM402AeriesCard(
          'Geometry Honors a',
          'Quarter 2',
          'Okafor, J',
          'M110',
          '78',
          '78.4',
          '2',
          '222'
        )
      : buildM402AeriesCard(
          'Math 8',
          'Quarter 2',
          'Lindqvist, R',
          'B12',
          '100',
          '100.0',
          '0',
          '333'
        );
  return (
    `${head}<input id="txtBackpackStudentID" type="hidden" value="${student === 'A' ? '728001' : '826002'}"/>` +
    `<div id="divClass" class="widget-wrapper"><div class="widget-body classesSection">${cards}</div></div>`
  );
}

/** Inner HTML of `.classesSection` (shared by sync HTML and deferred hydration script). */
export function buildM402AeriesDashboardCardsInner(student: 'A' | 'B'): string {
  return student === 'A'
    ? buildM402AeriesCard(
        'Spanish 2 a',
        'Quarter 2',
        'Rivera, M',
        'S108',
        '92',
        '92.1',
        '0',
        '111'
      ) +
        buildM402AeriesCard(
          'Geometry Honors a',
          'Quarter 2',
          'Okafor, J',
          'M110',
          '78',
          '78.4',
          '2',
          '222'
        )
    : buildM402AeriesCard('Math 8', 'Quarter 2', 'Lindqvist, R', 'B12', '100', '100.0', '0', '333');
}

/**
 * Shell for strict-CSP HTTP replay: class cards hydrate from JSON via /static/*.js.
 * Recipe polls isAeriesDashboardReady until cards appear.
 */
export function buildM402AeriesDashboardDeferredShell(
  student: 'A' | 'B',
  opts: { readonly scriptSrc: string }
): string {
  const head =
    student === 'A'
      ? buildM402AeriesHeader('Ann Example', 'North High School', '10', [
          ['Ben Example', 'West Middle School', '8'],
        ])
      : buildM402AeriesHeader('Ben Example', 'West Middle School', '8', [
          ['Ann Example', 'North High School', '10'],
        ]);
  const key = student === 'A' ? 'A' : 'B';
  return (
    `${head}<input id="txtBackpackStudentID" type="hidden" value="${student === 'A' ? '728001' : '826002'}"/>` +
    `<script type="application/json" id="slc-aeries-dashboard">${JSON.stringify({ studentKey: key })}</script>` +
    '<div id="divClass" class="widget-wrapper"><div class="widget-body classesSection"></div></div>' +
    `<script src="${opts.scriptSrc}" defer></script>`
  );
}

export function buildM402AeriesClasses(student: 'A' | 'B'): string {
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
    `${buildM402AeriesHeader(student === 'A' ? 'Ann Example' : 'Ben Example', 'X', '1', [])}<div class="student-id">${student === 'A' ? '728001' : '826002'}</div>` +
    '<table id="gridCourses"><thead><tr class="Data normalmode"><th></th></tr></thead><tbody>' +
    '<tr><td><div class="SectionHeader">School</div></td></tr>' +
    '<tr class="SubHeaderRow normalmode"><td>Course</td><td>Pd</td><td>Trm</td><td>Cal</td><td>Teacher</td><td>Sec</td><td>Room</td><td>More Info</td><td>Today</td><td>Email</td><td>Website</td></tr>' +
    `${rows}</tbody></table>`
  );
}

export function buildM402AeriesAssignmentRow(
  n: string,
  title: string,
  cat: string,
  score: string,
  pct: string,
  due: string,
  done: string,
  gc: string,
  missing: boolean
): string {
  return (
    `<tr class="tinymode FullWidth CardView forceHide"><td>Score ${score} Complete</td></tr>` +
    `<tr class="assignment-info zebra highlight-row normalmode TableView forceShow${missing ? ' MissingAssignment' : ''}">` +
    `<td class="PlainDataClear al vat NoWrap r"><i class="icon-small-collapsed"></i>${n}<div class="assignment-details">Date Assigned: 10/19/2026 Due Time: </div></td>` +
    `<td class="PlainDataClear al vat">${title}</td><td class="PlainDataClear al vat">${cat}</td>` +
    `<td class="PlainDataClear ar vat score gc"><table><tr><td>${score}</td></tr></table></td><td class="PlainDataClear ar vat row-span">${score}</td>` +
    `<td class="PlainDataClear ar vat row-span">${pct}</td><td class="PlainDataClear al vat row-span"></td>` +
    `<td class="PlainDataClear ar vat row-span">${done}</td><td class="PlainDataClear ar vat row-span">${due}</td>` +
    `<td class="PlainDataClear ac vat row-span">${gc}</td><td class="PlainDataClear al vat row-span"></td></tr>` +
    '<tr><td colspan="11"></td></tr><tr><td colspan="11"></td></tr>'
  );
}

export function buildM402AeriesGradebook(gn: string): string {
  const option = (p: string, name: string, sel: boolean): string =>
    `<option value="${gn}_FQT2_1" ${sel ? 'selected="selected"' : ''}>${p}- ${name}- Quarter 2 10/19/2026 - 12/18/2026</option>`;
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
        buildM402AeriesAssignmentRow(
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
        buildM402AeriesAssignmentRow(
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
        buildM402AeriesAssignmentRow(
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
        buildM402AeriesAssignmentRow(
          '8',
          'Homework 3.2',
          'Formative',
          'Missing',
          '',
          '11/05/2026',
          '',
          'No',
          true
        ),
    },
    '333': {
      p: '7',
      name: 'Math 8',
      teacher: 'Lindqvist, Rita',
      mail: 'r.lindqvist@district.example',
      rows: buildM402AeriesAssignmentRow(
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

export function buildM402AeriesAttendanceSync(): string {
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

export function buildM402AeriesAttendanceDeferredShell(opts: {
  readonly scriptSrc: string;
}): string {
  return `<div class="student-id">728001</div><table id="tblNewFlex"><tbody></tbody></table><script src="${opts.scriptSrc}" defer></script>`;
}

export const FAKE_PORTAL_SKYWARD_ASSIGNMENTS: Readonly<Record<string, string>> = {
  '111':
    '<tr><td>09/02/2026</td><td>Quiz 1</td><td>95</td><td>95.00</td><td>19 out of 20</td><td></td></tr>',
  '222':
    '<tr><td>Major weighted at 60.00%</td></tr>' +
    '<tr><td>09/03/2026</td><td>Lab 1</td><td>91</td><td>91.00</td><td>91 out of 100</td><td></td></tr>',
};

export function buildM402SkywardCourseTable(
  sectionId: string,
  name: string,
  period: string
): string {
  return (
    `<table id="classDesc_${sectionId}"><tr><td class="bld classDesc"><a href="#">${name}</a></td></tr>` +
    `<tr><td><label>Period</label> ${period} (8:00 AM - 8:50 AM)</td></tr></table>`
  );
}

const SKYWARD_NAV =
  '<nav class="sf_menu">' +
  '<a href="#"><span>  Gradebook  </span></a>' +
  '<a href="#">Attendance</a>' +
  '<a href="#">Schedule</a>' +
  '</nav>';

/**
 * Fake Skyward Family Access home (sfhome01-style): nav only, no gradebook markup yet.
 * Recipe must click Gradebook before courses appear.
 */
export function buildM402SkywardHomeHtml(): string {
  return (
    '<div class="sf_headerName">Test Student</div><div id="schoolName">Example High School</div>' +
    SKYWARD_NAV +
    '<main><p>Family Access Home</p></main>'
  );
}

/** Courses + grid + dialog + missing slice (no outer nav). */
export function buildM402SkywardGradebookBody(
  opts: { readonly extraCourse?: boolean } = {}
): string {
  const { extraCourse } = opts;
  return (
    `${buildM402SkywardCourseTable('1_111_0_0', 'Algebra I', '1')}${buildM402SkywardCourseTable(
      '1_222_0_0',
      'Biology',
      '2'
    )}${extraCourse ? buildM402SkywardCourseTable('1_333_0_0', 'Art', '3') : ''}<table id="grid_stuGradesGrid">` +
    '<tr><td><a id="showGradeInfo" data-cni="222" data-lit="1ST" href="#">88</a></td>' +
    '<td><a id="showGradeInfo" data-lit="PR2" data-cni="222" href="#"><span>91</span></a></td></tr>' +
    '<tr><td><a id="showGradeInfo" data-cni="111" data-lit="1ST" href="#">95</a></td>' +
    `<td><a id="showGradeInfo" data-cni="111" data-lit="PR2" href="#">X</a></td></tr>${
      extraCourse
        ? '<tr><td><a id="showGradeInfo" data-cni="333" data-lit="1ST" href="#">100</a></td></tr>'
        : ''
    }</table>` +
    '<div class="sf_DialogWrap" style="display:none"><a class="sf_DialogClose" href="#">x</a>' +
    '<div id="gradeInfoDialog"></div></div>' +
    '<div>Missing Assignments</div>Due: 09/04/2026 <a href="#">Lost HW</a> <a href="#">Algebra I</a>' +
    '&nbsp;<span>(Period&nbsp;<b>1</b>)</span>&nbsp;<a href="#">Smith, J.</a>' +
    '<div>Class Grades</div>'
  );
}

/** Nav + courses + grid + dialog + missing slice (no script — tests attach listeners in jsdom). */
export function buildM402SkywardGradebookHtml(
  opts: { readonly extraCourse?: boolean } = {}
): string {
  return SKYWARD_NAV + buildM402SkywardGradebookBody(opts);
}

export function buildM402SkywardAttendanceBody(): string {
  return (
    `<table><tr><th>Attendance</th><th>Period</th><th>Status</th><th>Course</th></tr>` +
    `<tr><td>Sep 05 2026</td><td>1</td><td>P</td><td>Algebra I</td></tr></table>`
  );
}

export function buildM402SkywardScheduleBody(): string {
  return (
    `<table><tr><th>Term 1</th></tr>` +
    `<tr><td>Period 1 (8:00 AM - 8:50 AM)</td><td style="background:#eee">Algebra I<br/>Smith<br/>Room 101</td></tr></table>`
  );
}

export function buildM402SkywardAttendanceSection(): string {
  return SKYWARD_NAV + buildM402SkywardAttendanceBody();
}

export function buildM402SkywardScheduleSection(): string {
  return SKYWARD_NAV + buildM402SkywardScheduleBody();
}

export const FAKE_PORTAL_SKYWARD_GRADEBOOK_PATH =
  '/scripts/wsisa.dll/WService=fake-portal/sfgradebook001.w';

/** Jsdom driver: swaps document per URL like the fake Express portal. */
export class M402SimAeriesDriver implements IPageDriver {
  readonly visited: string[] = [];
  private current: 'A' | 'B' = 'A';
  private currentUrl: string;

  constructor(private readonly studentRoot: string) {
    this.currentUrl = `${studentRoot}Dashboard.aspx`;
  }

  async goto(url: string): Promise<void> {
    this.visited.push(url);
    this.currentUrl = url;
    const path = url.replace(this.studentRoot, '');
    if (path.startsWith('ChangeStudent.aspx')) {
      this.current = this.current === 'A' ? 'B' : 'A';
      document.body.innerHTML = buildM402AeriesDashboardSync(this.current);
      return;
    }
    if (path.startsWith('Dashboard.aspx'))
      document.body.innerHTML = buildM402AeriesDashboardSync(this.current);
    else if (path.startsWith('Classes.aspx'))
      document.body.innerHTML = buildM402AeriesClasses(this.current);
    else if (path.startsWith('Attendance.aspx'))
      document.body.innerHTML =
        this.current === 'A' ? buildM402AeriesAttendanceSync() : '<table id="tblNewFlex"></table>';
    else if (path.startsWith('Widgets/ClassSummary/RedirectToGradebook')) {
      const gn = new URL(url).searchParams.get('GradebookNumber') ?? '';
      document.body.innerHTML = buildM402AeriesGradebook(gn);
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
