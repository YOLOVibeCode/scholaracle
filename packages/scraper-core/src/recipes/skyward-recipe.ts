/**
 * Skyward scrape recipe.
 *
 * Orchestrates navigation and extraction using IPageDriver.
 * Auth (login) is NOT here — it is runtime-specific.
 */

import type { IPageDriver } from '../driver/IPageDriver';
import type {
  ISkywardFullExtract,
  ISkywardCourseExtract,
  ISkywardSelectorsV1,
} from '../extractors/skyward/skyward-extractors';
import {
  extractSkywardStudentName,
  extractSkywardSchoolName,
  extractSkywardCourseAssignments,
  extractSkywardAttendance,
  extractSkywardSchedule,
  clickSkywardNavLink,
  openSkywardGradeInfo,
  isSkywardGradeInfoReady,
  closeSkywardDialogs,
} from '../extractors/skyward/skyward-extractors';
import { SKYWARD_SELECTORS_V1 } from '../selectors/skywardV1';
import { mergeSelectorRecord } from '../selectors/mergeSelectorTables';

export interface IRunSkywardRecipeOptions {
  readonly selectors?: Partial<ISkywardSelectorsV1>;
  /** Fake-portal extension conformance: gradebook slice only (expected counts need no attendance/schedule). */
  readonly conformanceGradebookOnly?: boolean;
}

/** Grade period literals in priority order (most recent school term first). */
const GRADE_PERIOD_PRIORITY = ['4TH', 'PR4', '3RD', 'PR3', '2ND', 'PR2', '1ST', 'PR1'];
/** How long to wait for a course's grade dialog after clicking its grade cell. */
const GRADE_DIALOG_TIMEOUT_MS = 8000;
const GRADE_DIALOG_POLL_MS = 400;
const CLASS_DESC_REGEX_SOURCE = /<table\s+id="classDesc_(\d+_\d+_\d+_\d+)"[^>]*>(.*?)<\/table>/gs
  .source;

function parseCoursesFromHtml(html: string): ISkywardCourseExtract[] {
  const courses: ISkywardCourseExtract[] = [];
  const regex = new RegExp(CLASS_DESC_REGEX_SOURCE, 'gs');
  let match;
  while ((match = regex.exec(html)) !== null) {
    const sectionId = match[1];
    const content = match[2];
    const nameM = content?.match(/class="bld classDesc"><a[^>]*>([^<]+)<\/a>/);
    const periodM = content?.match(/Period<\/label>\s*(\d+[A-Z]?)/);
    const timeM = content?.match(/\((\d+:\d+\s*[AP]M\s*-\s*\d+:\d+\s*[AP]M)\)/);
    const teacherMs = [
      ...(content?.matchAll(/<a[^>]*href="javascript:void\(0\)"[^>]*>([^<]+)<\/a>/g) ?? []),
    ];
    const name = nameM?.[1]?.trim().replace(/&amp;/g, '&') ?? '?';
    const teacher =
      teacherMs.length > 0
        ? ([...teacherMs]
            .reverse()
            .find((m) => m[1]!.trim() !== name && m[1]!.trim().length > 2)?.[1]
            ?.trim() ?? '')
        : '';
    const cniParts = sectionId?.split('_');
    const courseCni = cniParts && cniParts.length >= 2 ? cniParts[1] : undefined;
    courses.push({
      name,
      period: periodM?.[1] ?? '?',
      time: timeM?.[1] ?? '',
      teacher,
      currentGrade: '',
      grades: {},
      _cni: courseCni,
    });
  }
  return courses;
}

/**
 * Read grades straight from the gradebook's grade cells:
 * `<a id="showGradeInfo" data-cni="…" data-lit="3RD">95</a>`. Keyed by the
 * course's section id (cni) and the period literal the page itself uses, so
 * rows never shift between courses and any district's terms come through.
 * Values keep document order. "X" and empty cells are skipped.
 */
export function parseSkywardGradeCells(html: string): Map<string, Record<string, string>> {
  const byCni = new Map<string, Record<string, string>>();
  const anchorRe = /<a\b([^>]*\bid="showGradeInfo"[^>]*)>([\s\S]*?)<\/a>/g;
  let m: RegExpExecArray | null;
  while ((m = anchorRe.exec(html)) !== null) {
    const attrs = m[1]!;
    const cni = /\bdata-cni="([^"]*)"/.exec(attrs)?.[1];
    const lit = /\bdata-lit="([^"]*)"/.exec(attrs)?.[1];
    const value = m[2]!
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, '')
      .replace(/\u00a0/g, '')
      .trim();
    if (!cni || !lit || !value || value === 'X') continue;
    const grades = byCni.get(cni) ?? {};
    grades[lit] = value;
    byCni.set(cni, grades);
  }
  return byCni;
}

