#!/usr/bin/env npx ts-node --transpile-only
/**
 * Skyward Browser Scraper — uses Playwright to log into Skyward Family Access,
 * handle the popup window, and extract ALL available data:
 *   - Gradebook (course grades by period + individual assignments)
 *   - Missing assignments
 *   - Attendance
 *   - Schedule
 *
 * Usage:
 *   SKYWARD_URL="https://skyward.iscorp.com/..." SKYWARD_USERNAME="user" SKYWARD_PASSWORD="pass" \
 *     npx ts-node src/harness/skyward-browser-scrape.ts
 */

import { chromium, type Page, type BrowserContext } from 'playwright';
import { writeFileSync, mkdirSync } from 'node:fs';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const ARGS = process.argv.filter((a) => a !== '--');

function getCliArg(name: string): string | undefined {
  const idx = ARGS.indexOf(name);
  return idx >= 0 && idx + 1 < ARGS.length ? ARGS[idx + 1] : undefined;
}

const SKYWARD_URL = process.env['SKYWARD_URL'] ?? getCliArg('--url') ?? '';
const SKYWARD_USERNAME = process.env['SKYWARD_USERNAME'] ?? getCliArg('--username') ?? '';
const SKYWARD_PASSWORD = process.env['SKYWARD_PASSWORD'] ?? getCliArg('--password') ?? '';

// ---------------------------------------------------------------------------
// Output types
// ---------------------------------------------------------------------------

export interface ISkywardFullExtract {
  student: string;
  school: string;
  courses: ISkywardCourseExtract[];
  missingAssignments: ISkywardMissingAssignment[];
  assignments: ISkywardAssignmentExtract[];
  attendance: ISkywardAttendanceExtract[];
  schedule: ISkywardScheduleEntry[];
  timestamp: string;
}

export interface ISkywardCourseExtract {
  name: string;
  period: string;
  time: string;
  teacher: string;
  currentGrade: string;
  grades: Record<string, string>;
}

export interface ISkywardMissingAssignment {
  title: string;
  course: string;
  period: string;
  teacher: string;
  dueDate: string;
}

export interface ISkywardAssignmentExtract {
  course: string;
  grade: string;
  period: string;
}

export interface ISkywardAttendanceExtract {
  date: string;
  period: string;
  status: string;
  course: string;
  reason: string;
}

export interface ISkywardScheduleEntry {
  period: string;
  time: string;
  course: string;
  teacher: string;
  room: string;
}

// ---------------------------------------------------------------------------
// Login
// ---------------------------------------------------------------------------

async function login(
  context: BrowserContext,
  url: string,
  username: string,
  password: string
): Promise<Page> {
  const page = await context.newPage();
  console.log(`  Navigating to ${url}`);
  await page.goto(url, { waitUntil: 'networkidle', timeout: 20000 });

  // Select Family/Student Access if dropdown exists
  await page.locator('select').selectOption({ label: 'Family/Student Access' }).catch(() => {});

  // Fill credentials
  await page.locator('input[name="login"], #login').fill(username);
  await page.locator('input[name="password"], #password').fill(password);

  // Click Sign In and catch popup
  let popup: Page | null = null;
  context.on('page', (p) => { popup = p; });

  await page.locator('#bLogin').click({ timeout: 10000 });
  await page.waitForTimeout(5000);

  const activePage = popup ?? page;
  if (popup) {
    await popup.waitForLoadState('networkidle', { timeout: 15000 });
    console.log(`  Logged in (popup: ${popup.url()})`);
  } else {
    console.log(`  Logged in (same page: ${page.url()})`);
  }

  return activePage;
}

// ---------------------------------------------------------------------------
// Navigate to a Skyward page by clicking the sidebar link
// ---------------------------------------------------------------------------

