/**
 * Skyward browser-context extractor functions.
 *
 * These functions run inside the browser context. They must be self-contained
 * — no imports, no closure over outer scope.
 */

import type { ISkywardSelectorsV1 } from '../../selectors/skywardV1';

// ---------------------------------------------------------------------------
// Raw extract types
// ---------------------------------------------------------------------------

export type { ISkywardSelectorsV1 };

export interface ISkywardCourseExtract {
  readonly name: string;
  readonly period: string;
  readonly time: string;
  readonly teacher: string;
  readonly currentGrade: string;
  readonly grades: Record<string, string>;
  readonly _cni?: string;
  readonly tutorialWindow?: string;
}

export interface ISkywardAssignmentExtract {
  readonly title: string;
  readonly course: string;
  readonly period: string;
  readonly category: string;
  readonly dueDate: string;
  readonly pointsEarned: string;
  readonly pointsPossible: string;
  readonly grade: string;
  readonly status: 'graded' | 'missing' | 'late' | 'unknown';
}

export interface ISkywardMissingAssignment {
  readonly dueDate: string;
  readonly title: string;
  readonly course: string;
  readonly period: string;
  readonly teacher: string;
}

export interface ISkywardAttendanceExtract {
  readonly date: string;
  readonly status: string;
  readonly period: string;
  readonly course: string;
  readonly reason: string;
}

export interface ISkywardScheduleEntry {
  readonly period: string;
  readonly time: string;
  readonly course: string;
  readonly teacher: string;
  readonly room: string;
  readonly tutorialWindow?: string;
}

export interface ISkywardFullExtract {
  readonly student: string;
  readonly school: string;
  readonly courses: ISkywardCourseExtract[];
  readonly missingAssignments: ISkywardMissingAssignment[];
  readonly assignments: ISkywardAssignmentExtract[];
  readonly attendance: ISkywardAttendanceExtract[];
  readonly schedule: ISkywardScheduleEntry[];
  readonly timestamp: string;
}

// ---------------------------------------------------------------------------
// Extractor functions
// ---------------------------------------------------------------------------

/** Extracts the student name from the Skyward header area. */
export function extractSkywardStudentName(selectors: ISkywardSelectorsV1): string {
  const el = document.querySelector(selectors.student_name_primary);
  if (el) return el.textContent?.trim() ?? '';
  const header = document.querySelector(selectors.student_name_header_fallback);
  if (header) {
    const headerText = header.textContent ?? '';
    const nameMatch = headerText.match(/([A-Z][a-z]+\s+[A-Z]\.?\s*[A-Z][a-z]+)/);
    if (nameMatch) return nameMatch[1]!;
  }
  const topNav = document.querySelectorAll(selectors.student_name_topnav);
  for (const node of topNav) {
    const text = node.textContent?.trim() ?? '';
    if (text.match(/^[A-Z][a-z]+ [A-Z][a-z]+$/) && text.length < 40) return text;
  }
  return 'Unknown';
}

/** Extracts the school name from the Skyward page. */
export function extractSkywardSchoolName(selectors: ISkywardSelectorsV1): string {
  const el = document.querySelector(selectors.school_name);
  if (el) return el.textContent?.trim() ?? '';
  const allText = document.body?.textContent ?? '';
  const schoolMatch = allText.match(
    /(LAKE DALLAS HIGH SCHOOL|[A-Z ]{10,}(?:HIGH|MIDDLE|ELEMENTARY) SCHOOL)/
  );
  return schoolMatch?.[1] ?? 'Unknown School';
}

export interface ISkywardCourseAssignmentsOpts {
  readonly selectors: ISkywardSelectorsV1;
  readonly courseName: string;
  readonly coursePeriod: string;
}