/**
 * The most current grade: the first literal in GRADE_PERIOD_PRIORITY that has
 * a value (4TH before PR4 before 3RD …), else the last term-like column the
 * page showed (districts with other term names), else "?". Exams, semester
 * and final columns are never the current grade.
 */
export function pickSkywardCurrentGrade(grades: Readonly<Record<string, string>>): string {
  for (const period of GRADE_PERIOD_PRIORITY) {
    const value = grades[period];
    if (value) return value;
  }
  const termLike = Object.keys(grades).filter((k) => !/^(EX|SM|FIN)/i.test(k));
  const last = termLike[termLike.length - 1];
  return last ? grades[last]! : '?';
}

/**
 * Run the Skyward scrape recipe.
 *
 * @param driver - Runtime-specific page driver
 * @param baseUrl - The Skyward Family Access base URL
 * @returns ISkywardFullExtract ready for transformation
 */
export async function runSkywardRecipe(
  driver: IPageDriver,
  _baseUrl: string,
  options?: IRunSkywardRecipeOptions
): Promise<ISkywardFullExtract> {
  const selectors = mergeSelectorRecord(SKYWARD_SELECTORS_V1, options?.selectors);
  const studentName = await driver.evaluate(extractSkywardStudentName, selectors);
  const schoolName = await driver.evaluate(extractSkywardSchoolName, selectors);

  // --- Gradebook ---
  if (options?.conformanceGradebookOnly) {
    await driver.sleep(500);
  } else {
    await navigateSkywardSection(driver, selectors, 'Gradebook');
    await driver.sleep(3000);
  }

  const html = await driver.content();
  const headers = [
    'PR1',
    '1ST',
    'PR2',
    '2ND',
    'EX1',
    'SM1',
    'PR3',
    '3RD',
    'PR4',
    '4TH',
    'EX2',
    'SM2',
    'FIN',
  ];

  const courses = parseCoursesFromHtml(html);

  // Parse grade summary grid
  const gridIdx = html.indexOf('grid_stuGradesGrid');
  if (gridIdx > 0) {
    const gridHtml = html.slice(gridIdx);
    const trRegex = /<tr[^>]*>(.*?)<\/tr>/gs;
    const summaryRows: string[][] = [];
    let trMatch;
    while ((trMatch = trRegex.exec(gridHtml)) !== null) {
      const tdRegex = /<td[^>]*>(.*?)<\/td>/gs;
      const values: string[] = [];
      let tdMatch;
      while ((tdMatch = tdRegex.exec(trMatch[1]!)) !== null) {
        const text = tdMatch[1]!
          .replace(/<[^>]+>/g, '')
          .replace(/&nbsp;/g, '')
          .replace(/\u00a0/g, '')
          .trim();
        values.push(text);
      }
      if (values.length !== headers.length) continue;
      const filledCount = values.filter((v) => v && v !== 'X').length;
      const hasNum = values.some((v) => /^\d+$/.test(v));
      if (hasNum && filledCount >= 2) summaryRows.push(values);
    }
    for (let i = 0; i < courses.length && i < summaryRows.length; i++) {
      const row = summaryRows[i]!;
      const grades: Record<string, string> = {};
      for (let j = 0; j < headers.length; j++) {
        if (row[j] && row[j] !== 'X') grades[headers[j]!] = row[j]!;
      }
      courses[i] = { ...courses[i]!, grades, currentGrade: pickSkywardCurrentGrade(grades) };
    }
  }

  // Prefer the grade cells' own section ids over the row order above.
  const gradeCells = parseSkywardGradeCells(html);
  if (gradeCells.size > 0) {
    for (let i = 0; i < courses.length; i++) {
      const course = courses[i]!;
      const grades = course._cni ? gradeCells.get(course._cni) : undefined;
      courses[i] = grades
        ? { ...course, grades, currentGrade: pickSkywardCurrentGrade(grades) }
        : { ...course, grades: {}, currentGrade: '?' };
    }
  }

  // Missing assignments
  const missingAssignments: ISkywardFullExtract['missingAssignments'] = [];
  const html2 = await driver.content();
  const missingSection = html2.slice(
    html2.indexOf('Missing Assignments'),
    html2.indexOf('Class Grades')
  );

  const missingRegex =
    /Due:\s*(\d{2}\/\d{2}\/\d{4})\s*<a[^>]*>([^<]+)<\/a>.*?<a[^>]*>([^<]+)<\/a>\s*&nbsp;\s*<span[^>]*>\(Period\s*&nbsp;<b>(\d+[A-Z]?)<\/b>\)\s*<\/span>\s*&nbsp;\s*<a[^>]*>([^<]+)<\/a>/gs;
  let missingMatch;
  while ((missingMatch = missingRegex.exec(missingSection)) !== null) {
    missingAssignments.push({
      dueDate: missingMatch[1]!,
      title: missingMatch[2]!.replace(/&amp;/g, '&').trim(),
      course: missingMatch[3]!.trim(),
      period: missingMatch[4]!,
      teacher: missingMatch[5]!.trim(),
    });
  }

  // Per-course assignments: click the course's grade cell, wait for its
  // #gradeInfoDialog, read it, close it (closing marks it read).
  const allAssignments: ISkywardFullExtract['assignments'] = [];
  await closeDialogsQuietly(driver, selectors);
  for (const course of courses) {
    if (!course._cni) continue;
    try {
      const periods = [...GRADE_PERIOD_PRIORITY, ...Object.keys(course.grades).reverse()];
      const opened = await driver.evaluate(openSkywardGradeInfo, {
        selectors,
        cni: course._cni,
        periods,
      });
      if (opened === null) continue;
      if (!(await waitForGradeDialog(driver, selectors))) continue;
      const assignments = await driver.evaluate(extractSkywardCourseAssignments, {
        selectors,
        courseName: course.name,
        coursePeriod: course.period,
      });
      allAssignments.push(...assignments);
    } catch {
      // continue to next course
    } finally {
      await closeDialogsQuietly(driver, selectors);
    }
  }

  if (options?.conformanceGradebookOnly) {
    return {
      student: studentName,
      school: schoolName,
      courses,
      missingAssignments,
      assignments: allAssignments,
      attendance: [],
      schedule: [],
      timestamp: new Date().toISOString(),
    };
  }

  // --- Attendance ---
  let attendance: ISkywardFullExtract['attendance'] = [];
  try {
    await navigateSkywardSection(driver, selectors, 'Attendance');
    await driver.sleep(3000);
    attendance = await driver.evaluate(extractSkywardAttendance, selectors);
  } catch {
    // continue
  }

  // --- Schedule ---
  let schedule: ISkywardFullExtract['schedule'] = [];
  try {
    await navigateSkywardSection(driver, selectors, 'Schedule');
    await driver.sleep(3000);
    schedule = await driver.evaluate(extractSkywardSchedule, selectors);
  } catch {
    // continue
  }

  return {
    student: studentName,
    school: schoolName,
    courses,
    missingAssignments,
    assignments: allAssignments,
    attendance,
    schedule,
    timestamp: new Date().toISOString(),
  };
}

