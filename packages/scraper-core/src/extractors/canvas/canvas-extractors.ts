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
  /** Canvas planner / plannable id when available. */
  readonly id?: string;
  /** Course Canvas id from link href when DOM does not expose context. */
  readonly courseId?: string;
  readonly title: string;
  readonly course: string;
  readonly dueDate?: string;
}

export interface ICanvasBrowserEvent {
  /** Canvas calendar event or planner row id when available. */
  readonly id?: string;
  readonly courseId?: string;
  readonly title: string;
  readonly date: string;
  readonly course?: string;
}

export interface ICanvasBrowserAnnouncement {
  readonly id?: string;
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
  /**
   * Declares planner-snapshot semantics for Canvas (delta ingest; server may merge aliases).
   * Copied into envelope run.meta by runClientScrape.
   */
  readonly canvasSnapshotMeta?: Readonly<Record<string, string>>;
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

function readDataId(row: Element): string | undefined {
  const direct = row.getAttribute('data-plannable-id') ?? row.getAttribute('data-id');
  if (direct?.trim()) return direct.trim();
  const child = row.querySelector('[data-plannable-id]');
  const fromChild = child?.getAttribute('data-plannable-id');
  return fromChild?.trim() || undefined;
}

/**
 * Extracts to-do items from the Canvas dashboard planner.
 */
export function extractCanvasToDoItems(): ICanvasBrowserToDoItem[] {
  const items: ICanvasBrowserToDoItem[] = [];
  const list = document.querySelector('#planner-todos, .to-do-list, [class*="Todo"]');
  if (!list) return items;
  for (const row of list.querySelectorAll('li, [role="listitem"], .todo')) {
    const titleEl = row.querySelector('a, [class*="title"]');
    const courseEl = row.querySelector('[class*="course"], [class*="context"]');
    const dateEl = row.querySelector('[class*="date"], time');
    const title = titleEl?.textContent?.trim();
    if (title && titleEl) {
      const href = titleEl.getAttribute('href') ?? '';
      let courseId: string | undefined;
      const m = href.match(/\/courses\/(\d+)\//);
      if (m?.[1]) courseId = m[1];
      items.push({
        id: readDataId(row),
        courseId,
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
  id?: string;
  title: string;
  date: string;
  course?: string;
}> {
  const items: Array<{ id?: string; title: string; date: string; course?: string }> = [];
  const list = document.querySelector('#planner-events, .upcoming-events, [class*="Upcoming"]');
  if (!list) return items;
  for (const row of list.querySelectorAll('li, [role="listitem"], .event')) {
    const titleEl = row.querySelector('a, [class*="title"]');
    const dateEl = row.querySelector('[class*="date"], time');
    const courseEl = row.querySelector('[class*="course"], [class*="context"]');
    const title = titleEl?.textContent?.trim();
    if (title) {
      items.push({
        id: readDataId(row),
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
/** Shape returned by /api/v1/courses and /api/v1/users/:id/courses. */
export type ICanvasApiCourseRow = {
  id: string | number;
  name: string;
  course_code: string;
  teachers: Array<{ id: string; display_name: string; pronouns?: string }>;
  enrollments: Array<{
    type: string;
    role?: string;
    computed_current_score?: number;
    computed_current_grade?: string;
  }>;
  term?: { name: string };
};

export async function fetchCanvasCourses(_baseUrl: string): Promise<ICanvasApiCourseRow[]> {
  const res = await fetch(
    '/api/v1/courses?enrollment_state=active&per_page=100&include[]=teachers&include[]=total_scores&include[]=term'
  );
  if (!res.ok) return [];
  const json: unknown = await res.json();
  return Array.isArray(json) ? (json as ICanvasApiCourseRow[]) : [];
}

/**
 * Observee user ids for the current user (parent/observer accounts).
 */
export async function fetchCanvasObserveeUserIds(): Promise<string[]> {
  const res = await fetch('/api/v1/users/self/observees?per_page=100');
  if (!res.ok) return [];
  const json: unknown = await res.json();
  if (!Array.isArray(json)) return [];
  const out: string[] = [];
  for (const row of json) {
    if (!row || typeof row !== 'object') continue;
    const id = (row as { id?: unknown }).id;
    if (typeof id === 'number' || typeof id === 'string') out.push(String(id));
  }
  return out;
}

export async function fetchCanvasCoursesForUser(userId: string): Promise<ICanvasApiCourseRow[]> {
  const res = await fetch(
    `/api/v1/users/${encodeURIComponent(userId)}/courses?enrollment_state=active&per_page=100&include[]=teachers&include[]=total_scores&include[]=term`
  );
  if (!res.ok) return [];
  const json: unknown = await res.json();
  return Array.isArray(json) ? (json as ICanvasApiCourseRow[]) : [];
}

export type ICanvasPlannerItemRow = {
  plannable_id?: string | number;
  plannable_type?: string;
  plannable?: {
    title?: string;
    name?: string;
    due_at?: string;
    start_at?: string;
  };
  course_id?: string | number;
  context_name?: string;
};

/**
 * Planner items for a rolling window (assignments, calendar events, etc.).
 */
export async function fetchCanvasPlannerItems(_baseUrl?: string): Promise<ICanvasPlannerItemRow[]> {
  const now = new Date();
  const start = new Date(now);
  start.setUTCDate(start.getUTCDate() - 7);
  const end = new Date(now);
  end.setUTCDate(end.getUTCDate() + 365);
  const startStr = start.toISOString().slice(0, 10);
  const endStr = end.toISOString().slice(0, 10);
  const res = await fetch(
    `/api/v1/planner/items?start_date=${startStr}&end_date=${endStr}&per_page=200`
  );
  if (!res.ok) return [];
  const json: unknown = await res.json();
  return Array.isArray(json) ? (json as ICanvasPlannerItemRow[]) : [];
}

function enrollmentKey(e: { type: string; role?: string }): string {
  return `${e.type}\0${e.role ?? ''}`;
}

/**
 * Dedupes course rows by Canvas course id; merges enrollment arrays.
 */
export function mergeCanvasApiCourseRows(
  a: readonly ICanvasApiCourseRow[],
  b: readonly ICanvasApiCourseRow[]
): ICanvasApiCourseRow[] {
  const map = new Map<string, ICanvasApiCourseRow>();
  for (const row of [...a, ...b]) {
    const id = String(row.id);
    const existing = map.get(id);
    if (!existing) {
      map.set(id, row);
      continue;
    }
    const en = [...(existing.enrollments ?? []), ...(row.enrollments ?? [])];
    const seen = new Set<string>();
    const mergedEn: ICanvasApiCourseRow['enrollments'] = [];
    for (const e of en) {
      const k = enrollmentKey(e);
      if (seen.has(k)) continue;
      seen.add(k);
      mergedEn.push(e);
    }
    map.set(id, { ...existing, ...row, enrollments: mergedEn });
  }
  return [...map.values()];
}

function canvasTodoKey(item: {
  id?: string;
  title: string;
  course: string;
  courseId?: string;
  dueDate?: string;
}): string {
  if (item.id?.trim()) return `id:${item.id}`;
  const ctx = item.courseId?.trim() ?? item.course;
  return `dom:${item.title}\0${ctx}\0${item.dueDate ?? ''}`;
}

function canvasEventKey(item: {
  id?: string;
  title: string;
  date: string;
  course?: string;
  courseId?: string;
}): string {
  if (item.id?.trim()) return `id:${item.id}`;
  const ctx = item.courseId?.trim() ?? item.course ?? '';
  return `dom:${item.title}\0${item.date}\0${ctx}`;
}

/** Enrich DOM planner rows with stable ids from /api/v1/planner/items. */
export function mergeCanvasPlannerTodos(
  dom: readonly ICanvasBrowserToDoItem[],
  planner: readonly ICanvasPlannerItemRow[]
): ICanvasBrowserToDoItem[] {
  const map = new Map<string, ICanvasBrowserToDoItem>();
  for (const t of dom) {
    map.set(canvasTodoKey(t), t);
  }
  for (const row of planner) {
    const pType = row.plannable_type ?? '';
    if (
      pType !== 'assignment' &&
      pType !== 'sub_assignment' &&
      pType !== 'graded_discussion' &&
      pType !== 'quiz' &&
      pType !== 'discussion_topic'
    ) {
      continue;
    }
    const pl = row.plannable;
    const title = (pl?.title ?? pl?.name ?? '').trim();
    if (!title) continue;
    const dueDate = pl?.due_at ?? pl?.start_at;
    const course = row.context_name ?? '';
    const courseId = row.course_id != null ? String(row.course_id) : undefined;
    const pid = row.plannable_id != null ? String(row.plannable_id) : undefined;
    const item: ICanvasBrowserToDoItem = {
      id: pid,
      courseId,
      title,
      course,
      dueDate,
    };
    const kDom = canvasTodoKey({ title, course, courseId, dueDate });
    const existingDom = map.get(kDom);
    if (existingDom) {
      map.set(kDom, {
        ...existingDom,
        id: existingDom.id ?? pid,
        courseId: existingDom.courseId ?? courseId,
      });
      continue;
    }
    if (pid) {
      const kId = canvasTodoKey({ id: pid, title, course, courseId, dueDate });
      const prev = map.get(kId);
      map.set(kId, prev ? { ...prev, ...item, id: pid } : item);
    } else {
      map.set(kDom, item);
    }
  }
  return [...map.values()];
}

/** Enrich DOM upcoming events with planner calendar rows. */
export function mergeCanvasPlannerEvents(
  dom: readonly ICanvasBrowserEvent[],
  planner: readonly ICanvasPlannerItemRow[]
): ICanvasBrowserEvent[] {
  const map = new Map<string, ICanvasBrowserEvent>();
  for (const e of dom) {
    map.set(canvasEventKey(e), e);
  }
  for (const row of planner) {
    if (row.plannable_type !== 'calendar_event') continue;
    const pl = row.plannable;
    const title = (pl?.title ?? pl?.name ?? '').trim();
    if (!title) continue;
    const date = pl?.start_at ?? pl?.due_at ?? '';
    const course = row.context_name;
    const courseId = row.course_id != null ? String(row.course_id) : undefined;
    const pid = row.plannable_id != null ? String(row.plannable_id) : undefined;
    const item: ICanvasBrowserEvent = {
      id: pid,
      courseId,
      title,
      date,
      course,
    };
    const kDom = canvasEventKey({ title, date, course, courseId });
    const existingDom = map.get(kDom);
    if (existingDom) {
      map.set(kDom, {
        ...existingDom,
        id: existingDom.id ?? pid,
        courseId: existingDom.courseId ?? courseId,
      });
      continue;
    }
    if (pid) {
      const kId = canvasEventKey({ id: pid, title, date, course, courseId });
      const prev = map.get(kId);
      map.set(kId, prev ? { ...prev, ...item, id: pid } : item);
    } else {
      map.set(kDom, item);
    }
  }
  return [...map.values()];
}

export function isCanvasObserverEnrollment(e: { type: string; role?: string }): boolean {
  const t = e.type.toLowerCase();
  if (t === 'observer' || t === 'observerenrollment') return true;
  const r = (e.role ?? '').toLowerCase();
  return r.includes('observer');
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
    id?: string | number;
    title: string;
    context_code: string;
    posted_at?: string;
    message?: string;
  }>
> {
  if (courseIds.length === 0) return [];
  const params = courseIds.map((id) => `context_codes[]=course_${id}`).join('&');
  const res = await fetch(`/api/v1/announcements?${params}&per_page=50`);
  if (!res.ok) return [];
  const json: unknown = await res.json();
  return Array.isArray(json)
    ? (json as Array<Record<string, unknown>>).map(canvasAnnouncementFromApi)
    : [];
}

function readOptString(v: unknown): string | undefined {
  return typeof v === 'string' ? v : undefined;
}

function canvasAnnouncementFromApi(raw: Record<string, unknown>): {
  id?: string | number;
  title: string;
  context_code: string;
  posted_at?: string;
  message?: string;
} {
  const title = readOptString(raw['title']) ?? '';
  const ctx = readOptString(raw['context_code']) ?? '';
  const posted = readOptString(raw['posted_at']);
  const message = readOptString(raw['message']);
  const idRaw = raw['id'];
  const id = typeof idRaw === 'number' || typeof idRaw === 'string' ? idRaw : undefined;
  return { id, title, context_code: ctx, posted_at: posted, message };
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