/** Extracts assignments from the Skyward gradeInfoDialog for a specific course. */
export function extractSkywardCourseAssignments(opts: ISkywardCourseAssignmentsOpts): Array<{
  title: string;
  course: string;
  period: string;
  category: string;
  dueDate: string;
  pointsEarned: string;
  pointsPossible: string;
  grade: string;
  status: 'graded' | 'missing' | 'late' | 'unknown';
}> {
  const { selectors, courseName, coursePeriod } = opts;
  const fingerprint = (d: Element): string => {
    const text = (d.textContent ?? '').replace(/\s+/g, ' ').trim();
    return `${text.length}:${text.slice(0, 300)}`;
  };
  const dialogs = Array.from(document.querySelectorAll(selectors.grade_info_dialog));
  const dialog = dialogs.find((d) => d.getAttribute('data-slc-seen') !== fingerprint(d)) ?? null;
  if (!dialog) return [];

  const results: Array<{
    title: string;
    course: string;
    period: string;
    category: string;
    dueDate: string;
    pointsEarned: string;
    pointsPossible: string;
    grade: string;
    status: 'graded' | 'missing' | 'late' | 'unknown';
  }> = [];

  const tables = dialog.querySelectorAll(selectors.table);
  let assignTable: Element | null = null;
  for (const t of tables) {
    const headerRow = t.querySelector(selectors.tr);
    const headerText = headerRow?.textContent ?? '';
    if (
      headerText.includes('Assignment') &&
      (headerText.includes('Due') || headerText.includes('Score'))
    ) {
      assignTable = t;
      break;
    }
  }
  if (!assignTable) return results;

  let currentCategory = '';

  const rows = assignTable.querySelectorAll(selectors.tr);
  for (const row of rows) {
    const text = row.textContent?.trim().replace(/\s+/g, ' ') ?? '';
    if (text.includes('weighted at')) {
      const catMatch = text.match(/^(\S+)\s*weighted at\s*([\d.]+)%/);
      if (catMatch) currentCategory = catMatch[1]!;
      continue;
    }

    const cells = row.querySelectorAll(selectors.td);
    if (cells.length >= 5) {
      const due = cells[0]?.textContent?.trim() ?? '';
      const title = cells[1]?.textContent?.trim() ?? '';
      const grade = cells[2]?.textContent?.trim() ?? '';
      const pointsRaw = cells[4]?.textContent?.trim() ?? '';
      const missingCell = cells[5]?.textContent?.trim() ?? '';
      const hasMissingImg = cells[5]?.querySelector(selectors.missing_cell_img) !== null;

      if (!title || title === 'Assignment' || title.includes('weighted at')) continue;

      const ptsMatch = pointsRaw.match(/([\d.]+)\s*out of\s*([\d.]+)/);
      const pointsEarned = ptsMatch ? ptsMatch[1]! : '';
      const pointsPossible = ptsMatch ? ptsMatch[2]! : '';
      const isMissing = missingCell === 'M' || hasMissingImg;
      const status: 'graded' | 'missing' | 'late' | 'unknown' = isMissing
        ? 'missing'
        : grade && /^\d/.test(grade)
          ? 'graded'
          : 'unknown';

      results.push({
        title,
        course: courseName,
        period: coursePeriod,
        category: currentCategory,
        dueDate: due,
        pointsEarned,
        pointsPossible,
        grade,
        status,
      });
    }
  }
  return results;
}

/** Extracts attendance records from the Skyward attendance page. */
export function extractSkywardAttendance(selectors: ISkywardSelectorsV1): Array<{
  date: string;
  status: string;
  period: string;
  course: string;
  reason: string;
}> {
  const results: Array<{
    date: string;
    status: string;
    period: string;
    course: string;
    reason: string;
  }> = [];
  const tables = document.querySelectorAll(selectors.table);
  for (const table of tables) {
    const headerText = table.querySelector(selectors.tr)?.textContent ?? '';
    if (!headerText.includes('Attendance') || !headerText.includes('Period')) continue;
    const trs = table.querySelectorAll(selectors.tr);
    for (let i = 1; i < trs.length; i++) {
      const tds = trs[i]!.querySelectorAll(selectors.td);
      if (tds.length >= 3) {
        const texts = Array.from(tds).map((td) => (td as Element).textContent?.trim() ?? '');
        const dateText = texts[0] ?? '';
        if (dateText && /[A-Z][a-z]{2}\s/.test(dateText)) {
          results.push({
            date: dateText,
            status: texts[1] ?? '',
            period: texts[2] ?? '',
            course: texts[3] ?? '',
            reason: '',
          });
        }
      }
    }
  }
  return results;
}

/** Extracts schedule entries from the Skyward schedule page. */
export function extractSkywardSchedule(selectors: ISkywardSelectorsV1): Array<{
  period: string;
  time: string;
  course: string;
  teacher: string;
  room: string;
}> {
  const results: Array<{
    period: string;
    time: string;
    course: string;
    teacher: string;
    room: string;
  }> = [];
  const tables = document.querySelectorAll(selectors.table);
  for (const table of tables) {
    const headerRow = table.querySelector(selectors.tr);
    const headerText = headerRow?.textContent ?? '';
    if (!headerText.includes('Term')) continue;

    const rows = table.querySelectorAll(selectors.tr);
    for (let i = 1; i < rows.length; i++) {
      const tds = rows[i]!.querySelectorAll(selectors.td_th);
      if (tds.length < 2) continue;

      const periodCell = tds[0]?.textContent?.trim() ?? '';
      const periodMatch = periodCell.match(/Period\s*(\d+[A-Z]?)/);
      const timeMatch = periodCell.match(/\(([^)]+)\)/);
      if (!periodMatch) continue;

      let bestCell = tds[tds.length - 2];
      for (let j = 1; j < tds.length; j++) {
        const style = tds[j]?.getAttribute('style') ?? '';
        const cls = tds[j]?.getAttribute('class') ?? '';
        if (style.includes('background') || cls.includes('highlight') || cls.includes('cur')) {
          bestCell = tds[j];
          break;
        }
      }

      const cellText = bestCell?.textContent?.trim() ?? '';
      if (!cellText) continue;

      const lines = cellText
        .split('\n')
        .map((l: string) => l.trim())
        .filter((l: string) => l);
      const course = lines[0] ?? '';
      const teacher = lines[1] ?? '';
      const roomMatch = cellText.match(/Room\s*(\w+)/);
      results.push({
        period: periodMatch[1] ?? '',
        time: timeMatch?.[1] ?? '',
        course,
        teacher,
        room: roomMatch?.[1] ?? '',
      });
    }
  }
  return results;
}

