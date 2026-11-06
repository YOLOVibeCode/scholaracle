/**
 * Aeries Parent Portal browser-context extractor functions.
 *
 * These functions run inside the browser context. They must be self-contained
 * — no imports, no closure over outer scope. Each one is listed in
 * page-fns/registry.ts so the mobile (Hermes) driver can ship its source.
 *
 * Written against the Aeries Student/Parent Portal as deployed by Keller ISD
 * (Aeries SIS v10.26, Nov 2026). Page anatomy:
 *
 * - Dashboard.aspx: `#StudentNameDropDown` (current student) and
 *   `#StudentNameDropDownMenu a.StudentNameDropDownOption` (other students,
 *   href `ChangeStudent.aspx?...&SC=..&SN=..`), `.StudentCard` per student, and
 *   `#divClass .Card` per class with `a.TextHeading` linking to
 *   `Widgets/ClassSummary/RedirectToGradebook?GradebookNumber=..&Term=..&CDS=..&SC=..`.
 * - GradebookDetails.aspx: `.student-id`, `#ctl00_MainContent_subGBS_lblTeacherName`,
 *   a `mailto:` link, the course select `ctl00$MainContent$subGBS$dlGN`, and
 *   `table.GradebookDetailsTable` whose `tr.TableView` rows hold one assignment
 *   each: #, Description, Category, Score, # Correct, %, Comment, Date Completed,
 *   Due Date, Grading Complete, Documents.
 * - Classes.aspx: `#gridCourses` rows: Course, Pd, Trm, Cal, Teacher, Sec, Room,
 *   More Info, Today, Email, Website (each cell prefixed with its label).
 * - Attendance.aspx: `#tblNewFlex` grid: a header row per schedule block
 *   (`tr.InlineHeaderTR`, period/class/teacher per column) and one row per day
 *   (`.gridDate`, `.AllDayCodeReadOnly`, then one cell per period).
 */

import type { IAeriesSelectorsV1 } from '../../selectors/aeriesV1';

// ---------------------------------------------------------------------------
// Raw extract types
// ---------------------------------------------------------------------------

export type { IAeriesSelectorsV1 };

export interface IAeriesCourseExtract {
  readonly period: string;
  readonly name: string;
  readonly term: string;
  readonly teacher: string;
  readonly teacherEmail: string;
  readonly room: string;
  readonly currentGrade: number | null;
  readonly currentPercent: number | null;
  readonly missingCount: number;
  readonly assignments: IAeriesAssignmentExtract[];
  readonly tutorialWindow?: string;
  /** Relative link to this class's Gradebook Details page (from the dashboard card). */
  readonly gradebookHref?: string;
  /** Aeries course id, e.g. `6033A` (from Classes.aspx). */
  readonly courseId?: string;
  /** Section number, e.g. `1803` (from Classes.aspx). */
  readonly section?: string;
  /** Dashboard "Last Updated" text, e.g. `Nov 04`. */
  readonly lastUpdated?: string;
  /** Term start/end (YYYY-MM-DD) from the Gradebook Details course option, e.g. `Quarter 2 10/19/2026 - 12/18/2026`. */
  readonly termStart?: string;
  readonly termEnd?: string;
}

export interface IAeriesAssignmentExtract {
  readonly number: string;
  readonly title: string;
  readonly category: string;
  readonly scoreEarned: number | null;
  readonly scorePossible: number | null;
  readonly percentCorrect: number | null;
  readonly dateAssigned: string;
  readonly dateDue: string;
  readonly dateCompleted: string;
  readonly gradingComplete: boolean;
  readonly isMissing: boolean;
  readonly comment: string;
}

export interface IAeriesStudentExtract {
  readonly name: string;
  readonly studentId: string;
  readonly grade: string;
  readonly school: string;
  readonly courses: IAeriesCourseExtract[];
  readonly attendance: IAeriesAttendanceExtract[];
}

export interface IAeriesAttendanceExtract {
  readonly date: string;
  readonly period: string;
  readonly status: string;
  readonly reason: string;
  readonly course: string;
}

