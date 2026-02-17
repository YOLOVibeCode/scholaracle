#!/usr/bin/env npx ts-node --transpile-only
/**
 * Aeries Parent Portal Browser Scraper — uses Playwright to log into the
 * Aeries Parent/Student portal and extract ALL available data:
 *   - Student info (ID, grade, school)
 *   - Courses with grades, teachers, rooms
 *   - Per-course assignment details with scores
 *   - Attendance records
 *   - Teacher names and emails
 *
 * Usage:
 *   AERIES_URL="https://kellerisd.aeries.net/student/LoginParent.aspx" \
 *   AERIES_EMAIL="parent@example.com" AERIES_PASSWORD="password" \
 *     npx ts-node src/harness/aeries-browser-scrape.ts
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

const AERIES_URL = process.env['AERIES_URL'] ?? getCliArg('--url') ?? '';
const AERIES_EMAIL = process.env['AERIES_EMAIL'] ?? getCliArg('--email') ?? '';
const AERIES_PASSWORD = process.env['AERIES_PASSWORD'] ?? getCliArg('--password') ?? '';
const OUTPUT_DIR = process.env['OUTPUT_DIR'] ?? 'harness-output';

// ---------------------------------------------------------------------------
// Output types
// ---------------------------------------------------------------------------

export interface IAeriesFullExtract {
  students: IAeriesStudentExtract[];
  timestamp: string;
}

export interface IAeriesStudentExtract {
  name: string;
  studentId: string;
  grade: string;
  school: string;
  courses: IAeriesCourseExtract[];
  attendance: IAeriesAttendanceExtract[];
}

export interface IAeriesCourseExtract {
  period: string;
  name: string;
  term: string;
  teacher: string;
  teacherEmail: string;
  room: string;
  currentGrade: number | null;
  currentPercent: number | null;
  missingCount: number;
  assignments: IAeriesAssignmentExtract[];
}

export interface IAeriesAssignmentExtract {
  number: string;
  title: string;
  category: string;
  scoreEarned: number | null;
  scorePossible: number | null;
  percentCorrect: number | null;
  dateAssigned: string;
  dateDue: string;
  dateCompleted: string;
  gradingComplete: boolean;
  isMissing: boolean;
  comment: string;
}

export interface IAeriesAttendanceExtract {
  date: string;
  period: string;
  status: string;
  reason: string;
  course: string;
}

// ---------------------------------------------------------------------------
// Login — two-step: email → Next → password → Sign In
// ---------------------------------------------------------------------------

async function login(
  page: Page,
  url: string,
  email: string,
  password: string
): Promise<void> {
  console.log(`  Navigating to ${url}`);
  await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });

  // Step 1: Enter email and click Next
  const emailInput = page.locator('input[placeholder="Email"], input[name*="Email"], #EmailAddress');
  await emailInput.fill(email);
  console.log('  Entered email');

  const nextBtn = page.locator('button:has-text("Next"), input[value="Next"]');
  await nextBtn.click({ timeout: 10000 });
  console.log('  Clicked Next');

  // Wait for password field to appear
  await page.waitForTimeout(2000);

  // Step 2: Enter password and click Sign In
  const passwordInput = page.locator('input[placeholder="Password"], input[type="password"]');
  await passwordInput.waitFor({ state: 'visible', timeout: 10000 });
  await passwordInput.fill(password);
  console.log('  Entered password');

  const signInBtn = page.locator('button:has-text("Sign In"), input[value="Sign In"]');
  await signInBtn.click({ timeout: 10000 });
  console.log('  Clicked Sign In');

  // Wait for dashboard to load
  await page.waitForURL('**/Dashboard.aspx', { timeout: 20000 }).catch(() => {
    // Some districts may redirect elsewhere
  });
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(2000);

  console.log(`  Logged in — ${page.url()}`);
}

// ---------------------------------------------------------------------------
// Extract dashboard — students list + course grades overview
// ---------------------------------------------------------------------------

