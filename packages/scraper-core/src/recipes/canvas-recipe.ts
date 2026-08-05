/**
 * Canvas scrape recipe.
 *
 * Orchestrates navigation and extraction using IPageDriver.
 * Auth (login) is NOT here — it is runtime-specific.
 * Returns ICanvasBrowserExtract, which the transformer then converts to ops.
 */

import type { IPageDriver } from '../driver/IPageDriver';
import type {
  ICanvasBrowserExtract,
  ICanvasBrowserCourse,
} from '../extractors/canvas/canvas-extractors';
import {
  extractCanvasUser,
  extractCanvasToDoItems,
  extractCanvasUpcomingEvents,
  fetchCanvasCourses,
  fetchCanvasCourseAssignments,
  fetchCanvasCourseTeachers,
  fetchCanvasCourseModules,
  fetchCanvasCourseFiles,
  fetchCanvasAnnouncements,
} from '../extractors/canvas/canvas-extractors';

const DASHBOARD_USER_SELECTOR = '#global_nav_profile_link, [data-testid="global_nav_profile_link"]';

/**
 * Run the Canvas scrape recipe.
 *
 * @param driver - Runtime-specific page driver (Playwright, WebView, or extension)
 * @param baseUrl - The Canvas portal base URL (e.g. https://school.instructure.com)
 * @returns ICanvasBrowserExtract ready for transformation
 */
export async function runCanvasRecipe(
  driver: IPageDriver,
  baseUrl: string
): Promise<ICanvasBrowserExtract> {
  const cleanBaseUrl = baseUrl.replace(/\/$/, '');

  // --- Dashboard ---
  await driver.goto(cleanBaseUrl, { waitUntil: 'networkidle' });

  const user = await driver.evaluate(extractCanvasUser, DASHBOARD_USER_SELECTOR);
  const toDoItems = await driver.evaluate(extractCanvasToDoItems);
  const upcomingEvents = await driver.evaluate(extractCanvasUpcomingEvents);

  // --- Course list via Canvas REST API (session-cookie auth) ---
  const rawCourses = await driver.evaluate(fetchCanvasCourses, cleanBaseUrl);

  const courses: ICanvasBrowserCourse[] = [];

  for (const raw of rawCourses) {
    if (!raw.enrollments?.some((e) => e.type === 'student')) continue;
    if (raw.term?.name === 'Default Term') continue;

    const enrollment = raw.enrollments.find((e) => e.type === 'student');
    const score = enrollment?.computed_current_score;
    const letter = enrollment?.computed_current_grade;
    const grade = score != null ? `${score}%${letter ? ` ${letter}` : ''}` : letter || undefined;
    const periodMatch = raw.course_code?.match(/p(\d+[A-Z]?)\s*-/i);

    const courseId = String(raw.id);
    const courseUrl = `${cleanBaseUrl}/courses/${courseId}`;

    // Navigate to course page first (sets context for subsequent API calls)
    await driver.goto(courseUrl, { waitUntil: 'networkidle' });
    await driver.sleep(1500);

    // Assignments
    const rawAssignments = await driver.evaluate(fetchCanvasCourseAssignments, courseId);
    const assignments = rawAssignments
      .map((a) => {
        const sub = a.submission;
        let status: string | undefined;
        if (sub) {
          if (sub.missing) status = 'Missing';
          else if (sub.late) status = 'Late';
          else if (sub.workflow_state === 'graded') status = 'Graded';
          else if (sub.workflow_state === 'submitted') status = 'Submitted';
          else if (sub.workflow_state === 'unsubmitted') status = 'Unsubmitted';
        }
        const attachments = (sub?.attachments ?? []).map((att) => ({
          name: (att.display_name ?? att.filename ?? '') as string,
          url: att.url as string | undefined,
          contentType: att['content-type'] as string | undefined,
        }));
        const pts = a.points_possible;
        return {
          id: a.id ? String(a.id) : undefined,
          name: (a.name as string) || '',
          dueDate: a.due_at || undefined,
          points: pts != null ? `${pts} pts` : undefined,
          status,
          description: a.description || undefined,
          attachments: attachments.length > 0 ? attachments : undefined,
        };
      })
      .filter((a) => a.name);

    // Teachers
    const rawTeacherDetails = await driver.evaluate(fetchCanvasCourseTeachers, courseId);
    const teachers =
      rawTeacherDetails.length > 0
        ? rawTeacherDetails
            .map((u) => {
              const displayName = (u.name ?? u.display_name ?? '') as string;
              const apiEmail = u.email as string | undefined;
              const looksLikeEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(displayName);
              return {
                id: String(u.id ?? ''),
                name: looksLikeEmail ? displayName.split('@')[0]! : displayName,
                email: apiEmail || (looksLikeEmail ? displayName : undefined),
                bio: u.bio as string | undefined,
                pronouns: u.pronouns as string | undefined,
              };
            })
            .filter((t) => t.name)
        : (raw.teachers ?? []).map((t) => {
            const displayName = t.display_name || '';
            const looksLikeEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(displayName);
            return {
              id: String(t.id),
              name: looksLikeEmail ? displayName.split('@')[0]! : displayName,
              email: looksLikeEmail ? displayName : undefined,
              pronouns: t.pronouns,
            };
          });

    // Modules
    const rawModules = await driver.evaluate(fetchCanvasCourseModules, courseId);
    const modules = rawModules.map((m) => ({
      id: m.id ? String(m.id) : undefined,
      name: (m.name as string) || 'Module',
      position: (m.position as number) || 0,
      items: (m.items ?? []).map((item) => ({
        title: (item.title as string) || '',
        type: ((item.type as string) || 'Page') as
          | 'Assignment'
          | 'File'
          | 'Page'
          | 'Discussion'
          | 'ExternalUrl'
          | 'ExternalTool'
          | 'SubHeader',
        contentId: item.content_id ? String(item.content_id) : undefined,
        position: (item.position as number) || 0,
      })),
    }));

    // Files
    const rawFiles = await driver.evaluate(fetchCanvasCourseFiles, courseId);
    const files = rawFiles
      .map((f) => ({
        id: f.id ? String(f.id) : undefined,
        name: (f.display_name ?? f.filename ?? 'file') as string,
        url: `${((f.url as string) ?? '').replace(/\?.*$/, '').replace(/\/download$/, '')}/download`,
        size: f.size ? String(f.size) : undefined,
      }))
      .filter((f) => f.url !== '/download');

    courses.push({
      id: courseId,
      name: raw.name,
      courseCode: raw.course_code || '',
      period: periodMatch?.[1] ? `p${periodMatch[1]}` : undefined,
      teacher: teachers[0]?.name,
      teachers,
      term: raw.term?.name || undefined,
      url: courseUrl,
      grade,
      assignments,
      modules,
      files,
    });
  }

  // --- Announcements ---
  const courseIds = courses.map((c) => c.id);
  const rawAnnouncements = await driver.evaluate(fetchCanvasAnnouncements, courseIds);
  const announcements = rawAnnouncements
    .map((a) => ({
      title: (a.title as string) || '',
      course: ((a.context_code as string) || '').replace('course_', ''),
      date: a.posted_at || undefined,
    }))
    .filter((a) => a.title);

  return {
    user: user && user !== 'Unknown' ? user : 'Unknown',
    courses,
    toDoItems,
    upcomingEvents,
    announcements,
    timestamp: new Date().toISOString(),
  };
}