export interface IAeriesFullExtract {
  readonly students: IAeriesStudentExtract[];
  readonly timestamp: string;
}

/** One entry of the dashboard student switcher. */
export interface IAeriesStudentListItem {
  readonly name: string;
  readonly grade: string;
  readonly school: string;
  /** `ChangeStudent.aspx?...` link, empty for the student currently shown. */
  readonly switchHref: string;
  readonly isCurrent: boolean;
}

/** One row of Classes.aspx (the schedule grid). */
export interface IAeriesScheduleRow {
  readonly courseId: string;
  readonly name: string;
  readonly period: string;
  readonly term: string;
  readonly teacher: string;
  readonly teacherEmail: string;
  readonly section: string;
  readonly room: string;
}

// ---------------------------------------------------------------------------
// Extractor functions
// ---------------------------------------------------------------------------

/**
 * Lists every student on the account from the dashboard: the one shown in the
 * header plus each entry of the student switcher. Falls back to the
 * `.StudentCard` widgets when the switcher is absent.
 */
export function extractAeriesStudentList(selectors: IAeriesSelectorsV1): IAeriesStudentListItem[] {
  const results: IAeriesStudentListItem[] = [];
  const clean = (s: string | null | undefined): string => (s ?? '').replace(/\s+/g, ' ').trim();
  const parseLabel = (text: string): { name: string; grade: string; school: string } => {
    const m = text.match(/^(\S+\s+\S+)\s+(.+?)\s*-\s*Grade:?\s*(\d+)\s*$/);
    if (m) return { name: m[1] ?? '', grade: m[3] ?? '', school: m[2] ?? '' };
    return { name: text, grade: '', school: '' };
  };
  const leftSide = (el: Element): { name: string; grade: string; school: string } => {
    const nameEl = el.querySelector(selectors.studentList_name_heading);
    const name = clean(nameEl?.textContent);
    const all = clean(el.textContent);
    const gradeMatch = all.match(/Grade:?\s*(\d+)/);
    if (name) {
      let rest = all.startsWith(name) ? all.slice(name.length) : all.replace(name, '');
      rest = rest.replace(/\s*-?\s*Grade:?\s*\d+.*$/, '');
      return { name, grade: gradeMatch?.[1] ?? '', school: clean(rest) };
    }
    return parseLabel(all);
  };

  const current = document.querySelector(selectors.studentNameDropDown);
  if (current) {
    const info = leftSide(current);
    if (info.name) results.push({ ...info, switchHref: '', isCurrent: true });
  }
  const options = document.querySelectorAll(selectors.studentNameDropDownMenu_options);
  for (const opt of options) {
    if (opt.classList.contains('LinkNewStudent')) continue;
    const href = opt.getAttribute('href') ?? '';
    if (!/ChangeStudent/i.test(href)) continue;
    const info = leftSide(opt);
    if (!info.name) continue;
    if (results.some((r) => r.name === info.name)) continue;
    results.push({ ...info, switchHref: href, isCurrent: false });
  }
  if (results.length === 0) {
    for (const card of document.querySelectorAll(selectors.studentList_card)) {
      const name = clean(card.querySelector(selectors.studentList_card_name)?.textContent);
      const text = clean(card.textContent);
      const grade = text.match(/Grade:?\s*(\d+)/)?.[1] ?? '';
      const school = clean(text.split(/Grade:?\s*\d+/)[1]);
      const link = card.querySelector(selectors.studentList_change_student_link)?.getAttribute('href') ?? '';
      if (name) results.push({ name, grade, school, switchHref: link, isCurrent: false });
    }
  }
  return results;
}

/**
 * Reads the class cards on the dashboard: one per class with the current
 * gradebook mark, room, teacher, missing count and the link to its Gradebook
 * Details page. Period is not on the card; the recipe fills it from the
 * schedule (Classes.aspx) or from the Gradebook Details course option.
 */