async function extractDashboard(page: Page): Promise<{
  students: Array<{ name: string; grade: string; school: string }>;
  courses: IAeriesCourseExtract[];
}> {
  // Navigate to dashboard if not already there
  if (!page.url().includes('Dashboard.aspx')) {
    await page.goto(page.url().replace(/\/student\/.*/, '/student/Dashboard.aspx'), {
      waitUntil: 'networkidle',
      timeout: 15000,
    });
    await page.waitForTimeout(2000);
  }

  // Extract students from the Students section
  const students = await page.evaluate(() => {
    const results: Array<{ name: string; grade: string; school: string }> = [];
    // Student cards have name, grade, school
    const studentEls = document.querySelectorAll('[class*="student-card"], [class*="StudentCard"]');
    if (studentEls.length > 0) {
      for (const el of studentEls) {
        const name = el.querySelector('a[href*="Vega"], a[class*="name"], h3, h4, strong')?.textContent?.trim() ?? '';
        const text = el.textContent ?? '';
        const gradeMatch = text.match(/Grade:\s*(\d+)/);
        const schoolMatch = text.match(/(?:Grade:\s*\d+\s*)(.*?)$/m);
        results.push({
          name: name || text.split('\n').filter(l => l.trim())[0]?.trim() ?? '',
          grade: gradeMatch?.[1] ?? '',
          school: schoolMatch?.[1]?.trim() ?? '',
        });
      }
    }
    // Fallback: parse from the page text
    if (results.length === 0) {
      const allText = document.body.textContent ?? '';
      const nameMatch = allText.match(/Welcome to the Aeries Portal for\s+(.+)/);
      if (nameMatch) {
        results.push({ name: nameMatch[1]!.trim(), grade: '', school: '' });
      }
    }
    return results;
  });

  // Extract course rows from the Classes grid
  const courses = await page.evaluate(() => {
    const results: IAeriesCourseExtract[] = [];
    const gridCells = document.querySelectorAll('[role="gridcell"], td[class*="grade"], td[class*="class"]');

    // The dashboard grid typically has rows with: period, course info, grade, missing, past days
    const rows = document.querySelectorAll('tr[class*="class"], tr[data-*], .ClassSummary tr, table tbody tr');
    for (const row of rows) {
      const cells = row.querySelectorAll('td, [role="gridcell"]');
      if (cells.length < 3) continue;

      const periodText = cells[0]?.textContent?.trim() ?? '';
      const courseText = cells[1]?.textContent ?? '';
      const gradeText = cells[2]?.textContent?.trim() ?? '';
      const missingText = cells[3]?.textContent?.trim() ?? '';

      // Skip header rows
      if (!periodText || !/^\d+$/.test(periodText)) continue;

      // Parse course info — "Spanish 1 b Teacher: Casillas, S Room: S110 Spanish 1 b - Quarter 3"
      const teacherMatch = courseText.match(/Teacher:\s*([^R\n]+?)(?:\s*Room:|$)/);
      const roomMatch = courseText.match(/Room:\s*(\S+)/);
      // Course name is the first line or before "Teacher:"
      const nameMatch = courseText.match(/^([^T]+?)(?:\s*Teacher:|$)/);
      // Term from the link text like "Spanish 1 b - Quarter 3"
      const termMatch = courseText.match(/- (Quarter \d+|Semester \d+|[^-]+)$/m);

      // Parse grade — "89 (88.6%)" or "100 (100.0%)"
      const gradeNumMatch = gradeText.match(/(\d+)\s*\((\d+\.?\d*)%\)/);

      results.push({
        period: periodText,
        name: nameMatch?.[1]?.trim().split('\n')[0]?.trim() ?? courseText.split('\n')[0]?.trim() ?? '',
        term: termMatch?.[1]?.trim() ?? '',
        teacher: teacherMatch?.[1]?.trim() ?? '',
        teacherEmail: '',
        room: roomMatch?.[1]?.trim() ?? '',
        currentGrade: gradeNumMatch ? parseInt(gradeNumMatch[1]!, 10) : null,
        currentPercent: gradeNumMatch ? parseFloat(gradeNumMatch[2]!) : null,
        missingCount: parseInt(missingText, 10) || 0,
        assignments: [],
      });
    }
    return results;
  });

  return { students, courses };
}

