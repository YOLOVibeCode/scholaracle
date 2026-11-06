/**
 * Aeries Parent Portal scrape recipe.
 *
 * Orchestrates navigation and extraction using IPageDriver.
 * Auth (login) is NOT here — it is runtime-specific.
 *
 * Flow per student (see aeries-extractors.ts for page anatomy):
 *   Dashboard.aspx      -> student list, class cards (mark, missing, gradebook link)
 *   Classes.aspx        -> period, course id, section, teacher email per class
 *   GradebookDetails    -> teacher, assignments (one page per class, via the card link)
 *   Attendance.aspx     -> day and period codes
 * Then switch to the next student through the header switcher and repeat.
 *
 * Page loads wait for `load`, never `networkidle`: the portal keeps analytics
 * connections open, so network-idle never arrives and the old recipe timed out.
 */

import type { IPageDriver } from '../driver/IPageDriver';
import type {
  IAeriesFullExtract,
  IAeriesStudentExtract,
  IAeriesCourseExtract,
  IAeriesScheduleRow,
  IAeriesStudentListItem,
} from '../extractors/aeries/aeries-extractors';
import {
  extractAeriesStudentList,
  extractAeriesDashboardCourses,
  extractAeriesSchedule,
  extractAeriesCourseDropdownOptions,
  extractAeriesTeacher,
  extractAeriesAssignments,
  extractAeriesAttendance,
  extractAeriesStudentInfo,
  isAeriesDashboardReady,
  isAeriesAttendanceReady,
} from '../extractors/aeries/aeries-extractors';

const PAGE_TIMEOUT_MS = 45_000;
const DASHBOARD_READY_MS = 30_000;
const ATTENDANCE_READY_MS = 20_000;

/**
 * Run the Aeries scrape recipe.
 *
 * @param driver - Runtime-specific page driver
 * @param baseUrl - The Aeries portal URL, e.g. `https://district.aeries.net/student/`
 * @returns IAeriesFullExtract ready for transformation
 */
export async function runAeriesRecipe(
  driver: IPageDriver,
  baseUrl: string
): Promise<IAeriesFullExtract> {
  const portalBase = aeriesPortalBase(baseUrl);
  const studentRoot = `${portalBase}/student/`;
  const dashboardUrl = `${studentRoot}Dashboard.aspx`;

  await openDashboard(driver, dashboardUrl);
  const studentList = await driver.evaluate(extractAeriesStudentList);

  const allStudents: IAeriesStudentExtract[] = [];
  const current = studentList.find((s) => s.isCurrent) ?? studentList[0];
  allStudents.push(await scrapeCurrentStudent(driver, studentRoot, current));

  for (const other of studentList) {
    if (other.isCurrent || !other.switchHref) continue;
    if (allStudents.some((s) => s.name === other.name)) continue;
    try {
      await driver.goto(resolveAeriesUrl(studentRoot, other.switchHref), {
        waitUntil: 'load',
        timeout: PAGE_TIMEOUT_MS,
      });
      await openDashboard(driver, dashboardUrl);
      allStudents.push(await scrapeCurrentStudent(driver, studentRoot, other));
    } catch {
      // Keep what we have; the next student is independent.
    }
  }

  return { students: allStudents, timestamp: new Date().toISOString() };
}

/** `https://x.aeries.net/student/` or `https://x.aeries.net/student/LoginParent.aspx` -> `https://x.aeries.net` */
export function aeriesPortalBase(baseUrl: string): string {
  return baseUrl
    .trim()
    .replace(/\/+$/, '')
    .replace(/\/student(\/.*)?$/i, '')
    .replace(/\/[^/]*\.aspx$/i, '');
}