export function extractAeriesDashboardCourses(selectors: IAeriesSelectorsV1): Array<{
  period: string;
  name: string;
  term: string;
  teacher: string;
  teacherEmail: string;
  room: string;
  currentGrade: number | null;
  currentPercent: number | null;
  missingCount: number;
  assignments: never[];
  gradebookHref: string;
  lastUpdated: string;
}> {
  const clean = (s: string | null | undefined): string => (s ?? '').replace(/\s+/g, ' ').trim();
  const out: Array<{
    period: string;
    name: string;
    term: string;
    teacher: string;
    teacherEmail: string;
    room: string;
    currentGrade: number | null;
    currentPercent: number | null;
    missingCount: number;
    assignments: never[];
    gradebookHref: string;
    lastUpdated: string;
  }> = [];
  const cards = document.querySelectorAll(selectors.dashboard_class_cards);
  for (const card of cards) {
    const titleEl = card.querySelector(selectors.dashboard_card_title_link);
    const fullTitle = clean(titleEl?.textContent);
    if (!fullTitle) continue;
    const tm = fullTitle.match(/^(.*?)\s*-\s*((?:Quarter|Semester|Trimester|Term)\s*\d+|[^-]+)$/);
    const name = tm ? clean(tm[1]) : fullTitle;
    const term = tm ? clean(tm[2]) : '';
    let teacher = '';
    for (const node of card.childNodes) {
      if (node.nodeType === 3) {
        const t = clean(node.textContent);
        if (t) {
          teacher = t;
          break;
        }
      }
    }
    const room = clean(card.querySelector(selectors.dashboard_card_room)?.textContent);
    const gradeText = clean(card.querySelector(selectors.dashboard_card_grade)?.textContent);
    const gm = gradeText.match(/^(\d+(?:\.\d+)?)\s*\((\d+(?:\.\d+)?)%\)/);
    const pm = gradeText.match(/(\d+(?:\.\d+)?)%/);
    const wholeMark = gradeText.match(/^(\d+(?:\.\d+)?)/);
    const missingText = clean(
      card.querySelector(selectors.dashboard_card_missing_footer)?.textContent
    );
    const missingFallback = clean(card.querySelector(selectors.dashboard_card_footer)?.textContent).match(
      /Missing Assignments\s*(\d+)/
    );
    const href = titleEl?.getAttribute('href') ?? '';
    out.push({
      period: '',
      name,
      term,
      teacher,
      teacherEmail: '',
      room,
      currentGrade: gm ? parseFloat(gm[1]!) : wholeMark ? parseFloat(wholeMark[1]!) : null,
      currentPercent: gm ? parseFloat(gm[2]!) : pm ? parseFloat(pm[1]!) : null,
      missingCount: parseInt(missingText || missingFallback?.[1] || '0', 10) || 0,
      assignments: [],
      gradebookHref: href,
      lastUpdated: clean(card.querySelector(selectors.dashboard_card_last_updated)?.textContent),
    });
  }
  return out;
}

/** Reads the schedule grid on Classes.aspx. */
export function extractAeriesSchedule(selectors: IAeriesSelectorsV1): IAeriesScheduleRow[] {
  const clean = (s: string | null | undefined): string => (s ?? '').replace(/\s+/g, ' ').trim();
  const strip = (text: string, label: string): string =>
    clean(text).replace(new RegExp(`^${label}\\s*`, 'i'), '');
  const out: IAeriesScheduleRow[] = [];
  const table = document.querySelector(selectors.classes_schedule_table);
  if (!table) return out;
  let labels: string[] = [];
  const header = table.querySelector(selectors.classes_subheader_row);
  if (header) labels = Array.from(header.children).map((c) => clean(c.textContent));
  const idx = (name: string, fallback: number): number => {
    const i = labels.findIndex((l) => l.toLowerCase() === name.toLowerCase());
    return i >= 0 ? i : fallback;
  };
  const iCourse = idx('Course', 0);
  const iPd = idx('Pd', 1);
  const iTrm = idx('Trm', 2);
  const iTeacher = idx('Teacher', 4);
  const iSec = idx('Sec', 5);
  const iRoom = idx('Room', 6);
  const iEmail = idx('Email', 9);
  for (const row of table.querySelectorAll(selectors.classes_tbody_rows)) {
    if (row.classList.contains('SubHeaderRow')) continue;
    const cells = Array.from(row.children);
    if (cells.length < 7) continue;
    const course = strip(cells[iCourse]?.textContent ?? '', 'Course');
    const cm = course.match(/^([A-Za-z0-9]+)\s*-\s*(.+)$/);
    if (!cm) continue;
    const emailCell = cells[iEmail];
    const email =
      emailCell
        ?.querySelector(selectors.classes_email_link)
        ?.getAttribute('href')
        ?.replace(/^mailto:/i, '') ?? strip(emailCell?.textContent ?? '', 'Email');
    out.push({
      courseId: cm[1] ?? '',
      name: clean(cm[2]),
      period: strip(cells[iPd]?.textContent ?? '', 'Pd'),
      term: strip(cells[iTrm]?.textContent ?? '', 'Trm'),
      teacher: strip(cells[iTeacher]?.textContent ?? '', 'Teacher'),
      teacherEmail: email.includes('@') ? email : '',
      section: strip(cells[iSec]?.textContent ?? '', 'Sec'),
      room: strip(cells[iRoom]?.textContent ?? '', 'Room'),
    });
  }
  return out;
}

