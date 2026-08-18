/**
 * Canvas browser-context extractor functions.
 *
 * These functions run inside the browser (Playwright page.evaluate,
 * React Native WebView injectJavaScript, or extension content scripts).
 * They must be self-contained — no imports, no closure over outer scope.
 * All inputs are passed as explicit arguments.
 */

// ---------------------------------------------------------------------------
// Raw extract types (output shapes from browser context)
// ---------------------------------------------------------------------------

export interface ICanvasBrowserTeacher {
  readonly id: string;
  readonly name: string;
  readonly email?: string;
  readonly bio?: string;
  readonly pronouns?: string;
}

export interface ICanvasBrowserFile {
  readonly id?: string;
  readonly name: string;
  readonly url?: string;
  readonly size?: string;
  readonly contentType?: string;
  readonly localPath?: string;
  readonly contentBase64?: string;
  readonly contentDescription?: string;
}

export interface ICanvasBrowserAssignment {
  readonly id?: string;
  readonly name: string;
  readonly dueDate?: string;
  readonly points?: string;
  readonly status?: string;
  readonly description?: string;
  readonly attachments?: ICanvasBrowserFile[];
}

export interface ICanvasModuleItem {
  readonly title: string;
  readonly type:
    'Assignment' | 'File' | 'Page' | 'Discussion' | 'ExternalUrl' | 'ExternalTool' | 'SubHeader';
  readonly contentId?: string;
  readonly position: number;
}

export interface ICanvasBrowserModule {
  readonly id?: string;
  readonly name: string;
  readonly position?: number;
  readonly items: ICanvasModuleItem[];
}

export interface ICanvasBrowserToDoItem {
  readonly title: string;
  readonly course: string;
  readonly dueDate?: string;
}

export interface ICanvasBrowserEvent {
  readonly title: string;
  readonly date: string;
  readonly course?: string;
}

export interface ICanvasBrowserAnnouncement {
  readonly title: string;
  readonly course: string;
  readonly date?: string;
  readonly body?: string;
}

export interface ICanvasBrowserCourse {
  readonly id: string;
  readonly name: string;
  readonly courseCode: string;
  readonly period?: string;
  readonly teacher?: string;
  readonly teachers: ICanvasBrowserTeacher[];
  readonly term?: string;
  readonly url: string;
  readonly grade?: string;
  readonly assignments: ICanvasBrowserAssignment[];
  readonly modules: ICanvasBrowserModule[];
  readonly files: ICanvasBrowserFile[];
}

export interface ICanvasBrowserExtract {
  readonly user: string;
  readonly courses: ICanvasBrowserCourse[];
  readonly toDoItems: ICanvasBrowserToDoItem[];
  readonly upcomingEvents: ICanvasBrowserEvent[];
  readonly announcements: ICanvasBrowserAnnouncement[];
  readonly timestamp: string;
}

// ---------------------------------------------------------------------------
// Extractor functions (browser-context, no imports, no outer scope)
// ---------------------------------------------------------------------------

/**
 * Extracts the student display name from the Canvas dashboard nav.
 * Selector: #global_nav_profile_link title attribute or text content.
 */
export function extractCanvasUser(selector: string): string {
  const el = document.querySelector(selector);
  return el?.getAttribute('title') ?? el?.textContent?.trim() ?? 'Unknown';
}

/**
 * Extracts to-do items from the Canvas dashboard planner.
 */