async function navigateTo(page: Page, linkText: string): Promise<boolean> {
  try {
    // Target the sidebar navigation links specifically (they're in the left nav area)
    // Skyward nav links have class "sf_navItem" or are inside a nav/sidebar container
    const navLink = page.locator(`#sf_NavBarWrap a:has-text("${linkText}"), .sf_navBar a:has-text("${linkText}"), nav a:has-text("${linkText}")`).first();
    if (await navLink.count() > 0) {
      await navLink.click({ timeout: 5000 });
    } else {
      // Fallback: find visible link with exact text
      const links = page.locator(`a:visible:has-text("${linkText}")`);
      const count = await links.count();
      for (let i = 0; i < count; i++) {
        const text = await links.nth(i).textContent();
        if (text?.trim() === linkText) {
          await links.nth(i).click({ timeout: 5000 });
          break;
        }
      }
    }
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(2000);
    return true;
  } catch (err) {
    console.log(`    (could not navigate to ${linkText}: ${err instanceof Error ? err.message.split('\n')[0] : err})`);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Extract Gradebook
// ---------------------------------------------------------------------------

async function extractGradebook(page: Page): Promise<{
  courses: ISkywardCourseExtract[];
  assignments: ISkywardAssignmentExtract[];
  missingAssignments: ISkywardMissingAssignment[];
}> {
  await navigateTo(page, 'Gradebook');
  await page.waitForTimeout(3000); // Skyward loads grade data async

  const html = await page.content();

  // Save HTML for debugging
  writeFileSync('harness-output/skyward-gradebook.html', html, 'utf8');

  // Use regex parsing on the saved HTML (proven to work perfectly)
  const headers = ['PR1','1ST','PR2','2ND','EX1','SM1','PR3','3RD','PR4','4TH','EX2','SM2','FIN'];

  // --- Courses ---
  const classDescRegex = /<table\s+id="classDesc_(\d+_\d+_\d+_\d+)"[^>]*>(.*?)<\/table>/gs;
  const courses: ISkywardCourseExtract[] = [];
  let match;

  while ((match = classDescRegex.exec(html)) !== null) {
    const content = match[2];
    const nameM = content.match(/class="bld classDesc"><a[^>]*>([^<]+)<\/a>/);
    const periodM = content.match(/Period<\/label>\s*(\d+[A-Z]?)/);
    const timeM = content.match(/\((\d+:\d+\s*[AP]M\s*-\s*\d+:\d+\s*[AP]M)\)/);
    const teacherMs = [...content.matchAll(/<a[^>]*href="javascript:void\(0\)"[^>]*>([^<]+)<\/a>/g)];
    const name = nameM?.[1]?.trim().replace(/&amp;/g, '&') ?? '?';
    const teacher = teacherMs.length > 0
      ? [...teacherMs].reverse().find((m) => m[1]!.trim() !== name && m[1]!.trim().length > 2)?.[1]?.trim() ?? ''
      : '';

    courses.push({
      name,
      period: periodM?.[1] ?? '?',
      time: timeM?.[1] ?? '',
      teacher,
      currentGrade: '',
      grades: {},
    });
  }

  // --- Grade data rows (summary = multi-period filled) ---
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
      while ((tdMatch = tdRegex.exec(trMatch[1])) !== null) {
        const text = tdMatch[1].replace(/<[^>]+>/g, '').replace(/&nbsp;/g, '').replace(/\u00a0/g, '').trim();
        values.push(text);
      }
      if (values.length !== headers.length) continue;

      const filledCount = values.filter((v) => v && v !== 'X').length;
      const hasNum = values.some((v) => /^\d+$/.test(v));
      if (hasNum && filledCount >= 2) {
        summaryRows.push(values);
      }
    }

    // Match summary rows to courses by order
    for (let i = 0; i < courses.length && i < summaryRows.length; i++) {
      const row = summaryRows[i]!;
      const grades: Record<string, string> = {};
      for (let j = 0; j < headers.length; j++) {
        if (row[j] && row[j] !== 'X') grades[headers[j]!] = row[j]!;
      }
      courses[i]!.grades = grades;
      courses[i]!.currentGrade =
        grades['3RD'] ?? grades['SM1'] ?? grades['2ND'] ?? grades['PR3'] ?? grades['PR1'] ?? '?';
    }
  }

  // --- Missing assignments ---
  const missingAssignments: ISkywardMissingAssignment[] = [];
  // Click "Show All" to reveal all missing assignments
  const showAll = page.locator('a:has-text("Show All"), button:has-text("Show All")').first();
  if (await showAll.count() > 0) {
    await showAll.click();
    await page.waitForTimeout(2000);
  }

  // Re-read HTML after Show All
  const html2 = await page.content();
  const missingSection = html2.slice(
    html2.indexOf('Missing Assignments'),
    html2.indexOf('Class Grades')
  );

  // Each missing assignment row has: date, assignment link, course, teacher
  const missingRegex = /Due:\s*(\d{2}\/\d{2}\/\d{4})\s*<a[^>]*>([^<]+)<\/a>.*?<a[^>]*>([^<]+)<\/a>\s*&nbsp;\s*<span[^>]*>\(Period\s*&nbsp;<b>(\d+[A-Z]?)<\/b>\)\s*<\/span>\s*&nbsp;\s*<a[^>]*>([^<]+)<\/a>/gs;
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

  // If regex didn't catch them, try a simpler approach
  if (missingAssignments.length === 0) {
    const simpleRegex = /showAssignmentInfo[^>]*>([^<]+)<\/a>.*?<a[^>]*>([^<]+)<\/a>\s*(?:&nbsp;)?\s*<span[^>]*>\(Period\s*(?:&nbsp;)?<b>(\d+[A-Z]?)<\/b>/gs;
    let sm;
    while ((sm = simpleRegex.exec(missingSection)) !== null) {
      missingAssignments.push({
        title: sm[1]!.replace(/&amp;/g, '&').trim(),
        course: sm[2]!.trim(),
        period: sm[3]!,
        teacher: '',
        dueDate: '',
      });
    }
  }

  return { courses, assignments: [], missingAssignments };
}

// ---------------------------------------------------------------------------
// Extract Attendance
// ---------------------------------------------------------------------------

async function extractAttendance(page: Page): Promise<ISkywardAttendanceExtract[]> {
  await navigateTo(page, 'Attendance');
  await page.waitForTimeout(3000);

  const html = await page.content();
  writeFileSync('harness-output/skyward-attendance.html', html, 'utf8');

  // Skyward attendance table has columns: Date | Attendance | Period | Class
  // Dates are in format "Wed Jan 7, 2026"
  const rows = await page.evaluate(() => {
    const results: Array<{ date: string; period: string; status: string; course: string; reason: string }> = [];
    const tables = document.querySelectorAll('table');
    for (const table of tables) {
      // Check if this table has an "Attendance" column header
      const headerText = table.querySelector('tr')?.textContent ?? '';
      if (!headerText.includes('Attendance') || !headerText.includes('Period')) continue;

      const trs = table.querySelectorAll('tr');
      for (let i = 1; i < trs.length; i++) {
        const tds = trs[i]!.querySelectorAll('td');
        if (tds.length >= 3) {
          const texts = Array.from(tds).map((td) => td.textContent?.trim() ?? '');
          // Date is in the first column, any non-empty text that's not a header
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
  });

  return rows;
}

// ---------------------------------------------------------------------------
// Extract Schedule
// ---------------------------------------------------------------------------

async function extractSchedule(page: Page): Promise<ISkywardScheduleEntry[]> {
  await navigateTo(page, 'Schedule');
  await page.waitForTimeout(3000);

  const html = await page.content();
  writeFileSync('harness-output/skyward-schedule.html', html, 'utf8');

  // Skyward schedule is a matrix: rows = periods, columns = terms
  // Each cell has: Course name, Teacher, Days, Room
  // The current term is highlighted
  const entries = await page.evaluate(() => {
    const results: Array<{ period: string; time: string; course: string; teacher: string; room: string }> = [];
    const tables = document.querySelectorAll('table');

    for (const table of tables) {
      const headerRow = table.querySelector('tr');
      const headerText = headerRow?.textContent ?? '';
      // Schedule table has "Term" in header and period rows
      if (!headerText.includes('Term') && !headerText.includes('2025')) continue;

      const rows = table.querySelectorAll('tr');
      for (let i = 1; i < rows.length; i++) {
        const tds = rows[i]!.querySelectorAll('td, th');
        if (tds.length < 2) continue;

        // First cell is the period info (e.g. "Period 1 (7:30 AM - 8:15 AM)")
        const periodCell = tds[0]?.textContent?.trim() ?? '';
        const periodMatch = periodCell.match(/Period\s*(\d+[A-Z]?)/);
        const timeMatch = periodCell.match(/\(([^)]+)\)/);
        if (!periodMatch) continue;

        // Find the current term column (highlighted with yellow background or specific class)
        // Use the 3rd or 4th term column (most recent)
        // Each term cell contains: course name, teacher, days, room
        let bestCell = tds[tds.length - 2]; // second-to-last for current
        // Look for highlighted cell
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

        const lines = cellText.split('\n').map((l) => l.trim()).filter((l) => l);
        const course = lines[0] ?? '';
        const teacher = lines[1] ?? '';
        const roomMatch = cellText.match(/Room\s*(\w+)/);
        const room = roomMatch?.[1] ?? '';

        results.push({
          period: periodMatch[1] ?? '',
          time: timeMatch?.[1] ?? '',
          course,
          teacher,
          room,
        });
      }
    }
    return results;
  });

  return entries;
}

// ---------------------------------------------------------------------------
// Main scraper
// ---------------------------------------------------------------------------

export async function scrapeSkywardComplete(
  url: string,
  username: string,
  password: string
): Promise<ISkywardFullExtract> {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  mkdirSync('harness-output', { recursive: true });

  try {
    console.log('\n1. LOGGING IN');
    const page = await login(context, url, username, password);

    // Take home screenshot
    await page.screenshot({ path: 'harness-output/skyward-home.png', fullPage: true });

    // Extract student name from header
    const studentName = await page.evaluate(() => {
      // Look for the student name in the header area
      const el = document.querySelector('.sf_headerName, [id*="studentName"]');
      if (el) return el.textContent?.trim() ?? '';
      // Fallback: look for "Ava" pattern in header
      const header = document.querySelector('#sf_HeaderWrap, [role="banner"]');
      return header?.textContent?.match(/([A-Z][a-z]+ [A-Z]\.? [A-Z][a-z]+)/)?.[1] ?? 'Unknown';
    });

    const schoolName = await page.evaluate(() => {
      const el = document.querySelector('[id*="schoolName"]');
      return el?.textContent?.trim() ?? 'Unknown School';
    });

    console.log(`  Student: ${studentName}`);

    // 2. GRADEBOOK
    console.log('\n2. EXTRACTING GRADEBOOK');
    const { courses, assignments, missingAssignments } = await extractGradebook(page);
    console.log(`  Courses: ${courses.length}`);
    console.log(`  Missing assignments: ${missingAssignments.length}`);

    // Screenshot after gradebook
    await page.screenshot({ path: 'harness-output/skyward-gradebook.png', fullPage: true });

    // 3. ATTENDANCE
    console.log('\n3. EXTRACTING ATTENDANCE');
    let attendance: ISkywardAttendanceExtract[] = [];
    try {
      attendance = await extractAttendance(page);
      console.log(`  Records: ${attendance.length}`);
      await page.screenshot({ path: 'harness-output/skyward-attendance.png', fullPage: true });
    } catch (err) {
      console.log(`  Failed: ${err instanceof Error ? err.message.split('\n')[0] : err}`);
    }

    // 4. SCHEDULE
    console.log('\n4. EXTRACTING SCHEDULE');
    let schedule: ISkywardScheduleEntry[] = [];
    try {
      schedule = await extractSchedule(page);
      console.log(`  Entries: ${schedule.length}`);
      await page.screenshot({ path: 'harness-output/skyward-schedule.png', fullPage: true });
    } catch (err) {
      console.log(`  Failed: ${err instanceof Error ? err.message.split('\n')[0] : err}`);
    }

    const result: ISkywardFullExtract = {
      student: studentName,
      school: schoolName,
      courses,
      missingAssignments,
      assignments,
      attendance,
      schedule,
      timestamp: new Date().toISOString(),
    };

    return result;
  } finally {
    await browser.close();
  }
}

// ---------------------------------------------------------------------------
// CLI + Report
// ---------------------------------------------------------------------------

function printReport(data: ISkywardFullExtract): void {
  const line = '═'.repeat(70);
  console.log(`\n${line}`);
  console.log(`  SKYWARD FULL EXTRACT — ${data.student}`);
  console.log(`  ${data.school}`);
  console.log(`  ${data.timestamp}`);
  console.log(line);

  console.log('\n  COURSES & GRADES:');
  for (const c of data.courses) {
    const gradeStr = Object.entries(c.grades)
      .map(([k, v]) => `${k}:${v}`)
      .join('  ');
    console.log(`\n    ${c.name}`);
    console.log(`      Period ${c.period} (${c.time}) — ${c.teacher}`);
    console.log(`      Current: ${c.currentGrade}`);
    console.log(`      ${gradeStr}`);
  }

  if (data.missingAssignments.length > 0) {
    console.log(`\n  MISSING ASSIGNMENTS (${data.missingAssignments.length}):`);
    for (const ma of data.missingAssignments) {
      const dueStr = (ma.dueDate || 'N/A').padEnd(12);
      console.log('    Due ' + dueStr + '  ' + ma.title.padEnd(40) + '  ' + ma.course + ' (' + ma.teacher + ')');
    }
  }

  if (data.attendance.length > 0) {
    console.log('\n  ATTENDANCE RECORDS (' + data.attendance.length + '):');
    for (const a of data.attendance) {
      console.log('    ' + a.date + '  Period ' + a.period + '  ' + a.status + '  ' + a.course + '  ' + a.reason);
    }
  }

  if (data.schedule.length > 0) {
    console.log('\n  SCHEDULE (' + data.schedule.length + ' periods):');
    for (const s of data.schedule) {
      console.log('    Period ' + s.period + '  ' + s.time.padEnd(25) + '  ' + s.course.padEnd(35) + '  ' + s.teacher + '  Room ' + s.room);
    }
  }

  console.log('\n' + line);
  console.log('  TOTALS:');
  console.log('    Courses:              ' + data.courses.length);
  console.log('    Missing assignments:  ' + data.missingAssignments.length);
  console.log('    Attendance records:   ' + data.attendance.length);
  console.log('    Schedule entries:     ' + data.schedule.length);
  console.log(line);
}

if (require.main === module) {
  if (!SKYWARD_URL || !SKYWARD_USERNAME || !SKYWARD_PASSWORD) {
    console.error('Usage: SKYWARD_URL=... SKYWARD_USERNAME=... SKYWARD_PASSWORD=... npx ts-node src/harness/skyward-browser-scrape.ts');
    process.exit(1);
  }

  console.log('🔬 Skyward Browser Scraper');
  console.log(`   ${new Date().toISOString()}\n`);

  scrapeSkywardComplete(SKYWARD_URL, SKYWARD_USERNAME, SKYWARD_PASSWORD)
    .then((result) => {
      printReport(result);

      mkdirSync('harness-output', { recursive: true });
      writeFileSync('harness-output/skyward-full-extract.json', JSON.stringify(result, null, 2), 'utf8');
      console.log('\n  Files saved to harness-output/');
      console.log('    skyward-full-extract.json');
      console.log('    skyward-gradebook.html');
      console.log('    skyward-attendance.html');
      console.log('    skyward-schedule.html');
      console.log('    skyward-*.png (screenshots)');
    })
    .catch((err) => {
      console.error('Scrape failed:', err);
      process.exit(1);
    });
}
