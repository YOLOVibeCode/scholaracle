#!/usr/bin/env npx ts-node --transpile-only
/**
 * Canvas Browser Scraper — uses Playwright to log into Canvas via Google SSO
 * and extract data from the dashboard and course pages.
 *
 * For districts (like LDISD) that use Google SAML SSO instead of API tokens.
 *
 * Usage:
 *   CANVAS_URL="https://ldisd.instructure.com" \
 *   CANVAS_GOOGLE_EMAIL="29alewis@ldisd.net" \
 *   CANVAS_GOOGLE_PASSWORD="avalewisldhs" \
 *     npx ts-node src/harness/canvas-browser-scrape.ts
 *
 * Options:
 *   --skip-downloads    Extract file list but do not download (faster)
 *   --full              Full sync: re-download all files (ignore incremental state)
 *   CANVAS_SKIP_DOWNLOADS=1   Same as --skip-downloads
 *   CANVAS_FULL_SYNC=1        Same as --full
 *
 * Incremental: By default, skips files already in harness-output/canvas-sync-state.json.
 * Run early morning on client machine: ./canvas-sync-morning.sh (or via cron)
 */

import { chromium, type Page } from 'playwright';
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const ARGS = process.argv.filter((a) => a !== '--');
function getCliArg(name: string): string | undefined {
  const idx = ARGS.indexOf(name);
  return idx >= 0 && idx + 1 < ARGS.length ? ARGS[idx + 1] : undefined;
}

const CANVAS_URL = process.env['CANVAS_URL'] ?? getCliArg('--url') ?? '';
const GOOGLE_EMAIL = process.env['CANVAS_GOOGLE_EMAIL'] ?? getCliArg('--email') ?? '';
const GOOGLE_PASSWORD = process.env['CANVAS_GOOGLE_PASSWORD'] ?? getCliArg('--password') ?? '';
const SKIP_DOWNLOADS = process.env['CANVAS_SKIP_DOWNLOADS'] === '1' || ARGS.includes('--skip-downloads');
const FULL_SYNC = process.env['CANVAS_FULL_SYNC'] === '1' || ARGS.includes('--full');

const SYNC_STATE_PATH = join('harness-output', 'canvas-sync-state.json');

// ---------------------------------------------------------------------------
// Incremental sync state (persisted between runs)
// ---------------------------------------------------------------------------

export interface ICanvasSyncState {
  lastSync: string; // ISO8601
  downloadedFiles: Record<string, string>; // url or "courseId:fileId" -> localPath
}

function loadSyncState(): ICanvasSyncState | null {
  if (FULL_SYNC || !existsSync(SYNC_STATE_PATH)) return null;
  try {
    const raw = readFileSync(SYNC_STATE_PATH, 'utf8');
    return JSON.parse(raw) as ICanvasSyncState;
  } catch {
    return null;
  }
}

function saveSyncState(state: ICanvasSyncState): void {
  mkdirSync(dirname(SYNC_STATE_PATH), { recursive: true });
  writeFileSync(SYNC_STATE_PATH, JSON.stringify(state, null, 2), 'utf8');
}

function fileKey(file: ICanvasBrowserFile): string {
  const id = file.id ?? (file.url.match(/\/files\/(\d+)/)?.[1] ?? file.url);
  return id;
}

// ---------------------------------------------------------------------------
// Output types
// ---------------------------------------------------------------------------

export interface ICanvasBrowserExtract {
  user: string;
  courses: ICanvasBrowserCourse[];
  toDoItems: ICanvasBrowserToDoItem[];
  upcomingEvents: ICanvasBrowserEvent[];
  announcements: ICanvasBrowserAnnouncement[];
  timestamp: string;
}

export interface ICanvasBrowserCourse {
  id: string;
  name: string;
  courseCode: string;
  period?: string;
  teacher?: string;
  url: string;
  grade?: string;
  assignments: ICanvasBrowserAssignment[];
  modules: ICanvasBrowserModule[];
  files: ICanvasBrowserFile[];
}

export interface ICanvasBrowserFile {
  name: string;
  url: string;
  id?: string; // Canvas file ID for incremental tracking
  size?: string;
  contentType?: string;
  localPath?: string;
}

export interface ICanvasBrowserAssignment {
  name: string;
  dueDate?: string;
  points?: string;
  status?: string;
  attachments?: ICanvasBrowserFile[];
}