export function extractCanvasToDoItems(): Array<{
  title: string;
  course: string;
  dueDate?: string;
}> {
  const items: Array<{ title: string; course: string; dueDate?: string }> = [];
  const list = document.querySelector('#planner-todos, .to-do-list, [class*="Todo"]');
  if (!list) return items;
  for (const row of list.querySelectorAll('li, [role="listitem"], .todo')) {
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
}

/**
 * Extracts upcoming events from the Canvas dashboard planner.
 */
export function extractCanvasUpcomingEvents(): Array<{
  title: string;
  date: string;
  course?: string;
}> {
  const items: Array<{ title: string; date: string; course?: string }> = [];
  const list = document.querySelector('#planner-events, .upcoming-events, [class*="Upcoming"]');
  if (!list) return items;
  for (const row of list.querySelectorAll('li, [role="listitem"], .event')) {
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
}

/**
 * Fetches Canvas courses via the Canvas REST API (/api/v1/courses).
 * Must be called while authenticated (session cookies are sent automatically).
 */
export async function fetchCanvasCourses(_baseUrl: string): Promise<
  Array<{
    id: string;
    name: string;
    course_code: string;
    teachers: Array<{ id: string; display_name: string; pronouns?: string }>;
    enrollments: Array<{
      type: string;
      computed_current_score?: number;
      computed_current_grade?: string;
    }>;
    term?: { name: string };
  }>
> {
  const res = await fetch(
    '/api/v1/courses?enrollment_state=active&per_page=100&include[]=teachers&include[]=total_scores&include[]=term'
  );
  if (!res.ok) return [];
  const json = await res.json();
  return Array.isArray(json) ? json : [];
}

/**
 * Fetches assignments for a single Canvas course via REST API.
 */
export async function fetchCanvasCourseAssignments(courseId: string): Promise<
  Array<{
    id?: string;
    name: string;
    due_at?: string;
    points_possible?: number;
    submission?: {
      missing?: boolean;
      late?: boolean;
      workflow_state?: string;
      attachments?: Array<{
        display_name?: string;
        filename?: string;
        url?: string;
        'content-type'?: string;
      }>;
    };
    description?: string;
  }>
> {
  const res = await fetch(
    `/api/v1/courses/${courseId}/assignments?include[]=submission&include[]=description&per_page=200&order_by=due_at`
  );
  if (!res.ok) return [];
  const json = await res.json();
  return Array.isArray(json) ? json : [];
}

/**
 * Fetches teacher details (including email) for a Canvas course.
 */
export async function fetchCanvasCourseTeachers(courseId: string): Promise<
  Array<{
    id: string;
    name?: string;
    display_name?: string;
    email?: string;
    bio?: string;
    pronouns?: string;
  }>
> {
  const res = await fetch(
    `/api/v1/courses/${courseId}/users?enrollment_type[]=teacher&include[]=email&include[]=bio&per_page=50`
  );
  if (!res.ok) return [];
  const json = await res.json();
  return Array.isArray(json) ? json : [];
}

/**
 * Fetches modules (with items) for a Canvas course.
 */
export async function fetchCanvasCourseModules(courseId: string): Promise<
  Array<{
    id?: string;
    name: string;
    position: number;
    items: Array<{ title: string; type: string; content_id?: string; position: number }>;
  }>
> {
  const res = await fetch(`/api/v1/courses/${courseId}/modules?include[]=items&per_page=200`);
  if (!res.ok) return [];
  const json = await res.json();
  return Array.isArray(json) ? json : [];
}

/**
 * Fetches files for a Canvas course.
 */
export async function fetchCanvasCourseFiles(courseId: string): Promise<
  Array<{
    id?: string;
    display_name?: string;
    filename?: string;
    url?: string;
    size?: number;
  }>
> {
  const res = await fetch(`/api/v1/courses/${courseId}/files?per_page=200`);
  if (!res.ok) return [];
  const json = await res.json();
  return Array.isArray(json) ? json : [];
}

/**
 * Fetches announcements for a set of Canvas course IDs.
 */
export async function fetchCanvasAnnouncements(courseIds: string[]): Promise<
  Array<{
    title: string;
    context_code: string;
    posted_at?: string;
  }>
> {
  if (courseIds.length === 0) return [];
  const params = courseIds.map((id) => `context_codes[]=course_${id}`).join('&');
  const res = await fetch(`/api/v1/announcements?${params}&per_page=50`);
  if (!res.ok) return [];
  const json = await res.json();
  return Array.isArray(json) ? json : [];
}

/**
 * Downloads a file as base64. Returns null if too large or failed.
 * Max size: 500KB.
 */
export async function fetchFileAsBase64(url: string): Promise<string | null> {
  const MAX = 500_000;
  const res = await fetch(url);
  if (!res.ok) return null;
  const contentLength = res.headers.get('content-length');
  if (contentLength && Number(contentLength) > MAX) return null;
  const buf = await res.arrayBuffer();
  if (buf.byteLength > MAX) return null;
  const bytes = new Uint8Array(buf);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
  return btoa(binary);
}