async function navigateSkywardSection(
  driver: IPageDriver,
  selectors: ISkywardSelectorsV1,
  linkText: string
): Promise<void> {
  // Navigation via URL manipulation is more reliable than clicking nav links in WebViews
  // The driver is expected to navigate to the section; clicking is handled by the recipe
  // by injecting a click on the nav link text.
  try {
    await driver.evaluate(clickSkywardNavLink, { selectors, text: linkText });
    await driver.waitForLoad({ timeout: 10000 });
    await driver.sleep(2000);
  } catch {
    // best effort
  }
}

async function waitForGradeDialog(
  driver: IPageDriver,
  selectors: ISkywardSelectorsV1
): Promise<boolean> {
  const polls = Math.ceil(GRADE_DIALOG_TIMEOUT_MS / GRADE_DIALOG_POLL_MS);
  for (let i = 0; i <= polls; i++) {
    if (await driver.evaluate(isSkywardGradeInfoReady, selectors)) return true;
    if (i < polls) await driver.sleep(GRADE_DIALOG_POLL_MS);
  }
  return false;
}

async function closeDialogsQuietly(
  driver: IPageDriver,
  selectors: ISkywardSelectorsV1
): Promise<void> {
  try {
    await driver.evaluate(closeSkywardDialogs, selectors);
    await driver.sleep(300);
  } catch {
    // best effort
  }
}