// ---------------------------------------------------------------------------
// Extract Gradebook Details — per-course assignment-level data
// ---------------------------------------------------------------------------

async function extractGradebookDetails(
  page: Page
): Promise<Map<string, { teacherEmail: string; assignments: IAeriesAssignmentExtract[] }>> {
  // Navigate to Gradebook Details page
  const baseUrl = page.url().replace(/\/student\/.*/, '/student/GradebookDetails.aspx');
  await page.goto(baseUrl, { waitUntil: 'networkidle', timeout: 15000 });
  await page.waitForTimeout(3000);

  const results = new Map<string, { teacherEmail: string; assignments: IAeriesAssignmentExtract[] }>();

  // Get the course dropdown options
  const courseOptions = await page.evaluate(() => {
    const select = document.querySelector('select[id*="DropDown"], select') as HTMLSelectElement | null;
    if (!select) return [];
    return Array.from(select.options).map(o => ({
      value: o.value,
      text: o.text.trim(),
    }));
  });

  console.log(`  Found ${courseOptions.length} course/term entries in dropdown`);

  for (const opt of courseOptions) {
    // Skip future terms (wrapped in << >>)
    if (opt.text.startsWith('<<')) continue;

    console.log(`    Scraping: ${opt.text}`);

    // Select this course in the dropdown
    const dropdown = page.locator('select').first();
    await dropdown.selectOption(opt.value);
    await page.waitForTimeout(2000);
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});

    // Extract teacher email (shown in Options area)
    const teacherEmail = await page.evaluate(() => {
      const emailLink = document.querySelector('a[href*="@"][href*="mailto"], a[href*="@"]');
      if (emailLink) return emailLink.textContent?.trim() ?? '';
      // Fallback: look for email pattern in text
      const text = document.body.textContent ?? '';
      const match = text.match(/[\w.-]+@[\w.-]+\.\w{2,}/);
      return match?.[0] ?? '';
    });

    // Extract assignments from card view or table view
    const assignments = await page.evaluate(() => {
      const results: IAeriesAssignmentExtract[] = [];

      // Strategy 1: Parse assignment cards (default Card View)
      // Each card is in a container with assignment info
      const cards = document.querySelectorAll(
        '[class*="assignment-card"], [class*="AssignmentCard"], ' +
        '[class*="GradebookDetail"] .card, [class*="gradebook-detail"] .card, ' +
        'div[class*="row"] > div[class*="col"]'
      );

      if (cards.length === 0) {
        // Strategy 2: Parse from raw HTML text patterns
        const body = document.body.innerHTML;
        // Assignment pattern in the Aeries card view
        const assignmentBlocks = body.split(/(?=<div[^>]*class="[^"]*[Aa]ssignment)/);

        for (const block of assignmentBlocks) {
          const titleMatch = block.match(/<[^>]*class="[^"]*[Tt]itle[^"]*"[^>]*>([^<]+)/);
          if (!titleMatch) continue;

          const scoreMatch = block.match(/(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)/);
          const percentMatch = block.match(/(\d+(?:\.\d+)?)%/);
          const dueDateMatch = block.match(/Due\s*(?:Date)?:?\s*(\d{2}\/\d{2}\/\d{4})/);
          const assignedMatch = block.match(/(?:Date\s*)?Assigned:?\s*(\d{2}\/\d{2}\/\d{4})/);
          const completedMatch = block.match(/(?:Date\s*)?Completed:?\s*(\d{2}\/\d{2}\/\d{4})/);
          const categoryMatch = block.match(/(?:Formative|Summative)/i);
          const gradingMatch = block.match(/Grading\s*Complete:?\s*(True|False)/i);
          const missingMatch = block.match(/(?:Missing|MSG)/i);

          results.push({
            number: '',
            title: titleMatch[1]!.trim(),
            category: categoryMatch?.[0] ?? '',
            scoreEarned: scoreMatch ? parseFloat(scoreMatch[1]!) : null,
            scorePossible: scoreMatch ? parseFloat(scoreMatch[2]!) : null,
            percentCorrect: percentMatch ? parseFloat(percentMatch[1]!) : null,
            dateAssigned: assignedMatch?.[1] ?? '',
            dateDue: dueDateMatch?.[1] ?? '',
            dateCompleted: completedMatch?.[1] ?? '',
            gradingComplete: gradingMatch?.[1]?.toLowerCase() === 'true',
            isMissing: !!missingMatch,
            comment: '',
          });
        }
      }

      // Strategy 3: Parse the visible text content directly
      if (results.length === 0) {
        const allText = document.body.innerText;
        // Split by assignment number pattern "1 - ", "2 - "
        const parts = allText.split(/(?=\n\d+\s*-\s+[^\n]+)/);
        for (const part of parts) {
          const headerMatch = part.match(/^(\d+)\s*-\s+(.+)/);
          if (!headerMatch) continue;

          const number = headerMatch[1]!;
          const title = headerMatch[2]!.split('\n')[0]!.trim();
          const categoryMatch = part.match(/(Formative|Summative)/i);
          const scoreMatch = part.match(/Score\s*\n?\s*(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)/);
          const percentMatch = part.match(/(\d+(?:\.\d+)?)%/);
          const dueDateMatch = part.match(/Due\s*Date:?\s*(\d{2}\/\d{2}\/\d{4})/);
          const assignedMatch = part.match(/Date\s*Assigned:?\s*(\d{2}\/\d{2}\/\d{4})/);
          const completedMatch = part.match(/Date\s*Completed:?\s*(\d{2}\/\d{2}\/\d{4})/);
          const gradingMatch = part.match(/Grading\s*Complete:?\s*(True|False)/i);
          const missingClass = part.match(/Missing|MSG -|EXC -/i);

          results.push({
            number,
            title,
            category: categoryMatch?.[1] ?? '',
            scoreEarned: scoreMatch ? parseFloat(scoreMatch[1]!) : null,
            scorePossible: scoreMatch ? parseFloat(scoreMatch[2]!) : null,
            percentCorrect: percentMatch ? parseFloat(percentMatch[1]!) : null,
            dateAssigned: assignedMatch?.[1] ?? '',
            dateDue: dueDateMatch?.[1] ?? '',
            dateCompleted: completedMatch?.[1] ?? '',
            gradingComplete: gradingMatch?.[1]?.toLowerCase() === 'true',
            isMissing: !!missingClass,
            comment: '',
          });
        }
      }

      return results;
    });

    // Parse course name from dropdown text: "1- Spanish 1 b- Quarter 3  1/6/2026 - 3/12/2026"
    const courseNameMatch = opt.text.match(/^\d+-\s*(.+?)-\s*(Quarter \d+|Semester \d+|[^1-9]+)\s/);
    const courseName = courseNameMatch?.[1]?.trim() ?? opt.text;

    results.set(courseName, { teacherEmail, assignments });
    console.log(`      → ${assignments.length} assignments, teacher: ${teacherEmail || '(not found)'}`);
  }

  return results;
}

