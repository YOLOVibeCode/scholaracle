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
} from '../extractors/skyward/skyward-extractors';
import {
  extractSkywardStudentName,
  extractSkywardSchoolName,
  extractSkywardCourseAssignments,
  extractSkywardAttendance,
  extractSkywardSchedule,
} from '../extractors/skyward/skyward-extractors';

/** Grade period literals in priority order (most recent school term first). */
const GRADE_PERIOD_PRIORITY = ['4TH', 'PR4', '3RD', 'PR3', '2ND', 'PR2', '1ST', 'PR1'];
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
 * Run the Skyward scrape recipe.
 *
 * @param driver - Runtime-specific page driver
 * @param baseUrl - The Skyward Family Access base URL
 * @returns ISkywardFullExtract ready for transformation
 */
export async function runSkywardRecipe(
  driver: IPageDriver,
  _baseUrl: string
): Promise<ISkywardFullExtract> {
  const studentName = await driver.evaluate(extractSkywardStudentName);
  const schoolName = await driver.evaluate(extractSkywardSchoolName);

  // --- Gradebook ---
  // Navigate to Gradebook section via nav link
  await navigateSkywardSection(driver, 'Gradebook');
  await driver.sleep(3000);

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
      courses[i] = {
        ...courses[i]!,
        grades,
        currentGrade:
          grades['3RD'] ?? grades['SM1'] ?? grades['2ND'] ?? grades['PR3'] ?? grades['PR1'] ?? '?',
      };
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

  // Per-course assignment extraction via gradeInfoDialog
  const allAssignments: ISkywardFullExtract['assignments'] = [];
  for (const course of courses) {
    if (!course._cni) continue;
    try {
      // Extract assignments from the gradeInfoDialog if visible after grade cell click
      for (const period of GRADE_PERIOD_PRIORITY) {
        void period; // iterate periods until assignments are found
        const assignments = await driver.evaluate(extractSkywardCourseAssignments, {
          courseName: course.name,
          coursePeriod: course.period,
        });
        if (assignments.length > 0) {
          allAssignments.push(...assignments);
          break;
        }
        break;
      }
    } catch {
      // continue to next course
    }
  }

  // --- Attendance ---
  let attendance: ISkywardFullExtract['attendance'] = [];
  try {
    await navigateSkywardSection(driver, 'Attendance');
    await driver.sleep(3000);
    attendance = await driver.evaluate(extractSkywardAttendance);
  } catch {
    // continue
  }

  // --- Schedule ---
  let schedule: ISkywardFullExtract['schedule'] = [];
  try {
    await navigateSkywardSection(driver, 'Schedule');
    await driver.sleep(3000);
    schedule = await driver.evaluate(extractSkywardSchedule);
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

async function navigateSkywardSection(driver: IPageDriver, linkText: string): Promise<void> {
  // Navigation via URL manipulation is more reliable than clicking nav links in WebViews
  // The driver is expected to navigate to the section; clicking is handled by the recipe
  // by injecting a click on the nav link text.
  try {
    await driver.evaluate((text: string) => {
      const links = Array.from(document.querySelectorAll('a'));
      for (const link of links) {
        if (link.textContent?.trim() === text) {
          (link as HTMLAnchorElement).click();
          return;
        }
      }
    }, linkText);
    await driver.waitForLoad({ timeout: 10000 });
    await driver.sleep(2000);
  } catch {
    // best effort
  }
}