export interface ICanvasBrowserModule {
  name: string;
  items: string[];
}

export interface ICanvasBrowserToDoItem {
  title: string;
  course: string;
  dueDate?: string;
}

export interface ICanvasBrowserEvent {
  title: string;
  date: string;
  course?: string;
}

export interface ICanvasBrowserAnnouncement {
  title: string;
  course: string;
  date?: string;
}

// ---------------------------------------------------------------------------
// Google SSO Login
// ---------------------------------------------------------------------------

async function loginViaGoogle(page: Page, email: string, password: string): Promise<void> {
  // Wait for Google sign-in page
  await page.waitForSelector('input[type="email"], input[name="identifier"]', { timeout: 15000 });
  await page.fill('input[type="email"], input[name="identifier"]', email);
  await page.click('button:has-text("Next"), #identifierNext button');

  // Password step
  await page.waitForSelector('input[type="password"], input[name="password"]', { timeout: 10000 });
  await page.fill('input[type="password"], input[name="password"]', password);
  await page.click('button:has-text("Next"), #passwordNext button');

  // Wait for redirect back to Canvas (or any non-Google URL)
  await page.waitForURL((url) => !url.hostname.includes('accounts.google.com'), { timeout: 30000 });
}

// ---------------------------------------------------------------------------
// Extract Dashboard
// ---------------------------------------------------------------------------

async function extractDashboard(page: Page): Promise<{
  user: string;
  toDoItems: ICanvasBrowserToDoItem[];
  upcomingEvents: ICanvasBrowserEvent[];
  announcements: ICanvasBrowserAnnouncement[];
}> {
  const user = await page.evaluate(() => {
    const el = document.querySelector('#global_nav_profile_link, [data-testid="global_nav_profile_link"]');
    return el?.getAttribute('title') ?? el?.textContent?.trim() ?? 'Unknown';
  });

  const toDoItems: ICanvasBrowserToDoItem[] = await page.evaluate(() => {
    const items: ICanvasBrowserToDoItem[] = [];
    const list = document.querySelector('#planner-todos, .to-do-list, [class*="Todo"]');
    if (!list) return items;
    const rows = list.querySelectorAll('li, [role="listitem"], .todo');
    for (const row of rows) {
      const titleEl = row.querySelector('a, [class*="title"]');
      const courseEl = row.querySelector('[class*="course"], [class*="context"]');
      const dateEl = row.querySelector('[class*="date"], time');
      const title = titleEl?.textContent?.trim();
      if (title) {
        items.push({
          title,
          course: courseEl?.textContent?.trim() ?? '',
          dueDate: dateEl?.getAttribute('datetime') ?? dateEl?.textContent?.trim(),
        });
      }
    }
    return items;
  });

  const upcomingEvents: ICanvasBrowserEvent[] = await page.evaluate(() => {
    const items: ICanvasBrowserEvent[] = [];
    const list = document.querySelector('#planner-events, .upcoming-events, [class*="Upcoming"]');
    if (!list) return items;
    const rows = list.querySelectorAll('li, [role="listitem"], .event');
    for (const row of rows) {
      const titleEl = row.querySelector('a, [class*="title"]');
      const dateEl = row.querySelector('[class*="date"], time');
      const courseEl = row.querySelector('[class*="course"], [class*="context"]');
      const title = titleEl?.textContent?.trim();
      if (title) {
        items.push({
          title,
          date: dateEl?.getAttribute('datetime') ?? dateEl?.textContent?.trim() ?? '',
          course: courseEl?.textContent?.trim(),
        });
      }
    }
    return items;
  });

  const announcements: ICanvasBrowserAnnouncement[] = await page.evaluate(() => {
    const items: ICanvasBrowserAnnouncement[] = [];
    const list = document.querySelector('#announcements, .announcements, [class*="Announcement"]');
    if (!list) return items;
    const rows = list.querySelectorAll('li, article, .announcement');
    for (const row of rows) {
      const titleEl = row.querySelector('a, [class*="title"]');
      const courseEl = row.querySelector('[class*="course"], [class*="context"]');
      const dateEl = row.querySelector('time, [class*="date"]');
      const title = titleEl?.textContent?.trim();
      if (title) {
        items.push({
          title,
          course: courseEl?.textContent?.trim() ?? '',
          date: dateEl?.getAttribute('datetime') ?? dateEl?.textContent?.trim(),
        });
      }
    }
    return items;
  });

  return { user, toDoItems, upcomingEvents, announcements };
}