/** Extracts the course dropdown options from GradebookDetails. */
export function extractAeriesCourseDropdownOptions(selectors: IAeriesSelectorsV1): Array<{
  value: string;
  text: string;
  selected: boolean;
}> {
  const select = document.querySelector(selectors.gradebook_course_dropdown) as HTMLSelectElement | null;
  if (!select) return [];
  return Array.from(select.options).map((o: HTMLOptionElement) => ({
    value: o.value,
    text: o.text.replace(/\s+/g, ' ').trim(),
    selected: o.selected,
  }));
}

/** Extracts teacher name and email from the current GradebookDetails page. */
export function extractAeriesTeacher(
  selectors: IAeriesSelectorsV1
): { name: string; email: string } {
  const clean = (s: string | null | undefined): string => (s ?? '').replace(/\s+/g, ' ').trim();
  const scope = document.querySelector(selectors.gradebook_scope_table) ?? document.body;
  const name = clean(document.querySelector(selectors.gradebook_teacher_name)?.textContent);
  const link = scope.querySelector(selectors.gradebook_mailto) as HTMLAnchorElement | null;
  const email = link ? clean(link.getAttribute('href')?.replace(/^mailto:/i, '') ?? '') : '';
  return { name, email };
}

/** Kept for callers that only want the address. */
export function extractAeriesTeacherEmail(selectors: IAeriesSelectorsV1): string {
  const scope = document.querySelector(selectors.gradebook_scope_table) ?? document.body;
  const link = scope.querySelector(selectors.gradebook_mailto);
  if (link) return (link.getAttribute('href') ?? '').replace(/^mailto:/i, '').trim();
  return '';
}