// ---------------------------------------------------------------------------
// Extract Attendance
// ---------------------------------------------------------------------------

async function extractAttendance(page: Page): Promise<IAeriesAttendanceExtract[]> {
  const baseUrl = page.url().replace(/\/student\/.*/, '/student/Attendance.aspx');
  await page.goto(baseUrl, { waitUntil: 'networkidle', timeout: 15000 });
  await page.waitForTimeout(3000);

  const attendance = await page.evaluate(() => {
    const results: IAeriesAttendanceExtract[] = [];

    // Aeries attendance page shows a table or calendar view
    const rows = document.querySelectorAll('table tr, [class*="attendance"] tr');
    for (const row of rows) {
      const cells = row.querySelectorAll('td');
      if (cells.length < 2) continue;

      const texts = Array.from(cells).map(td => td.textContent?.trim() ?? '');

      // Look for rows with date patterns
      const dateText = texts[0] ?? '';
      if (dateText && /\d{1,2}\/\d{1,2}\/\d{4}/.test(dateText)) {
        results.push({
          date: dateText,
          period: texts[1] ?? '',
          status: texts[2] ?? '',
          reason: texts[3] ?? '',
          course: texts[4] ?? '',
        });
      }
    }

    // Fallback: parse from inner text if no table found
    if (results.length === 0) {
      const text = document.body.innerText;
      const lines = text.split('\n');
      for (const line of lines) {
        const match = line.match(/(\d{1,2}\/\d{1,2}\/\d{4})\s+(.+)/);
        if (match) {
          results.push({
            date: match[1]!,
            period: '',
            status: match[2]?.trim() ?? '',
            reason: '',
            course: '',
          });
        }
      }
    }

    return results;
  });

  return attendance;
}