// ---------------------------------------------------------------------------
// Navigate to Courses page and extract full list
// ---------------------------------------------------------------------------

async function navigateToCoursesPage(page: Page, baseUrl: string): Promise<void> {
  const coursesUrl = baseUrl.replace(/\/$/, '') + '/courses';
  const currentPath = new URL(page.url()).pathname;
  if (currentPath.startsWith('/courses') && !currentPath.match(/\/courses\/\d+/)) {
    return; // Already on courses list
  }
  await page.goto(coursesUrl, { waitUntil: 'networkidle', timeout: 15000 });
  await page.waitForTimeout(2000);
}

async function extractCourseList(page: Page, baseUrl: string): Promise<ICanvasBrowserCourse[]> {
  const courses: ICanvasBrowserCourse[] = await page.evaluate((url) => {
    const result: Array<{ id: string; name: string; code: string; period: string; teacher: string; href: string }> = [];
    const links = document.querySelectorAll('a[href*="/courses/"]');
    const seen = new Set<string>();
    for (const a of links) {
      const href = a.getAttribute('href') ?? '';
      const m = href.match(/\/courses\/(\d+)/);
      if (!m) continue;
      const id = m[1]!;
      if (seen.has(id)) continue;
      const fullText = a.textContent?.trim() ?? '';
      if (!fullText || fullText.length < 2) continue;
      seen.add(id);

      // Parse "algebra (p04 - ALGEBRA 1 - Chang)" or "p04 - ALGEBRA 1 - Chang" (when link shows subtitle)
      let name = fullText;
      let code = '';
      let period = '';
      let teacher = '';
      const parenMatch = fullText.match(/^(.+?)\s*\((.+)\)\s*$/);
      if (parenMatch) {
        name = parenMatch[1]!.trim().toLowerCase();
        const inner = parenMatch[2]!;
        const parts = inner.split(/\s*-\s*/).map((p) => p.trim());
        if (parts.length >= 1) period = parts[0]!;
        if (parts.length >= 2) code = parts[1]!;
        if (parts.length >= 3) teacher = parts.slice(2).join(' - ');
      } else {
        // Format "p04 - ALGEBRA 1 - Chang" or "ENGLISH 1 - Starnes"
        const parts = fullText.split(/\s*-\s*/).map((p) => p.trim());
        const hasPeriod = parts[0]?.match(/^p\d+[A-Z]?$/i);
        if (hasPeriod && parts.length >= 1) period = parts[0]!;
        if (parts.length >= 2) code = hasPeriod ? parts[1]! : parts[0]!;
        if (parts.length >= 1) name = (hasPeriod && parts[1] ? parts[1]! : parts[0]!).toLowerCase();
        if (parts.length >= 3) teacher = parts.slice(2).join(' - ');
        else if (parts.length === 2 && hasPeriod) teacher = parts[1]!;
        else if (parts.length === 2 && !hasPeriod) teacher = parts[1]!;
      }

      result.push({ id, name, code, period, teacher, href });
    }
    return result;
  }, baseUrl);

  return courses.map((c) => ({
    id: c.id,
    name: c.name,
    courseCode: c.code,
    period: c.period || undefined,
    teacher: c.teacher || undefined,
    url: c.href.startsWith('http') ? c.href : baseUrl + c.href,
    assignments: [],
    modules: [],
    files: [],
  }));
}

// ---------------------------------------------------------------------------
// Extract Files from course Files page
// ---------------------------------------------------------------------------