/** Extracts assignment rows from the current GradebookDetails page (table view rows). */
export function extractAeriesAssignments(selectors: IAeriesSelectorsV1): IAeriesAssignmentExtract[] {
  const clean = (s: string | null | undefined): string => (s ?? '').replace(/\s+/g, ' ').trim();
  const num = (s: string): number | null => {
    const m = s.replace(/,/g, '').match(/-?\d+(?:\.\d+)?/);
    return m ? parseFloat(m[0]) : null;
  };
  const results: IAeriesAssignmentExtract[] = [];
  const table = document.querySelector(selectors.gradebook_assignments_table);
  if (!table) return results;
  const headerRow = table.querySelector(selectors.tag_tr);
  const labels = headerRow
    ? Array.from(headerRow.children).map((c) => clean(c.textContent).toLowerCase())
    : [];
  const col = (name: string, fallback: number): number => {
    const i = labels.indexOf(name.toLowerCase());
    return i >= 0 ? i : fallback;
  };
  const iNum = col('#', 0);
  const iDesc = col('description', 1);
  const iCat = col('category', 2);
  const iScore = col('score', 3);
  const iPct = col('%', 5);
  const iComment = col('comment', 6);
  const iCompleted = col('date completed', 7);
  const iDue = col('due date', 8);
  const iGC = col('grading complete', 9);

  const rows = Array.from(table.querySelectorAll(selectors.tag_tr)).filter(
    (r) =>
      r !== headerRow &&
      (r.classList.contains(selectors.gradebook_row_class_tableView) ||
        r.classList.contains(selectors.gradebook_row_class_assignment_info))
  );
  for (const row of rows) {
    const cells = Array.from(row.children);
    if (cells.length < 5) continue;
    const first = clean(cells[iNum]?.textContent);
    const numMatch = first.match(/^(\d+)/);
    const assigned = first.match(/Date Assigned:\s*(\d{1,2}\/\d{1,2}\/\d{4})/i)?.[1] ?? '';
    const title = clean(cells[iDesc]?.textContent);
    if (!title && !numMatch) continue;
    const scoreText = clean(cells[iScore]?.textContent);
    const sm = scoreText.match(/(-?\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)/);
    const pctText = clean(cells[iPct]?.textContent);
    const rowText = clean(row.textContent);
    const rowHtml = row.innerHTML;
    const isMissing =
      /\bmissing\b/i.test(scoreText) ||
      /\bMSG\b/.test(scoreText) ||
      /MissingAssignment|missing-assignment|\bmissing\b/i.test(row.className) ||
      /class="[^"]*[Mm]issing[^"]*"/.test(rowHtml) ||
      (/\bMissing\b/.test(rowText) && !sm);
    results.push({
      number: numMatch?.[1] ?? '',
      title,
      category: clean(cells[iCat]?.textContent),
      scoreEarned: sm ? parseFloat(sm[1]!) : null,
      scorePossible: sm ? parseFloat(sm[2]!) : null,
      percentCorrect: num(pctText),
      dateAssigned: assigned,
      dateDue: clean(cells[iDue]?.textContent).match(/\d{1,2}\/\d{1,2}\/\d{4}/)?.[0] ?? '',
      dateCompleted:
        clean(cells[iCompleted]?.textContent).match(/\d{1,2}\/\d{1,2}\/\d{4}/)?.[0] ?? '',
      gradingComplete: /^(yes|true)$/i.test(clean(cells[iGC]?.textContent)),
      isMissing,
      comment: clean(cells[iComment]?.textContent),
    });
  }
  return results;
}

/**
 * Extracts attendance from Attendance.aspx: one record per day and period that
 * carries a code, plus one per all-day code. Days with nothing marked are
 * skipped.
 */
export function extractAeriesAttendance(selectors: IAeriesSelectorsV1): IAeriesAttendanceExtract[] {
  const clean = (s: string | null | undefined): string => (s ?? '').replace(/\s+/g, ' ').trim();
  const results: IAeriesAttendanceExtract[] = [];
  const grid = document.querySelector(selectors.attendance_grid);
  if (!grid) return results;
  let columns: Array<{ period: string; course: string }> = [];
  for (const row of grid.querySelectorAll(selectors.attendance_rows)) {
    if (row.classList.contains(selectors.attendance_inline_header)) {
      columns = Array.from(row.children).map((td) => ({
        period: clean(td.querySelector(selectors.attendance_header_period)?.textContent),
        course: clean(td.querySelector(selectors.attendance_header_course)?.textContent).replace(/^\(\d+\)\s*/, ''),
      }));
      continue;
    }
    const date = clean(row.querySelector(selectors.attendance_grid_date)?.textContent);
    if (!/\d{1,2}\/\d{1,2}\/\d{4}/.test(date)) continue;
    const cells = Array.from(row.children);
    const allDay = clean(
      cells[1]?.querySelector(selectors.attendance_all_day)?.textContent ?? cells[1]?.textContent
    );
    if (allDay && allDay !== '-') {
      results.push({ date, period: '', status: allDay, reason: '', course: '' });
    }
    for (let i = 2; i < cells.length; i++) {
      const cell = cells[i]!;
      if (cell.querySelector(selectors.attendance_no_class)) continue;
      const code = clean(cell.textContent);
      if (!code || code === '-') continue;
      const meta = columns[i] ?? { period: String(i - 1), course: '' };
      const title =
        cell.getAttribute('title') ?? cell.querySelector(selectors.attendance_title_attr)?.getAttribute('title') ?? '';
      results.push({
        date,
        period: meta.period,
        status: code,
        reason: clean(title),
        course: meta.course,
      });
    }
  }
  return results;
}

