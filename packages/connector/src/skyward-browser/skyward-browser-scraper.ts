/* eslint-disable @typescript-eslint/naming-convention, complexity, max-depth, @typescript-eslint/explicit-function-return-type */
/**
 * Skyward Family Access browser scraper.
 * Uses Playwright to log in and extract gradebook, attendance, schedule.
 * Optional IAiClient enables AI fallback when regex/DOM parsing returns empty.
 */

import { chromium, type Page, type Browser, type BrowserContext } from 'playwright';
import type { IAiClient } from './ai-client-interface';
import type { IStrategyStore } from '../strategy';
import { useStrategy, computeFingerprint } from '../strategy';
import type {
  ISkywardFullExtract,
  ISkywardCourseExtract,
  ISkywardAssignmentExtract,
  ISkywardMissingAssignment,
  ISkywardAttendanceExtract,
  ISkywardScheduleEntry,
} from './skyward-browser-transformer';

export interface ISkywardScraperOptions {
  readonly headless?: boolean;
  readonly timeout?: number;
  readonly aiClient?: IAiClient;
  readonly strategyStore?: IStrategyStore;
}

const HEADERS = [
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

const CLASS_DESC_REGEX = /<table\s+id="classDesc_(\d+_\d+_\d+_\d+)"[^>]*>(.*?)<\/table>/gs;

function parseCoursesFromHtml(html: string, tableRegex: RegExp): ISkywardCourseExtract[] {
  const courses: ISkywardCourseExtract[] = [];
  let match;
  const regex = new RegExp(tableRegex.source, 'gs');
  while ((match = regex.exec(html)) !== null) {
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
    courses.push({
      name,
      period: periodM?.[1] ?? '?',
      time: timeM?.[1] ?? '',
      teacher,
      currentGrade: '',
      grades: {},
    });
  }
  return courses;
}

export class SkywardBrowserScraper {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private aiClient: IAiClient | undefined;
  private strategyStore: IStrategyStore | undefined;

  async launch(options?: ISkywardScraperOptions): Promise<void> {
    this.browser = await chromium.launch({
      headless: options?.headless ?? true,
      args: [
        '--disable-dev-shm-usage',
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-gpu',
        '--disable-software-rasterizer',
      ],
    });
    this.context = await this.browser.newContext();
    this.page = await this.context.newPage();
    this.page.setDefaultTimeout(options?.timeout ?? 30000);
    this.aiClient = options?.aiClient;
    this.strategyStore = options?.strategyStore;
  }

  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close().catch(() => {});
      this.browser = null;
      this.context = null;
      this.page = null;
    }
  }

  async authenticate(
    baseUrl: string,
    username: string,
    password: string,
    loginMethod?: 'direct' | 'google_sso'
  ): Promise<{ success: boolean; message?: string }> {
    if (!this.page || !this.context) {
      return { success: false, message: 'Browser not initialized' };
    }

    try {
      const url = baseUrl.replace(/\/$/, '');
      await this.page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });

      // Wait for page to be interactive
      await this.page.waitForTimeout(2000);

      // Select Family/Student Access if dropdown exists (use value instead of label for reliability)
      const dropdown = this.page.locator('select[name="cUserRole"], #cUserRole, select').first();
      if ((await dropdown.count()) > 0) {
        await dropdown.selectOption({ value: 'family/student' }).catch(() => {
          // Fallback to label if value doesn't work
          dropdown.selectOption({ label: 'Family/Student Access' }).catch(() => {});
        });
        await this.page.waitForTimeout(1000);
      }

      // Default to direct password login unless explicitly specified
      // Google SSO must be explicitly requested via loginMethod parameter
      const method = loginMethod ?? 'direct';

      if (method === 'google_sso') {
        const hasGoogleLogin =
          (await this.page
            .locator(
              'input[value="Login with Google"], button:has-text("Login with Google"), a:has-text("Login with Google"), #bGoogleLogin, [onclick*="google"]'
            )
            .count()) > 0;

        if (!hasGoogleLogin) {
          return {
            success: false,
            message: 'Google SSO requested but no Google login button found on page',
          };
        }
        return this.authenticateViaGoogle(username, password);
      }

      return this.authenticateViaPassword(url, username, password);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, message: msg };
    }
  }

  private async authenticateViaPassword(
    _baseUrl: string,
    username: string,
    password: string
  ): Promise<{ success: boolean; message?: string }> {
    if (!this.page || !this.context) {
      return { success: false, message: 'Browser not initialized' };
    }

    // Wait for login fields to be visible
    await this.page.waitForSelector('input[name="login"], #login', { timeout: 10000 });

    // Fill login credentials
    await this.page.locator('input[name="login"], #login').fill(username);
    await this.page.locator('input[name="password"], #password').fill(password);

    let popup: Page | null = null;
    this.context.on('page', (p: Page) => {
      popup = p;
    });

    // Click login button - it might be hidden initially, so use force: true
    await this.page.locator('#bLogin').click({ timeout: 10000, force: true });
    await this.page.waitForTimeout(5000);

    if (popup !== null) {
      const popupPage: Page = popup;
      await popupPage.waitForLoadState('networkidle', { timeout: 15000 });
      this.page = popupPage;
    } else {
      await this.page.waitForLoadState('networkidle');
    }

    const finalUrl = this.page.url();
    if (finalUrl.includes('seplog')) {
      return { success: false, message: `Login may have failed. Current URL: ${finalUrl}` };
    }
    return { success: true };
  }

  private async authenticateViaGoogle(
    username: string,
    password: string
  ): Promise<{ success: boolean; message?: string }> {
    if (!this.page) return { success: false, message: 'Browser not initialized' };

    const googleBtn = this.page
      .locator(
        'input[value="Login with Google"], button:has-text("Login with Google"), a:has-text("Login with Google"), #bGoogleLogin, [onclick*="google"]'
      )
      .first();
    await googleBtn.click({ timeout: 10000 });
    await this.page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});

    if (this.page.url().includes('accounts.google.com')) {
      await this.page.waitForSelector('input[type="email"], input[name="identifier"]', {
        timeout: 15000,
      });
      await this.page.fill('input[type="email"], input[name="identifier"]', username);
      await this.page.click('button:has-text("Next"), #identifierNext button');

      await this.page.waitForSelector('input[type="password"], input[name="Passwd"]', {
        timeout: 10000,
      });
      await this.page.fill('input[type="password"], input[name="Passwd"]', password);
      await this.page.click('button:has-text("Next"), #passwordNext button');

      await this.page.waitForURL((url) => !url.hostname.includes('accounts.google.com'), {
        timeout: 30000,
      });
    }

    await this.page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});

    const finalUrl = this.page.url();
    if (finalUrl.includes('seplog') || finalUrl.includes('accounts.google.com')) {
      return {
        success: false,
        message: `Google SSO login may have failed. Current URL: ${finalUrl}`,
      };
    }
    return { success: true };
  }

  async extractAll(): Promise<ISkywardFullExtract> {
    if (!this.page) throw new Error('Browser not initialized');

    const studentName = await this.extractStudentName(this.page);
    const schoolName = await this.extractSchoolName(this.page);

    const { courses, assignments, missingAssignments } = await this.extractGradebook(this.page);
    let attendance: ISkywardAttendanceExtract[] = [];
    let schedule: ISkywardScheduleEntry[] = [];

    try {
      attendance = await this.extractAttendance(this.page);
    } catch {
      // continue
    }
    try {
      schedule = await this.extractSchedule(this.page);
    } catch {
      // continue
    }

    return {
      student: studentName,
      school: schoolName,
      courses,
      missingAssignments,
      assignments,
      attendance,
      schedule,
      timestamp: new Date().toISOString(),
    };
  }

  private async navigateTo(page: Page, linkText: string): Promise<boolean> {
    try {
      const navLink = page
        .locator(
          `#sf_NavBarWrap a:has-text("${linkText}"), .sf_navBar a:has-text("${linkText}"), nav a:has-text("${linkText}")`
        )
        .first();
      if ((await navLink.count()) > 0) {
        await navLink.click({ timeout: 5000 });
      } else {
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
    } catch {
      return false;
    }
  }

  private async extractStudentName(page: Page): Promise<string> {
    return page.evaluate(() => {
      const el = document.querySelector('.sf_headerName, [id*="studentName"]');
      if (el) return el.textContent?.trim() ?? '';
      const header = document.querySelector('#sf_HeaderWrap, header, [role="banner"]');
      if (header) {
        const headerText = header.textContent ?? '';
        const nameMatch = headerText.match(/([A-Z][a-z]+\s+[A-Z]\.?\s*[A-Z][a-z]+)/);
        if (nameMatch) return nameMatch[1]!;
      }
      const topNav = Array.from(document.querySelectorAll('a, span'));
      for (const node of topNav) {
        const text = node.textContent?.trim() ?? '';
        if (text.match(/^[A-Z][a-z]+ [A-Z][a-z]+$/) && text.length < 40) return text;
      }
      return 'Unknown';
    });
  }

  private async extractSchoolName(page: Page): Promise<string> {
    return page.evaluate(() => {
      const el = document.querySelector('[id*="schoolName"]');
      if (el) return el.textContent?.trim() ?? '';
      const allText = document.body?.textContent ?? '';
      const schoolMatch = allText.match(
        /(LAKE DALLAS HIGH SCHOOL|[A-Z ]{10,}(?:HIGH|MIDDLE|ELEMENTARY) SCHOOL)/
      );
      return schoolMatch?.[1] ?? 'Unknown School';
    });
  }

  private hasGradeRelatedContent(html: string): boolean {
    const lower = html.toLowerCase();
    return (
      lower.includes('grade') ||
      lower.includes('class') ||
      lower.includes('period') ||
      lower.includes('course') ||
      lower.includes('teacher')
    );
  }

  private getCourseSchema(): string {
    return 'courses: array of { name: string, period: string, time?: string, teacher?: string, currentGrade?: string, grades?: object }';
  }

  private getAssignmentSchema(): string {
    return 'assignments: array of { title: string, course: string, period: string, category?: string, dueDate?: string, pointsEarned?: string, pointsPossible?: string, grade?: string, status?: string }';
  }

  private getAttendanceSchema(): string {
    return 'attendance: array of { date: string, status: string, period?: string, course?: string, reason?: string }';
  }

  private getScheduleSchema(): string {
    return 'schedule: array of { period: string, time?: string, course: string, teacher?: string, room?: string }';
  }

  private async extractGradebook(page: Page): Promise<{
    courses: ISkywardCourseExtract[];
    assignments: ISkywardAssignmentExtract[];
    missingAssignments: ISkywardMissingAssignment[];
  }> {
    await this.navigateTo(page, 'Gradebook');
    await page.waitForTimeout(3000);

    const html = await page.content();

    let courses: ISkywardCourseExtract[] = [];
    try {
      courses = await useStrategy({
        extractionId: 'skyward:gradebook:courses',
        platform: 'skyward',
        store: this.strategyStore,
        tryCached: async (strategy) => {
          const regexStep = strategy.selectors.find((s) => s.type === 'regex');
          if (!regexStep) return null;
          const regex = new RegExp(regexStep.value, 'gs');
          const result = parseCoursesFromHtml(html, regex);
          return result.length > 0 ? result : null;
        },
        tryNormal: async () => {
          const result = parseCoursesFromHtml(html, CLASS_DESC_REGEX);
          return result.length > 0
            ? {
                data: result,
                selectors: [{ type: 'regex' as const, value: CLASS_DESC_REGEX.source }],
              }
            : null;
        },
        tryAi:
          this.aiClient && this.hasGradeRelatedContent(html)
            ? async (schema) => {
                const parsed = await this.aiClient!.parseHtml(html, schema);
                const arr = Array.isArray(parsed['courses']) ? parsed['courses'] : [];
                const data: ISkywardCourseExtract[] = [];
                for (const row of arr) {
                  const r = row as Record<string, unknown>;
                  data.push({
                    name: String(r['name'] ?? r['courseName'] ?? ''),
                    period: String(r['period'] ?? '?'),
                    time: String(r['time'] ?? ''),
                    teacher: String(r['teacher'] ?? ''),
                    currentGrade: String(r['currentGrade'] ?? r['grade'] ?? ''),
                    grades: (r['grades'] as Record<string, string>) ?? {},
                  });
                }
                return data.length > 0
                  ? { data, selectors: [{ type: 'ai' as const, value: schema }] }
                  : null;
              }
            : undefined,
        aiSchema: this.getCourseSchema(),
        htmlFingerprint: computeFingerprint(html),
      });
    } catch {
      courses = [];
    }

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
        if (values.length !== HEADERS.length) continue;

        const filledCount = values.filter((v) => v && v !== 'X').length;
        const hasNum = values.some((v) => /^\d+$/.test(v));
        if (hasNum && filledCount >= 2) {
          summaryRows.push(values);
        }
      }

      for (let i = 0; i < courses.length && i < summaryRows.length; i++) {
        const row = summaryRows[i]!;
        const grades: Record<string, string> = {};
        for (let j = 0; j < HEADERS.length; j++) {
          if (row[j] && row[j] !== 'X') grades[HEADERS[j]!] = row[j]!;
        }
        const currentGrade =
          grades['3RD'] ?? grades['SM1'] ?? grades['2ND'] ?? grades['PR3'] ?? grades['PR1'] ?? '?';
        courses[i] = { ...courses[i]!, grades, currentGrade };
      }
    }

    if (
      gridIdx > 0 &&
      courses.length > 0 &&
      courses.every((c) => !c.currentGrade) &&
      this.aiClient
    ) {
      try {
        const gridHtml = html.slice(gridIdx, gridIdx + 30000);
        const parsed = await this.aiClient.parseHtml(
          gridHtml,
          'gradeRows: array of objects mapping column headers (PR1, 1ST, PR2, 2ND, EX1, SM1, PR3, 3RD, PR4, 4TH, EX2, SM2, FIN) to grade values; currentGrade: string for latest period'
        );
        const rows = Array.isArray(parsed['gradeRows']) ? parsed['gradeRows'] : [];
        for (let i = 0; i < courses.length && i < rows.length; i++) {
          const row = rows[i] as Record<string, unknown> | undefined;
          if (!row) continue;
          const grades: Record<string, string> = {};
          for (const h of HEADERS) {
            const v = row[h];
            if (v !== undefined && v !== null && String(v).trim() && String(v) !== 'X') {
              grades[h] = String(v);
            }
          }
          const currentGrade =
            grades['3RD'] ?? grades['SM1'] ?? (row['currentGrade'] as string) ?? '?';
          courses[i] = { ...courses[i]!, grades, currentGrade };
        }
        if (courses.some((c) => c.currentGrade)) {
          console.warn('[SkywardBrowserScraper] AI fallback recovered grade grid');
        }
      } catch {
        // keep existing course grades
      }
    }

    const missingAssignments: ISkywardMissingAssignment[] = [];
    const showAll = page.locator('a:has-text("Show All"), button:has-text("Show All")').first();
    if ((await showAll.count()) > 0) {
      await showAll.click();
      await page.waitForTimeout(2000);
    }

    const html2 = await page.content();
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

    if (missingAssignments.length === 0) {
      const simpleRegex =
        /showAssignmentInfo[^>]*>([^<]+)<\/a>.*?<a[^>]*>([^<]+)<\/a>\s*(?:&nbsp;)?\s*<span[^>]*>\(Period\s*(?:&nbsp;)?<b>(\d+[A-Z]?)<\/b>/gs;
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

    const allAssignments: ISkywardAssignmentExtract[] = [];
    for (const course of courses) {
      const courseAssignments = await this.extractAssignmentsForCourse(page, course, html2);
      allAssignments.push(...courseAssignments);
    }

    const withoutDate = allAssignments.filter((a) => !a.dueDate);
    if (withoutDate.length > 0) {
      console.warn(
        `[SkywardBrowserScraper] Data quality: ${withoutDate.length}/${allAssignments.length} assignments have no due date`
      );
    }

    return { courses, assignments: allAssignments, missingAssignments };
  }

  private parseAssignmentTableFromHtml(
    html: string,
    courseName: string,
    period: string
  ): ISkywardAssignmentExtract[] {
    const results: ISkywardAssignmentExtract[] = [];
    const tableStart = html.indexOf('id="stuAssignmentSummaryGrid"');
    if (tableStart < 0) return results;

    const tableHtml = html.slice(tableStart);
    const trRegex = /<tr[^>]*>(.*?)<\/tr>/gs;
    let trMatch;
    let isFirst = true;
    while ((trMatch = trRegex.exec(tableHtml)) !== null) {
      if (isFirst) {
        isFirst = false;
        continue;
      }
      const tdRegex = /<td[^>]*>(.*?)<\/td>/gs;
      const cells: string[] = [];
      let tdMatch;
      while ((tdMatch = tdRegex.exec(trMatch[1]!)) !== null) {
        const text = tdMatch[1]!
          .replace(/<[^>]+>/g, '')
          .replace(/&nbsp;/g, ' ')
          .replace(/\u00a0/g, ' ')
          .trim();
        cells.push(text);
      }
      if (cells.length < 4) continue;
      const title = cells[0]?.trim() ?? '';
      if (!title || title.toLowerCase() === 'assignment') continue;
      const category = cells[1]?.trim() ?? '';
      const dueDate = cells[2]?.trim() ?? '';
      const pointsEarned = cells[3]?.trim() ?? '';
      const pointsPossible = cells.length > 4 ? (cells[4]?.trim() ?? '') : '';
      const grade = cells.length > 5 ? (cells[5]?.trim() ?? '') : pointsEarned;
      const status: 'graded' | 'missing' | 'late' | 'unknown' =
        pointsEarned && /^\d+(\.\d+)?$/.test(pointsEarned) ? 'graded' : 'missing';
      results.push({
        title,
        course: courseName,
        period,
        category,
        dueDate,
        pointsEarned,
        pointsPossible,
        grade,
        status,
      });
    }
    return results;
  }

  private async extractAssignmentsForCourse(
    page: Page,
    course: ISkywardCourseExtract,
    currentHtml: string
  ): Promise<ISkywardAssignmentExtract[]> {
    const courseLink = page.locator(`a:has-text("${course.name}")`).first();

    if ((await courseLink.count()) === 0) {
      return this.parseAssignmentTableFromHtml(currentHtml, course.name, course.period);
    }

    try {
      await courseLink.click({ timeout: 5000 });
      await page.waitForTimeout(2000);
      await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});

      const detailHtml = await page.content();
      const assignments = this.parseAssignmentTableFromHtml(detailHtml, course.name, course.period);

      if (
        assignments.length === 0 &&
        detailHtml.includes('stuAssignmentSummaryGrid') &&
        this.aiClient
      ) {
        try {
          const tableStart = detailHtml.indexOf('stuAssignmentSummaryGrid');
          const snippet = detailHtml.slice(tableStart, tableStart + 25000);
          const parsed = await this.aiClient.parseHtml(snippet, this.getAssignmentSchema());
          const arr = Array.isArray(parsed['assignments']) ? parsed['assignments'] : [];
          for (const row of arr) {
            const r = row as Record<string, unknown>;
            assignments.push({
              title: String(r['title'] ?? ''),
              course: course.name,
              period: course.period,
              category: String(r['category'] ?? ''),
              dueDate: String(r['dueDate'] ?? ''),
              pointsEarned: String(r['pointsEarned'] ?? ''),
              pointsPossible: String(r['pointsPossible'] ?? ''),
              grade: String(r['grade'] ?? r['pointsEarned'] ?? ''),
              status: (r['status'] as 'graded' | 'missing' | 'late' | 'unknown') ?? 'unknown',
            });
          }
          if (assignments.length > 0) {
            console.warn(
              `[SkywardBrowserScraper] AI fallback recovered assignments for ${course.name}`
            );
          }
        } catch {
          // keep assignments empty
        }
      }

      await this.navigateTo(page, 'Gradebook');
      await page.waitForTimeout(1000);

      return assignments;
    } catch (err) {
      console.warn(
        `[SkywardBrowserScraper] Failed to extract assignments for ${course.name}:`,
        err
      );
      return [];
    }
  }

  private async extractAttendance(page: Page): Promise<ISkywardAttendanceExtract[]> {
    await this.navigateTo(page, 'Attendance');
    await page.waitForTimeout(3000);

    const results = await page.evaluate(() => {
      const results: Array<{
        date: string;
        period: string;
        status: string;
        course: string;
        reason: string;
      }> = [];
      const tables = Array.from(document.querySelectorAll('table'));
      for (const table of tables) {
        const headerText = table.querySelector('tr')?.textContent ?? '';
        if (!headerText.includes('Attendance') || !headerText.includes('Period')) continue;

        const trs = table.querySelectorAll('tr');
        for (let i = 1; i < trs.length; i++) {
          const tds = trs[i]!.querySelectorAll('td');
          if (tds.length >= 3) {
            const texts = Array.from(tds).map(
              (td: Element) => (td as HTMLElement).textContent?.trim() ?? ''
            );
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

    if (results.length === 0 && this.aiClient) {
      try {
        const html = await page.content();
        if (html.toLowerCase().includes('attendance') || html.includes('table')) {
          const parsed = await this.aiClient.parseHtml(html, this.getAttendanceSchema());
          const arr = Array.isArray(parsed['attendance']) ? parsed['attendance'] : [];
          for (const row of arr) {
            const r = row as Record<string, unknown>;
            results.push({
              date: String(r['date'] ?? ''),
              status: String(r['status'] ?? ''),
              period: String(r['period'] ?? ''),
              course: String(r['course'] ?? ''),
              reason: String(r['reason'] ?? ''),
            });
          }
          if (results.length > 0) {
            console.warn('[SkywardBrowserScraper] AI fallback recovered attendance');
          }
        }
      } catch {
        // keep results empty
      }
    }

    return results;
  }

  private async extractSchedule(page: Page): Promise<ISkywardScheduleEntry[]> {
    await this.navigateTo(page, 'Schedule');
    await page.waitForTimeout(3000);

    const results = await page.evaluate(() => {
      const results: Array<{
        period: string;
        time: string;
        course: string;
        teacher: string;
        room: string;
      }> = [];
      const tables = Array.from(document.querySelectorAll('table'));

      for (const table of tables) {
        const headerRow = table.querySelector('tr');
        const headerText = headerRow?.textContent ?? '';
        if (!headerText.includes('Term') && !headerText.includes('2025')) continue;

        const rows = table.querySelectorAll('tr');
        for (let i = 1; i < rows.length; i++) {
          const tds = rows[i]!.querySelectorAll('td, th');
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

    if (results.length === 0 && this.aiClient) {
      try {
        const html = await page.content();
        if (
          html.toLowerCase().includes('schedule') ||
          html.includes('period') ||
          html.includes('table')
        ) {
          const parsed = await this.aiClient.parseHtml(html, this.getScheduleSchema());
          const arr = Array.isArray(parsed['schedule']) ? parsed['schedule'] : [];
          for (const row of arr) {
            const r = row as Record<string, unknown>;
            results.push({
              period: String(r['period'] ?? ''),
              time: String(r['time'] ?? ''),
              course: String(r['course'] ?? ''),
              teacher: String(r['teacher'] ?? ''),
              room: String(r['room'] ?? ''),
            });
          }
          if (results.length > 0) {
            console.warn('[SkywardBrowserScraper] AI fallback recovered schedule');
          }
        }
      } catch {
        // keep results empty
      }
    }

    return results;
  }
}