/** Resolve a portal-relative href (`ChangeStudent.aspx?..`, `Widgets/..`, `/student/..`) against the student root. */
export function resolveAeriesUrl(studentRoot: string, href: string): string {
  if (/^https?:\/\//i.test(href)) return href;
  if (href.startsWith('/')) {
    const origin = studentRoot.replace(/^(https?:\/\/[^/]+).*$/i, '$1');
    return origin + href;
  }
  return studentRoot + href.replace(/^\.?\//, '');
}

async function openDashboard(driver: IPageDriver, dashboardUrl: string): Promise<void> {
  await driver.goto(dashboardUrl, { waitUntil: 'load', timeout: PAGE_TIMEOUT_MS });
  // The class widget renders after the page load.
  const started = Date.now();
  while (!(await driver.evaluate(isAeriesDashboardReady))) {
    if (Date.now() - started > DASHBOARD_READY_MS) break;
    await driver.sleep(500);
  }
}

async function openAttendance(driver: IPageDriver, studentRoot: string): Promise<void> {
  await driver.goto(`${studentRoot}Attendance.aspx`, {
    waitUntil: 'load',
    timeout: PAGE_TIMEOUT_MS,
  });
  // The attendance grid renders after the page load.
  const started = Date.now();
  while (!(await driver.evaluate(isAeriesAttendanceReady))) {
    if (Date.now() - started > ATTENDANCE_READY_MS) break;
    await driver.sleep(500);
  }
}

async function scrapeCurrentStudent(
  driver: IPageDriver,
  studentRoot: string,
  listEntry: IAeriesStudentListItem | undefined
): Promise<IAeriesStudentExtract> {
  const dashboardInfo = await driver.evaluate(extractAeriesStudentInfo);
  const cards = await driver.evaluate(extractAeriesDashboardCourses);

  let schedule: IAeriesScheduleRow[] = [];
  try {
    await driver.goto(`${studentRoot}Classes.aspx`, {
      waitUntil: 'load',
      timeout: PAGE_TIMEOUT_MS,
    });
    schedule = await driver.evaluate(extractAeriesSchedule);
  } catch {
    // Period and email then come from the gradebook pages only.
  }

  let studentId = dashboardInfo.studentId;
  const courses: IAeriesCourseExtract[] = [];
  for (const card of cards) {
    let period = '';
    let teacher = card.teacher;
    let teacherEmail = '';
    let termStart = '';
    let termEnd = '';
    let assignments: IAeriesCourseExtract['assignments'] = [];
    if (card.gradebookHref) {
      try {
        await driver.goto(resolveAeriesUrl(studentRoot, card.gradebookHref), {
          waitUntil: 'load',
          timeout: PAGE_TIMEOUT_MS,
        });
        const options = await driver.evaluate(extractAeriesCourseDropdownOptions);
        const selected = options.find((o) => o.selected);
        period = selected?.text.match(/^(\d+)\s*-/)?.[1] ?? '';
        const dates = parseAeriesTermDates(selected?.text ?? '');
        termStart = dates?.start ?? '';
        termEnd = dates?.end ?? '';
        const t = await driver.evaluate(extractAeriesTeacher);
        if (t.name) teacher = t.name;
        teacherEmail = t.email;
        assignments = await driver.evaluate(extractAeriesAssignments);
        if (!studentId) {
          const info = await driver.evaluate(extractAeriesStudentInfo);
          studentId = info.studentId;
        }
      } catch {
        // Card data still stands on its own.
      }
    }
    const row = matchScheduleRow(schedule, card.name, period);
    courses.push({
      period: period || row?.period || '',
      name: card.name,
      term: card.term,
      teacher: teacher || row?.teacher || '',
      teacherEmail: teacherEmail || row?.teacherEmail || '',
      room: card.room || row?.room || '',
      currentGrade: card.currentGrade,
      currentPercent: card.currentPercent,
      missingCount: card.missingCount,
      assignments,
      gradebookHref: card.gradebookHref,
      courseId: row?.courseId,
      section: row?.section,
      lastUpdated: card.lastUpdated,
      ...(termStart && termEnd ? { termStart, termEnd } : {}),
    });
  }

  let attendance: IAeriesStudentExtract['attendance'] = [];
  try {
    await openAttendance(driver, studentRoot);
    attendance = await driver.evaluate(extractAeriesAttendance);
    if (!studentId) {
      const info = await driver.evaluate(extractAeriesStudentInfo);
      studentId = info.studentId;
    }
  } catch {
    // continue
  }

  return {
    name: dashboardInfo.name || listEntry?.name || 'Unknown',
    studentId,
    grade: dashboardInfo.grade || listEntry?.grade || '',
    school: dashboardInfo.school || listEntry?.school || '',
    courses,
    attendance,
  };
}

/** Find the schedule row for a dashboard card: same name, else same name without the a/b suffix, preferring the card's period. */
export function matchScheduleRow(
  schedule: IAeriesScheduleRow[],
  cardName: string,
  period: string
): IAeriesScheduleRow | undefined {
  const norm = (s: string): string => s.replace(/\s+/g, ' ').trim().toLowerCase();
  const base = (s: string): string => norm(s).replace(/\s+[ab]$/, '');
  const exact = schedule.filter((r) => norm(r.name) === norm(cardName));
  const loose = exact.length > 0 ? exact : schedule.filter((r) => base(r.name) === base(cardName));
  if (loose.length === 0) return undefined;
  return (period && loose.find((r) => r.period === period)) || loose[0];
}

/** `1- Spanish 2 a- Quarter 2 10/19/2026 - 12/18/2026` -> { start: '2026-10-19', end: '2026-12-18' } */
export function parseAeriesTermDates(
  optionText: string
): { start: string; end: string } | undefined {
  const m = optionText.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})\s*-\s*(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!m) return undefined;
  const iso = (mm: string, dd: string, yyyy: string): string =>
    `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
  return { start: iso(m[1]!, m[2]!, m[3]!), end: iso(m[4]!, m[5]!, m[6]!) };
}
