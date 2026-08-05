/**
 * Aeries Parent Portal scrape recipe.
 *
 * Orchestrates navigation and extraction using IPageDriver.
 * Auth (login) is NOT here — it is runtime-specific.
 */

import type { IPageDriver } from '../driver/IPageDriver';
import type {
  IAeriesFullExtract,
  IAeriesStudentExtract,
} from '../extractors/aeries/aeries-extractors';
import {
  extractAeriesStudentList,
  extractAeriesDashboardCourses,
  extractAeriesCourseDropdownOptions,
  extractAeriesTeacherEmail,
  extractAeriesAssignments,
  extractAeriesAttendance,
  extractAeriesStudentInfo,
} from '../extractors/aeries/aeries-extractors';

const COURSE_ROW_SELECTOR = 'tr[class*="class"], tr[data-*], .ClassSummary tr, table tbody tr';

/**
 * Run the Aeries scrape recipe.
 *
 * @param driver - Runtime-specific page driver
 * @param baseUrl - The Aeries parent portal base URL
 * @returns IAeriesFullExtract ready for transformation
 */
export async function runAeriesRecipe(
  driver: IPageDriver,
  baseUrl: string
): Promise<IAeriesFullExtract> {
  const portalBase = baseUrl.replace(/\/$/, '').replace(/\/student\/.*/, '');
  const dashboardUrl = `${portalBase}/student/Dashboard.aspx`;

  await driver.goto(dashboardUrl, { waitUntil: 'networkidle' });
  await driver.sleep(2000);

  const studentList = await driver.evaluate(extractAeriesStudentList);
  const dashboardCourses = await driver.evaluate(
    extractAeriesDashboardCourses,
    COURSE_ROW_SELECTOR
  );
  const studentInfo = await driver.evaluate(extractAeriesStudentInfo);

  // Enrich courses with gradebook details
  const gradebookData = await extractGradebookDetails(driver, portalBase);

  const enrichedCourses = dashboardCourses.map((c) => {
    const detail = gradebookData.get(c.name) ?? gradebookData.get(c.name.replace(/\s+b$/, ''));
    let bestMatch:
      | {
          teacherEmail: string;
          assignments: IAeriesFullExtract['students'][0]['courses'][0]['assignments'];
        }
      | undefined;
    if (!detail) {
      for (const [key, value] of gradebookData.entries()) {
        if (
          key.includes(c.name.split(' ').slice(0, 2).join(' ')) ||
          c.name.includes(key.split(' ').slice(0, 2).join(' '))
        ) {
          bestMatch = value;
          break;
        }
      }
    }
    const matched = detail ?? bestMatch;
    return {
      ...c,
      teacherEmail: matched?.teacherEmail ?? c.teacherEmail,
      assignments: matched?.assignments ?? [],
    };
  });

  let attendance: IAeriesStudentExtract['attendance'] = [];
  try {
    await driver.goto(`${portalBase}/student/Attendance.aspx`, { waitUntil: 'networkidle' });
    await driver.sleep(3000);
    attendance = await driver.evaluate(extractAeriesAttendance);
  } catch {
    // continue
  }

  const primaryStudent: IAeriesStudentExtract = {
    name: (studentInfo.name || studentList[0]?.name) ?? 'Unknown',
    studentId: studentInfo.studentId,
    grade: (studentInfo.grade || studentList[0]?.grade) ?? '',
    school: (studentInfo.school || studentList[0]?.school) ?? '',
    courses: enrichedCourses,
    attendance,
  };

  const allStudents: IAeriesStudentExtract[] = [primaryStudent];

  // Multi-student: additional students in same account
  for (let i = 1; i < studentList.length; i++) {
    const studentName = studentList[i]!.name;
    await driver.goto(dashboardUrl, { waitUntil: 'networkidle' });
    await driver.sleep(2000);

    const switched = await switchToStudentInAeries(driver, studentName);
    if (!switched) continue;

    const nextCourses = await driver.evaluate(extractAeriesDashboardCourses, COURSE_ROW_SELECTOR);
    const nextGradebook = await extractGradebookDetails(driver, portalBase);
    const nextStudentInfo = await driver.evaluate(extractAeriesStudentInfo);
    let nextAttendance: IAeriesStudentExtract['attendance'] = [];
    try {
      await driver.goto(`${portalBase}/student/Attendance.aspx`, { waitUntil: 'networkidle' });
      await driver.sleep(3000);
      nextAttendance = await driver.evaluate(extractAeriesAttendance);
    } catch {
      // continue
    }

    allStudents.push({
      name: nextStudentInfo.name || studentName,
      studentId: nextStudentInfo.studentId,
      grade: (nextStudentInfo.grade || studentList[i]?.grade) ?? '',
      school: (nextStudentInfo.school || studentList[i]?.school) ?? '',
      courses: nextCourses.map((c) => {
        const detail = nextGradebook.get(c.name);
        return {
          ...c,
          teacherEmail: detail?.teacherEmail ?? c.teacherEmail,
          assignments: detail?.assignments ?? [],
        };
      }),
      attendance: nextAttendance,
    });
  }

  return { students: allStudents, timestamp: new Date().toISOString() };
}

async function extractGradebookDetails(
  driver: IPageDriver,
  portalBase: string
): Promise<
  Map<
    string,
    { teacherEmail: string; assignments: IAeriesStudentExtract['courses'][0]['assignments'] }
  >
> {
  const results = new Map<
    string,
    { teacherEmail: string; assignments: IAeriesStudentExtract['courses'][0]['assignments'] }
  >();
  try {
    await driver.goto(`${portalBase}/student/GradebookDetails.aspx`, { waitUntil: 'networkidle' });
    await driver.sleep(3000);

    const courseOptions = await driver.evaluate(extractAeriesCourseDropdownOptions);

    for (const opt of courseOptions) {
      if (opt.text.startsWith('<<')) continue;
      await driver.evaluate((value: string) => {
        const dropdown = document.querySelector('select') as HTMLSelectElement | null;
        if (dropdown) {
          dropdown.value = value;
          dropdown.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }, opt.value);
      await driver.sleep(2000);
      await driver.waitForLoad({ timeout: 10000 }).catch(() => {});

      const teacherEmail = await driver.evaluate(extractAeriesTeacherEmail);
      const assignments = await driver.evaluate(extractAeriesAssignments);

      const courseNameMatch = opt.text.match(
        /^\d+-\s*(.+?)-\s*(Quarter \d+|Semester \d+|[^1-9]+)\s/
      );
      const courseName = courseNameMatch?.[1]?.trim() ?? opt.text;
      results.set(courseName, { teacherEmail, assignments });
    }
  } catch {
    // return partial results
  }
  return results;
}

async function switchToStudentInAeries(driver: IPageDriver, studentName: string): Promise<boolean> {
  try {
    const switched = await driver.evaluate((name: string): boolean => {
      const dropdown = document.querySelector(
        '[class*="student-selector"], [class*="StudentDrop"]'
      ) as HTMLElement | null;
      if (dropdown) dropdown.click();
      const links = Array.from(document.querySelectorAll('a'));
      for (const link of links) {
        if (link.textContent?.includes(name)) {
          (link as HTMLAnchorElement).click();
          return true;
        }
      }
      return false;
    }, studentName);
    if (switched) {
      await driver.waitForLoad({ timeout: 10000 }).catch(() => {});
      await driver.sleep(2000);
    }
    return switched;
  } catch {
    return false;
  }
}