function skywardNormalizeNavLabel(s: string | null | undefined): string {
  return (s ?? '').replace(/\s+/g, ' ').trim();
}

/**
 * Clicks the first nav link whose visible text matches `text` after normalizing
 * whitespace (nested spans / line breaks on real portals).
 */
export function clickSkywardNavLink(selectors: ISkywardSelectorsV1, text: string): void {
  const want = skywardNormalizeNavLabel(text).toLowerCase();
  const links = Array.from(document.querySelectorAll(selectors.nav_links));
  for (const link of links) {
    const got = skywardNormalizeNavLabel(link.textContent).toLowerCase();
    if (got === want || got.includes(want)) {
      (link as HTMLAnchorElement).click();
      return;
    }
  }
}

/**
 * Click the grade cell (a#showGradeInfo) of one course, choosing the first
 * period literal in `periods` that the course has a cell for, else the
 * course's last cell. Skyward then loads #gradeInfoDialog with the course's
 * assignments. Returns the literal clicked, or null when the course has no
 * grade cell.
 */
export interface IOpenSkywardGradeInfoOpts {
  readonly selectors: ISkywardSelectorsV1;
  readonly cni: string;
  readonly periods: readonly string[];
}

export function openSkywardGradeInfo(opts: IOpenSkywardGradeInfoOpts): string | null {
  const { selectors, cni, periods } = opts;
  const cells = Array.from(document.querySelectorAll(selectors.grade_cell_anchor)).filter(
    (a) => a.getAttribute('data-cni') === cni
  ) as HTMLAnchorElement[];
  if (cells.length === 0) return null;
  let target: HTMLAnchorElement | undefined;
  for (const period of periods) {
    target = cells.find((a) => a.getAttribute('data-lit') === period);
    if (target) break;
  }
  target = target ?? cells[cells.length - 1]!;
  target.click();
  return target.getAttribute('data-lit') ?? '';
}

/**
 * Skyward reuses ONE #gradeInfoDialog element for every course and refills it,
 * so "already read" cannot be a marker on the element. closeSkywardDialogs
 * records a fingerprint of the content it has handed out (data-slc-seen); the
 * dialog is ready again once it shows an assignment table whose fingerprint
 * differs from the recorded one.
 */
export function isSkywardGradeInfoReady(selectors: ISkywardSelectorsV1): boolean {
  const fingerprint = (d: Element): string => {
    const text = (d.textContent ?? '').replace(/\s+/g, ' ').trim();
    return `${text.length}:${text.slice(0, 300)}`;
  };
  const dialogs = Array.from(document.querySelectorAll(selectors.grade_info_dialog));
  return dialogs.some((d) => {
    const hasTable = Array.from(d.querySelectorAll(selectors.table)).some((t) => {
      const header = t.querySelector(selectors.tr)?.textContent ?? '';
      return header.includes('Assignment') && (header.includes('Due') || header.includes('Score'));
    });
    if (!hasTable) return false;
    return d.getAttribute('data-slc-seen') !== fingerprint(d);
  });
}

/**
 * Close Skyward's overlay dialogs (.sf_DialogWrap close buttons, else Escape)
 * and mark every #gradeInfoDialog as read, so a later wait only matches the
 * next course's dialog. Returns how many close buttons were clicked.
 */
export function closeSkywardDialogs(selectors: ISkywardSelectorsV1): number {
  let closed = 0;
  for (const wrap of Array.from(document.querySelectorAll(selectors.dialog_wrap))) {
    const style = window.getComputedStyle(wrap);
    if (style.display === 'none' || style.visibility === 'hidden') continue;
    const button = wrap.querySelector(selectors.dialog_close);
    if (button) {
      (button as HTMLElement).click();
      closed++;
    }
  }
  if (closed === 0) {
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true })
    );
  }
  for (const dialog of Array.from(document.querySelectorAll(selectors.grade_info_dialog))) {
    const text = (dialog.textContent ?? '').replace(/\s+/g, ' ').trim();
    dialog.setAttribute('data-slc-seen', `${text.length}:${text.slice(0, 300)}`);
  }
  return closed;
}