// ---------------------------------------------------------------------------
// Extract student info from Gradebook Details header
// ---------------------------------------------------------------------------

async function extractStudentInfo(page: Page): Promise<{
  studentId: string;
  name: string;
  grade: string;
  school: string;
}> {
  return page.evaluate(() => {
    const text = document.body.innerText;

    // "Christian Vega\nID: 728297 | Grade: 9"
    const idMatch = text.match(/ID:\s*(\d+)/);
    const gradeMatch = text.match(/Grade:\s*(\d+)/);

    // Student name from header
    const nameEl = document.querySelector('[class*="student-name"], h2, [class*="Header"] a');
    let name = nameEl?.textContent?.trim() ?? '';
    if (!name) {
      const headerMatch = text.match(/(?:Welcome to the Aeries Portal for|Gradebook Details\s+)([A-Z][a-z]+ [A-Z][a-z]+)/);
      name = headerMatch?.[1] ?? '';
    }

    // School name
    const schoolMatch = text.match(/([\w\s]+(?:High School|Middle School|Elementary))/);

    return {
      studentId: idMatch?.[1] ?? '',
      name,
      grade: gradeMatch?.[1] ?? '',
      school: schoolMatch?.[1]?.trim() ?? '',
    };
  });
}

// ---------------------------------------------------------------------------
// Check for student selector (multiple kids)
// ---------------------------------------------------------------------------

async function getStudentLinks(page: Page): Promise<Array<{ name: string; url: string }>> {
  // On the dashboard, there may be multiple student cards
  // Each has links to Gradebook, Gradebook Details, Attendance
  return page.evaluate(() => {
    const links: Array<{ name: string; url: string }> = [];
    // Look for student name links that change the active student
    const studentLinks = document.querySelectorAll(
      'a[href*="StudentID"], a[href*="student_id"], ' +
      '[class*="student-name"] a, [class*="StudentCard"] a[class*="name"]'
    );
    for (const link of studentLinks) {
      const name = link.textContent?.trim() ?? '';
      const url = (link as HTMLAnchorElement).href ?? '';
      if (name && url) links.push({ name, url });
    }
    return links;
  });
}

// ---------------------------------------------------------------------------
// Detect student switcher dropdown in header
// ---------------------------------------------------------------------------

async function switchToStudent(page: Page, studentName: string): Promise<boolean> {
  try {
    // Aeries has a student selector dropdown in the header
    // Click the current student name/dropdown to open it
    const dropdown = page.locator('[class*="student-selector"], [class*="StudentDrop"]').first();
    if (await dropdown.count() > 0) {
      await dropdown.click();
      await page.waitForTimeout(1000);
    }

    // Click the target student name
    const studentLink = page.locator(`a:has-text("${studentName}")`).first();
    if (await studentLink.count() > 0) {
      await studentLink.click();
      await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
      await page.waitForTimeout(2000);
      return true;
    }
  } catch {
    // Could not switch
  }
  return false;
}

// ---------------------------------------------------------------------------
// Main scraper
// ---------------------------------------------------------------------------