/** Extracts student id / name / grade / school from the banner shown on inner pages. */
export function extractAeriesStudentInfo(selectors: IAeriesSelectorsV1): {
  studentId: string;
  name: string;
  grade: string;
  school: string;
} {
  const clean = (s: string | null | undefined): string => (s ?? '').replace(/\s+/g, ' ').trim();
  const idEl = document.querySelector(selectors.student_info_id);
  let studentId = clean(idEl?.textContent).match(/\d{4,}/)?.[0] ?? '';
  if (!studentId) {
    const hidden = document.querySelector(selectors.student_info_hidden_id) as HTMLInputElement | null;
    if (hidden?.value && /^\d{4,}$/.test(hidden.value)) studentId = hidden.value;
  }
  if (!studentId) {
    const m = (document.body.textContent ?? '').match(/Student ID:?\s*(\d{4,})/i);
    studentId = m?.[1] ?? '';
  }
  let name = clean(document.querySelector(selectors.student_info_full_name)?.textContent);
  let grade = clean(document.querySelector(selectors.student_info_grade)?.textContent).match(/\d+/)?.[0] ?? '';
  let school = '';
  const header = document.querySelector(selectors.studentNameDropDown);
  if (header) {
    const text = clean(header.textContent);
    const headName = clean(header.querySelector(selectors.studentList_name_heading)?.textContent);
    const gm = text.match(/Grade:?\s*(\d+)/);
    if (!grade && gm) grade = gm[1] ?? '';
    if (headName) {
      if (!name) name = headName;
      const rest = text.startsWith(headName)
        ? text.slice(headName.length)
        : text.replace(headName, '');
      school = clean(rest.replace(/\s*-?\s*Grade:?\s*\d+.*$/, ''));
    } else {
      const m = text.match(/^(\S+\s+\S+)\s+(.+?)\s*-\s*Grade:?\s*(\d+)/);
      if (!name) name = m ? clean(m[1]) : text;
      if (m) school = clean(m[2]);
    }
  }
  if (!name) {
    const m = (document.body.textContent ?? '').match(
      /Welcome to the Aeries Portal for\s+([^\n]+)/
    );
    name = clean(m?.[1]);
  }
  return { studentId, name, grade, school };
}

/** Clicks the student switcher entry whose text contains `name`. */
export function switchAeriesStudentByName(selectors: IAeriesSelectorsV1, name: string): boolean {
  const toggle = document.querySelector(selectors.studentNameDropDown) as HTMLElement | null;
  if (toggle) toggle.click();
  const links = Array.from(document.querySelectorAll(selectors.student_switch_links));
  for (const link of links) {
    if ((link.textContent ?? '').replace(/\s+/g, ' ').includes(name)) {
      (link as HTMLAnchorElement).click();
      return true;
    }
  }
  return false;
}

/** Choose a course in the Gradebook Details dropdown and fire its change event (postback). */
export function selectAeriesCourseOption(selectors: IAeriesSelectorsV1, value: string): void {
  const dropdown = document.querySelector(selectors.gradebook_course_dropdown) as HTMLSelectElement | null;
  if (dropdown) {
    dropdown.value = value;
    dropdown.dispatchEvent(new Event('change', { bubbles: true }));
  }
}

/** True once the dashboard class cards have rendered (they load after the page). */
export function isAeriesDashboardReady(selectors: IAeriesSelectorsV1): boolean {
  return document.querySelector(selectors.dashboard_ready) !== null;
}

/** True once the attendance grid has rendered its day rows (it loads after the page). */
export function isAeriesAttendanceReady(selectors: IAeriesSelectorsV1): boolean {
  return document.querySelector(selectors.attendance_ready) !== null;
}