async function extractCourseFiles(page: Page, course: ICanvasBrowserCourse, baseUrl: string): Promise<ICanvasBrowserFile[]> {
  try {
    // Try Canvas API first (works when logged in via browser - same session)
    let files: ICanvasBrowserFile[] = [];
    try {
      const apiFiles = await page.evaluate(async (cid) => {
        const res = await fetch(`/api/v1/courses/${cid}/files?per_page=200`);
        if (!res.ok) return [];
        const json = await res.json();
        const list = Array.isArray(json) ? json : (json as { files?: unknown[] })?.files ?? [];
        return list.map((f: { id?: number; display_name?: string; filename?: string; url?: string; size?: number }) => {
          let url = f.url ?? '';
          if (url && !url.includes('download')) url = url.replace(/\?.*$/, '') + '/download';
          return { id: f.id != null ? String(f.id) : undefined, name: f.display_name || f.filename || 'file', url, size: f.size ? String(f.size) : undefined };
        }).filter((x: { url: string }) => x.url);
      }, course.id);
      files = apiFiles;
    } catch {
      // Fallback to DOM scraping
    }

    if (files.length === 0) {
      const filesUrl = `${baseUrl.replace(/\/$/, '')}/courses/${course.id}/files`;
      await page.goto(filesUrl, { waitUntil: 'networkidle', timeout: 15000 });
      await page.waitForTimeout(2000);
      const allFilesLink = page.locator('a:has-text("All files"), a[href*="/files?preview="]').first();
      if (await allFilesLink.count() > 0) {
        await allFilesLink.click().catch(() => {});
        await page.waitForTimeout(1500);
      }
      files = await page.evaluate((origin) => {
      const result: Array<{ id?: string; name: string; url: string; size?: string }> = [];
      const seen = new Set<string>();
      document.querySelectorAll('a[href*="/files/"]').forEach((a) => {
        const href = a.getAttribute('href') ?? '';
        if (href.includes('folder')) return;
        const m = href.match(/\/files\/(\d+)/);
        if (!m) return;
        const fileId = m[1];
        const name = (a.textContent?.trim() || a.getAttribute('aria-label') || href.split('/').pop() || `file-${fileId}`).replace(/\s+/g, ' ').trim();
        if (!name || name.length < 2) return;
        const fullUrl = href.startsWith('http') ? href : origin + (href.startsWith('/') ? '' : '/') + href;
        const url = fullUrl.includes('download') ? fullUrl : fullUrl.replace(/\?.*$/, '').replace(/\/?$/, '') + '/download';
        const key = url + name;
        if (seen.has(key)) return;
        seen.add(key);
        const row = a.closest('tr, .ef-item-row, .ig-row, [role="row"]');
        result.push({ id: fileId, name, url, size: row?.querySelector('[class*="size"], .ef-size')?.textContent?.trim() });
      });
      return result;
    }, baseUrl.replace(/\/$/, ''));
    }

    return files;
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Download files using page request (preserves auth cookies)
// ---------------------------------------------------------------------------

function sanitizeFilename(name: string): string {
  return name.replace(/[<>:"/\\|?*]/g, '_').replace(/\s+/g, ' ').trim().slice(0, 200) || 'file';
}

async function downloadFiles(
  page: Page,
  files: ICanvasBrowserFile[],
  outputDir: string,
  state: ICanvasSyncState | null
): Promise<{ downloaded: number; skipped: number }> {
  let downloaded = 0;
  let skipped = 0;
  for (const file of files) {
    const key = fileKey(file);
    if (state?.downloadedFiles[key] && existsSync(state.downloadedFiles[key])) {
      file.localPath = state.downloadedFiles[key];
      skipped++;
      continue;
    }
    try {
      const response = await page.request.get(file.url, { timeout: 30000 });
      if (!response.ok) continue;
      const buffer = await response.body();
      const filename = sanitizeFilename(file.name) || `file-${Date.now()}`;
      const ext = filename.includes('.') ? '' : (file.contentType?.match(/\/(\w+)/)?.[1] ? `.${file.contentType!.match(/\/(\w+)/)![1]}` : '');
      const path = join(outputDir, filename + ext);
      mkdirSync(outputDir, { recursive: true });
      writeFileSync(path, buffer);
      file.localPath = path;
      if (state) state.downloadedFiles[key] = path;
      downloaded++;
    } catch {
      // Skip failed downloads
    }
  }
  return { downloaded, skipped };
}

// ---------------------------------------------------------------------------
// Extract Course Detail (assignments, modules, files)
// ---------------------------------------------------------------------------

async function extractCourseDetail(page: Page, course: ICanvasBrowserCourse, baseUrl: string, state: ICanvasSyncState | null): Promise<ICanvasBrowserCourse> {
  try {
    await page.goto(course.url, { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForTimeout(1500);

    const assignmentsWithUrls = await page.evaluate(() => {
      const items: Array<{ name: string; dueDate?: string; points?: string; status?: string; url?: string }> = [];
      const rows = document.querySelectorAll('.assignment, [class*="Assignment"], tr.assignment');
      for (const row of rows) {
        const nameEl = row.querySelector('a[href*="assignments"], .assignment_name, [class*="title"]');
        const dateEl = row.querySelector('time, [class*="due"]');
        const pointsEl = row.querySelector('[class*="points"]');
        const statusEl = row.querySelector('[class*="status"], .submission_status');
        let name = nameEl?.textContent?.trim() ?? '';
        name = name.split('\n')[0]?.trim() ?? name;
        name = name.replace(/\s+/g, ' ').trim();
        const href = (nameEl as HTMLAnchorElement)?.href;
        if (name) {
          items.push({
            name,
            dueDate: dateEl?.getAttribute('datetime') ?? dateEl?.textContent?.trim(),
            points: pointsEl?.textContent?.trim(),
            status: statusEl?.textContent?.trim(),
            url: href || undefined,
          });
        }
      }
      return items;
    });

    const assignments: ICanvasBrowserAssignment[] = assignmentsWithUrls.map((a) => ({
      name: a.name,
      dueDate: a.dueDate,
      points: a.points,
      status: a.status,
    }));

    // Extract attachment links from first few assignments (optional, can be slow)
    const ASSIGNMENT_ATTACHMENT_LIMIT = 3;
    for (let i = 0; i < Math.min(assignmentsWithUrls.length, ASSIGNMENT_ATTACHMENT_LIMIT); i++) {
      const a = assignmentsWithUrls[i]!;
      if (!a.url) continue;
      try {
        await page.goto(a.url, { waitUntil: 'networkidle', timeout: 10000 });
        await page.waitForTimeout(800);
        const attachmentLinks = await page.evaluate((origin) => {
          const links: Array<{ id?: string; name: string; url: string }> = [];
          document.querySelectorAll('a[href*="/files/"], a[href*="download"], .attachment a').forEach((el) => {
            const href = el.getAttribute('href');
            if (!href || href.includes('folder')) return;
            const m = href.match(/\/files\/(\d+)/);
            if (!m) return;
            const fullUrl = href.startsWith('http') ? href : origin + (href.startsWith('/') ? '' : '/') + href;
            const name = el.textContent?.trim() || el.getAttribute('aria-label') || 'attachment';
            const dl = fullUrl.includes('download') ? fullUrl : fullUrl.replace(/\?.*$/, '').replace(/\/?$/, '') + '/download';
            links.push({ id: m[1], name, url: dl });
          });
          return links;
        }, baseUrl.replace(/\/$/, ''));
        if (attachmentLinks.length > 0) {
          assignments[i]!.attachments = attachmentLinks;
          if (!SKIP_DOWNLOADS) {
            const attachDir = join('harness-output', 'canvas-files', `${course.id}-${sanitizeFilename(course.name)}`, 'attachments', sanitizeFilename(a.name));
            await downloadFiles(page, attachmentLinks, attachDir, state);
          }
        }
      } catch {
        // Skip failed assignment page loads
      }
    }

    // Re-navigate to course for modules extraction
    await page.goto(course.url, { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForTimeout(1000);

    const modules: ICanvasBrowserModule[] = await page.evaluate(() => {
      const mods: ICanvasBrowserModule[] = [];
      const modHeaders = document.querySelectorAll('.module, [class*="Module"]');
      for (const mod of modHeaders) {
        const nameEl = mod.querySelector('.name, [class*="title"], h3');
        const name = nameEl?.textContent?.trim() ?? 'Module';
        const itemEls = mod.querySelectorAll('.module_item, [class*="module_item"], .item');
        const items: string[] = [];
        for (const item of itemEls) {
          const t = item.querySelector('a, .title')?.textContent?.trim();
          if (t) items.push(t);
        }
        mods.push({ name, items });
      }
      return mods;
    });

    const grade = await page.evaluate(() => {
      const el = document.querySelector('.grade, [class*="final_grade"], .percent');
      return el?.textContent?.trim();
    });

    // Extract files from Files page
    const files = await extractCourseFiles(page, course, baseUrl);

    // Download files if enabled (incremental: skip already-downloaded)
    if (!SKIP_DOWNLOADS && files.length > 0) {
      const filesDir = join('harness-output', 'canvas-files', `${course.id}-${sanitizeFilename(course.name)}`);
      await downloadFiles(page, files, filesDir, state);
    }

    return {
      ...course,
      grade,
      assignments,
      modules,
      files,
    };
  } catch {
    return course;
  }
}

// ---------------------------------------------------------------------------
// Main scraper
// ---------------------------------------------------------------------------

export async function scrapeCanvasViaBrowser(
  canvasUrl: string,
  googleEmail: string,
  googlePassword: string
): Promise<ICanvasBrowserExtract> {
  const browser = await chromium.launch({ headless: true });
  mkdirSync('harness-output', { recursive: true });

  let state = loadSyncState();
  if (!state) {
    state = { lastSync: '', downloadedFiles: {} };
  }
  if (FULL_SYNC) state = { lastSync: '', downloadedFiles: {} };

  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(20000);

    if (!FULL_SYNC && state.lastSync) {
      console.log(`   Incremental sync (last: ${state.lastSync.slice(0, 10)}...), ${Object.keys(state.downloadedFiles).length} files already cached`);
    }

    console.log('\n1. NAVIGATING TO CANVAS');
    await page.goto(canvasUrl, { waitUntil: 'networkidle', timeout: 20000 });

    const currentUrl = page.url();
    if (currentUrl.includes('accounts.google.com')) {
      console.log('2. LOGGING IN VIA GOOGLE SSO');
      await loginViaGoogle(page, googleEmail, googlePassword);
    } else {
      console.log('2. Already on Canvas (no Google redirect)');
    }

    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    const finalUrl = page.url();
    if (!finalUrl.includes('instructure.com') && !finalUrl.includes('canvas')) {
      throw new Error(`Login may have failed. Current URL: ${finalUrl}`);
    }

    await page.screenshot({ path: 'harness-output/canvas-dashboard.png', fullPage: true });
    const html = await page.content();
    writeFileSync('harness-output/canvas-dashboard.html', html, 'utf8');

    console.log('3. EXTRACTING DASHBOARD');
    const { user, toDoItems, upcomingEvents, announcements } = await extractDashboard(page);

    console.log('4. NAVIGATING TO COURSES PAGE');
    await navigateToCoursesPage(page, canvasUrl.replace(/\/$/, ''));

    console.log('5. EXTRACTING ALL COURSES');
    let courses = await extractCourseList(page, canvasUrl.replace(/\/$/, ''));
    console.log(`   Found ${courses.length} courses`);

    await page.screenshot({ path: 'harness-output/canvas-courses.png', fullPage: true });
    writeFileSync('harness-output/canvas-courses.html', await page.content(), 'utf8');

    const baseUrl = canvasUrl.replace(/\/$/, '');
    console.log('6. EXTRACTING EVERY COURSE (assignments, modules, files, grades)');
    if (!SKIP_DOWNLOADS) console.log('   (incremental downloads to harness-output/canvas-files/)');
    for (let i = 0; i < courses.length; i++) {
      courses[i] = await extractCourseDetail(page, courses[i]!, baseUrl, state);
      const c = courses[i]!;
      const meta = [c.period, c.teacher].filter(Boolean).join(' — ');
      const filesInfo = c.files.length > 0 ? `, ${c.files.length} files` : '';
      console.log(`   [${i + 1}/${courses.length}] ${c.name}${meta ? ` (${meta})` : ''}: ${c.assignments.length} assignments, ${c.modules.length} modules${filesInfo}`);
    }

    state.lastSync = new Date().toISOString();
    saveSyncState(state);

    const result: ICanvasBrowserExtract = {
      user,
      courses,
      toDoItems,
      upcomingEvents,
      announcements,
      timestamp: state.lastSync,
    };

    return result;
  } finally {
    await browser.close();
  }
}

// ---------------------------------------------------------------------------
// CLI + Report
// ---------------------------------------------------------------------------

function printReport(data: ICanvasBrowserExtract): void {
  const line = '═'.repeat(70);
  console.log(`\n${line}`);
  console.log(`  CANVAS BROWSER EXTRACT — ${data.user}`);
  console.log(`  ${data.timestamp}`);
  console.log(line);

  console.log('\n  COURSES:');
  for (const c of data.courses) {
    const meta = [c.period, c.courseCode, c.teacher].filter(Boolean).join(' — ');
    console.log(`\n    ${c.name}${meta ? ` (${meta})` : ''}`);
    if (c.grade) console.log(`      Grade: ${c.grade}`);
    if (c.assignments.length > 0) {
      console.log(`      Assignments: ${c.assignments.length}`);
      for (const a of c.assignments.slice(0, 5)) {
        console.log(`        - ${a.name}${a.dueDate ? ` (${a.dueDate})` : ''}`);
      }
      if (c.assignments.length > 5) console.log(`        ... and ${c.assignments.length - 5} more`);
    }
    if (c.modules.length > 0) {
      console.log(`      Modules: ${c.modules.length}`);
    }
    if (c.files.length > 0) {
      console.log(`      Files: ${c.files.length} (${SKIP_DOWNLOADS ? 'available' : 'downloaded to harness-output/canvas-files/'})`);
    }
    const attachCount = c.assignments.filter((a) => a.attachments && a.attachments.length > 0).length;
    if (attachCount > 0) {
      console.log(`      Assignment attachments: ${attachCount} assignments with files`);
    }
  }

  if (data.toDoItems.length > 0) {
    console.log(`\n  TO-DO (${data.toDoItems.length}):`);
    for (const t of data.toDoItems.slice(0, 10)) {
      console.log(`    - ${t.title} [${t.course}]${t.dueDate ? ` (${t.dueDate})` : ''}`);
    }
  }

  if (data.upcomingEvents.length > 0) {
    console.log(`\n  UPCOMING (${data.upcomingEvents.length}):`);
    for (const e of data.upcomingEvents.slice(0, 5)) {
      console.log(`    - ${e.title} ${e.date}`);
    }
  }

  console.log('\n' + line);
  const totalFiles = data.courses.reduce((s, c) => s + c.files.length, 0);
  const totalAttach = data.courses.reduce((s, c) => s + c.assignments.reduce((t, a) => t + (a.attachments?.length ?? 0), 0), 0);
  const dlNote = SKIP_DOWNLOADS ? ' (use without --skip-downloads to download)' : ' (downloaded)';
  console.log('  TOTALS:');
  console.log('    Courses:        ' + data.courses.length);
  console.log('    Course files:   ' + totalFiles + (totalFiles > 0 ? dlNote : ''));
  console.log('    Attachments:    ' + totalAttach + (totalAttach > 0 ? dlNote : ''));
  console.log('    To-do items:    ' + data.toDoItems.length);
  console.log('    Upcoming:       ' + data.upcomingEvents.length);
  console.log('    Announcements:  ' + data.announcements.length);
  console.log(line);
}

if (require.main === module) {
  if (!CANVAS_URL || !GOOGLE_EMAIL || !GOOGLE_PASSWORD) {
    console.error('Usage: CANVAS_URL=... CANVAS_GOOGLE_EMAIL=... CANVAS_GOOGLE_PASSWORD=... npx ts-node src/harness/canvas-browser-scrape.ts');
    console.error('  or:  npx ts-node src/harness/canvas-browser-scrape.ts --url https://ldisd.instructure.com --email user@ldisd.net --password pass');
    console.error('  Add --skip-downloads to extract without downloading.');
    console.error('  Add --full to re-download all files (ignore incremental state).');
    process.exit(1);
  }

  console.log('🔬 Canvas Browser Scraper (Google SSO)');
  console.log(`   URL: ${CANVAS_URL}`);
  console.log(`   ${new Date().toISOString()}\n`);

  scrapeCanvasViaBrowser(CANVAS_URL, GOOGLE_EMAIL, GOOGLE_PASSWORD)
    .then((result) => {
      printReport(result);
      mkdirSync('harness-output', { recursive: true });
      writeFileSync('harness-output/canvas-browser-extract.json', JSON.stringify(result, null, 2), 'utf8');
      console.log('\n  Files saved to harness-output/');
      console.log('    canvas-browser-extract.json');
      console.log('    canvas-dashboard.html, canvas-courses.html');
      console.log('    canvas-dashboard.png, canvas-courses.png');
      console.log('    canvas-files/<course>/ (downloaded course files + assignment attachments)');
    })
    .catch((err) => {
      console.error('Scrape failed:', err);
      process.exit(1);
    });
}