export async function scrapeAeriesComplete(
  url: string,
  email: string,
  password: string
): Promise<IAeriesFullExtract> {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  });

  mkdirSync(OUTPUT_DIR, { recursive: true });

  try {
    const page = await context.newPage();

    // 1. LOGIN
    console.log('\n1. LOGGING IN');
    await login(page, url, email, password);
    await page.screenshot({ path: `${OUTPUT_DIR}/aeries-dashboard.png`, fullPage: true });

    // 2. EXTRACT DASHBOARD (overview of all students + courses)
    console.log('\n2. EXTRACTING DASHBOARD');
    const { students: studentList, courses: dashboardCourses } = await extractDashboard(page);
    console.log(`  Students: ${studentList.length}`);
    console.log(`  Courses: ${dashboardCourses.length}`);

    // Save dashboard HTML for debugging
    const dashHtml = await page.content();
    writeFileSync(`${OUTPUT_DIR}/aeries-dashboard.html`, dashHtml, 'utf8');

    // 3. For the currently active student, extract detailed data
    const allStudents: IAeriesStudentExtract[] = [];

    // Extract student info from gradebook details page
    console.log('\n3. EXTRACTING GRADEBOOK DETAILS');
    const gradebookData = await extractGradebookDetails(page);
    await page.screenshot({ path: `${OUTPUT_DIR}/aeries-gradebook-details.png`, fullPage: true });

    // Get student info
    const studentInfo = await extractStudentInfo(page);

    // Merge assignment data into courses
    const enrichedCourses = dashboardCourses.map(c => {
      const detail = gradebookData.get(c.name) ?? gradebookData.get(c.name.replace(/\s+b$/, ''));
      // Try fuzzy match
      let bestMatch: { teacherEmail: string; assignments: IAeriesAssignmentExtract[] } | undefined;
      if (!detail) {
        for (const [key, value] of gradebookData.entries()) {
          if (key.includes(c.name.split(' ').slice(0, 2).join(' ')) ||
              c.name.includes(key.split(' ').slice(0, 2).join(' '))) {
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

    // 4. ATTENDANCE
    console.log('\n4. EXTRACTING ATTENDANCE');
    let attendance: IAeriesAttendanceExtract[] = [];
    try {
      attendance = await extractAttendance(page);
      console.log(`  Records: ${attendance.length}`);
      await page.screenshot({ path: `${OUTPUT_DIR}/aeries-attendance.png`, fullPage: true });
    } catch (err) {
      console.log(`  Failed: ${err instanceof Error ? err.message.split('\n')[0] : err}`);
    }

    allStudents.push({
      name: studentInfo.name || (studentList[0]?.name ?? 'Unknown'),
      studentId: studentInfo.studentId,
      grade: studentInfo.grade || (studentList[0]?.grade ?? ''),
      school: studentInfo.school || (studentList[0]?.school ?? ''),
      courses: enrichedCourses,
      attendance,
    });

    // 5. Try to scrape additional students (if multi-student account)
    if (studentList.length > 1) {
      console.log('\n5. CHECKING ADDITIONAL STUDENTS');
      for (let i = 1; i < studentList.length; i++) {
        const studentName = studentList[i]!.name;
        console.log(`  Switching to: ${studentName}`);

        // Navigate back to dashboard and switch student
        await page.goto(page.url().replace(/\/student\/.*/, '/student/Dashboard.aspx'), {
          waitUntil: 'networkidle',
          timeout: 15000,
        });
        await page.waitForTimeout(2000);

        if (await switchToStudent(page, studentName)) {
          const { courses: nextCourses } = await extractDashboard(page);
          const nextGradebook = await extractGradebookDetails(page);
          const nextStudentInfo = await extractStudentInfo(page);
          let nextAttendance: IAeriesAttendanceExtract[] = [];
          try {
            nextAttendance = await extractAttendance(page);
          } catch { /* skip */ }

          const nextEnrichedCourses = nextCourses.map(c => {
            const detail = nextGradebook.get(c.name);
            return {
              ...c,
              teacherEmail: detail?.teacherEmail ?? c.teacherEmail,
              assignments: detail?.assignments ?? [],
            };
          });

          allStudents.push({
            name: nextStudentInfo.name || studentName,
            studentId: nextStudentInfo.studentId,
            grade: nextStudentInfo.grade || (studentList[i]?.grade ?? ''),
            school: nextStudentInfo.school || (studentList[i]?.school ?? ''),
            courses: nextEnrichedCourses,
            attendance: nextAttendance,
          });
        } else {
          console.log(`    Could not switch to ${studentName}`);
        }
      }
    }

    return {
      students: allStudents,
      timestamp: new Date().toISOString(),
    };
  } finally {
    await browser.close();
  }
}

// ---------------------------------------------------------------------------
// CLI + Report
// ---------------------------------------------------------------------------

function printReport(data: IAeriesFullExtract): void {
  const line = '═'.repeat(70);
  console.log(`\n${line}`);
  console.log(`  AERIES FULL EXTRACT`);
  console.log(`  ${data.timestamp}`);
  console.log(line);

  for (const student of data.students) {
    console.log(`\n  STUDENT: ${student.name}`);
    console.log(`    ID: ${student.studentId}  Grade: ${student.grade}  School: ${student.school}`);

    console.log('\n    COURSES & GRADES:');
    for (const c of student.courses) {
      const emailStr = c.teacherEmail ? ` <${c.teacherEmail}>` : '';
      console.log(`\n      Period ${c.period}: ${c.name} (${c.term})`);
      console.log(`        Teacher: ${c.teacher}${emailStr}  Room: ${c.room}`);
      console.log(`        Grade: ${c.currentGrade ?? '?'} (${c.currentPercent ?? '?'}%)  Missing: ${c.missingCount}`);

      if (c.assignments.length > 0) {
        console.log(`        Assignments (${c.assignments.length}):`);
        for (const a of c.assignments) {
          const score = a.scoreEarned !== null ? `${a.scoreEarned}/${a.scorePossible}` : 'N/A';
          const pct = a.percentCorrect !== null ? ` (${a.percentCorrect}%)` : '';
          const missing = a.isMissing ? ' [MISSING]' : '';
          console.log(`          ${a.number || '-'}. ${a.title.padEnd(40)} ${score.padEnd(12)}${pct}${missing}`);
          console.log(`             Due: ${a.dateDue || 'N/A'}  Assigned: ${a.dateAssigned || 'N/A'}  Completed: ${a.dateCompleted || 'N/A'}  Category: ${a.category}`);
        }
      }
    }

    if (student.attendance.length > 0) {
      console.log(`\n    ATTENDANCE (${student.attendance.length} records):`);
      for (const a of student.attendance) {
        console.log(`      ${a.date}  Period ${a.period}  ${a.status}  ${a.course}  ${a.reason}`);
      }
    }
  }

  // Summary
  console.log(`\n${line}`);
  console.log('  TOTALS:');
  for (const student of data.students) {
    const totalAssignments = student.courses.reduce((sum, c) => sum + c.assignments.length, 0);
    const totalMissing = student.courses.reduce((sum, c) => sum + c.missingCount, 0);
    console.log(`    ${student.name}:`);
    console.log(`      Courses: ${student.courses.length}  Assignments: ${totalAssignments}  Missing: ${totalMissing}  Attendance: ${student.attendance.length}`);
  }
  console.log(line);
}

if (require.main === module) {
  if (!AERIES_URL || !AERIES_EMAIL || !AERIES_PASSWORD) {
    console.error('Usage: AERIES_URL=... AERIES_EMAIL=... AERIES_PASSWORD=... npx ts-node src/harness/aeries-browser-scrape.ts');
    console.error('  or:  npx ts-node src/harness/aeries-browser-scrape.ts --url URL --email EMAIL --password PASS');
    process.exit(1);
  }

  console.log('Aeries Browser Scraper');
  console.log(`   ${new Date().toISOString()}\n`);

  scrapeAeriesComplete(AERIES_URL, AERIES_EMAIL, AERIES_PASSWORD)
    .then((result) => {
      printReport(result);

      mkdirSync(OUTPUT_DIR, { recursive: true });
      writeFileSync(`${OUTPUT_DIR}/aeries-full-extract.json`, JSON.stringify(result, null, 2), 'utf8');
      console.log(`\n  Files saved to ${OUTPUT_DIR}/`);
      console.log('    aeries-full-extract.json');
      console.log('    aeries-dashboard.html');
      console.log('    aeries-*.png (screenshots)');
    })
    .catch((err) => {
      console.error('Scrape failed:', err);
      process.exit(1);
    });
}
