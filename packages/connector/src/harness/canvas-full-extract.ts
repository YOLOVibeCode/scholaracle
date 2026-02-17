#!/usr/bin/env npx ts-node --transpile-only
/**
 * Canvas Full Extractor — uses the Canvas REST API to extract ALL available data:
 *   - User profile
 *   - Courses with grades, syllabus
 *   - Assignments with submissions, grouped by category
 *   - Missing/late assignments
 *   - Upcoming items (what's next)
 *   - Calendar events
 *   - Modules (course materials/content)
 *   - Subject reconciliation
 *
 * All organized by subject area so you can see everything for each subject.
 *
 * Usage:
 *   CANVAS_URL="https://school.instructure.com" CANVAS_TOKEN="token" \
 *     npx ts-node src/harness/canvas-full-extract.ts
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import {
  CanvasClient,
  type ICanvasCourse,
  type ICanvasAssignment,
  type ICanvasSubmission,
  type ICanvasEnrollment,
  type ICanvasAssignmentGroup,
  type ICanvasModule,
  type ICanvasModuleItem,
  type ICanvasCalendarEvent,
  type ICanvasFile,
  type ICanvasPage,
  type ICanvasAnnouncement,
  type ICanvasDiscussionTopic,
  type ICanvasRubric,
} from '../canvas/canvas-client';
import { reconcileCourse, type IReconciledCourse } from '../reconciliation/subject-reconciler';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const ARGS = process.argv.filter((a) => a !== '--');
function getCliArg(name: string): string | undefined {
  const idx = ARGS.indexOf(name);
  return idx >= 0 && idx + 1 < ARGS.length ? ARGS[idx + 1] : undefined;
}

const CANVAS_URL = process.env['CANVAS_URL'] ?? getCliArg('--url') ?? '';
const CANVAS_TOKEN = process.env['CANVAS_TOKEN'] ?? getCliArg('--token') ?? '';

// ---------------------------------------------------------------------------
// Output types
// ---------------------------------------------------------------------------

export interface ICanvasFullExtract {
  user: { id: number; name: string; email?: string };
  timestamp: string;
  subjects: ICanvasSubjectGroup[];
  upcomingItems: ICanvasUpcomingItem[];
  missingAssignments: ICanvasMissingItem[];
  calendarEvents: ICanvasEventItem[];
  announcements: ICanvasAnnouncementItem[];
  summary: {
    totalCourses: number;
    totalAssignments: number;
    totalMissing: number;
    totalUpcoming: number;
    totalFiles: number;
    totalPages: number;
    totalAnnouncements: number;
    overallGPA: number | null;
  };
}

export interface ICanvasSubjectGroup {
  subjectArea: string;
  subjectSubArea?: string;
  courses: ICanvasCourseExtract[];
}

export interface ICanvasCourseExtract {
  id: number;
  name: string;
  courseCode: string;
  reconciled: IReconciledCourse;
  currentGrade: string | null;
  currentScore: number | null;
  finalGrade: string | null;
  finalScore: number | null;
  gradesUrl: string | null;
  hasSyllabus: boolean;
  assignmentGroups: ICanvasAssignmentGroupExtract[];
  modules: ICanvasModuleExtract[];
  assignments: ICanvasAssignmentExtract[];
  files: ICanvasFileExtract[];
  pages: ICanvasPageExtract[];
  discussions: ICanvasDiscussionExtract[];
  rubrics: ICanvasRubricExtract[];
  upcomingCount: number;
  missingCount: number;
  lateCount: number;
}

export interface ICanvasAssignmentGroupExtract {
  name: string;
  weight: number;
  assignmentCount: number;
}

export interface ICanvasModuleExtract {
  name: string;
  position: number;
  itemCount: number;
  items: { title: string; type: string; completed: boolean; url?: string }[];
}

export interface ICanvasAssignmentExtract {
  id: number;
  name: string;
  dueAt: string | null;
  pointsPossible: number;
  score: number | null;
  grade: string | null;
  status: 'graded' | 'submitted' | 'missing' | 'late' | 'upcoming' | 'unsubmitted';
  late: boolean;
  missing: boolean;
  excused: boolean;
  submittedAt: string | null;
  category: string;
  url: string | null;
  description: string | null;
}

export interface ICanvasUpcomingItem {
  courseName: string;
  courseSubject: string;
  assignmentName: string;
  dueAt: string;
  pointsPossible: number;
  daysUntilDue: number;
  url: string | null;
}

export interface ICanvasMissingItem {
  courseName: string;
  courseSubject: string;
  assignmentName: string;
  dueAt: string | null;
  pointsPossible: number;
  daysPastDue: number;
  url: string | null;
}

export interface ICanvasEventItem {
  title: string;
  startAt: string;
  endAt: string;
  course: string;
  type: string;
}

export interface ICanvasFileExtract {
  name: string;
  filename: string;
  size: number;
  contentType: string;
  url: string;
  createdAt: string;
  updatedAt: string;
}

export interface ICanvasPageExtract {
  title: string;
  url: string;
  updatedAt: string;
  htmlUrl: string | null;
}

export interface ICanvasDiscussionExtract {
  title: string;
  postedAt: string;
  author: string;
  hasAssignment: boolean;
  url: string | null;
}

export interface ICanvasRubricExtract {
  title: string;
  pointsPossible: number;
  criteriaCount: number;
  criteria: { description: string; points: number }[];
}

export interface ICanvasAnnouncementItem {
  title: string;
  message: string;
  postedAt: string;
  course: string;
  author: string;
  url: string | null;
}

// ---------------------------------------------------------------------------
// Extractor
// ---------------------------------------------------------------------------

export async function extractCanvasFull(url: string, token: string): Promise<ICanvasFullExtract> {
  const client = new CanvasClient({ baseUrl: url, accessToken: token });
  mkdirSync('harness-output', { recursive: true });

  // 1. User profile
  console.log('  1. User profile');
  const profile = await client.getUserProfile();
  console.log(`     ${profile.name} (${profile.primary_email ?? profile.login_id ?? 'no email'})`);

  // 2. Courses with syllabus
  console.log('  2. Courses');
  let courses: readonly ICanvasCourse[];
  try {
    courses = await client.getCoursesWithSyllabus();
  } catch {
    courses = await client.getCourses();
  }
  console.log(`     ${courses.length} active courses`);

  // 3. Per-course data extraction
  const courseExtracts: ICanvasCourseExtract[] = [];
  const allMissing: ICanvasMissingItem[] = [];
  const allUpcoming: ICanvasUpcomingItem[] = [];
  const now = Date.now();

  for (const course of courses) {
    console.log(`  3. Course: ${course.name}`);
    const reconciled = reconcileCourse(course.name);

    // Fetch all data for this course in parallel
    const [assignments, submissions, enrollments, groups, modules, files, pages, discussions, rubrics] = await Promise.all([
      client.getAssignments(course.id).catch(() => [] as ICanvasAssignment[]),
      client.getSubmissions(course.id).catch(() => [] as ICanvasSubmission[]),
      client.getEnrollments(course.id).catch(() => [] as ICanvasEnrollment[]),
      client.getAssignmentGroups(course.id).catch(() => [] as ICanvasAssignmentGroup[]),
      client.getModules(course.id).catch(() => [] as ICanvasModule[]),
      client.getFiles(course.id).catch(() => [] as ICanvasFile[]),
      client.getPages(course.id).catch(() => [] as ICanvasPage[]),
      client.getDiscussionTopics(course.id).catch(() => [] as ICanvasDiscussionTopic[]),
      client.getRubrics(course.id).catch(() => [] as ICanvasRubric[]),
    ]);

    // Current grade from enrollment
    const myEnrollment = enrollments.find(
      (e) => e.user_id === profile.id && e.type === 'StudentEnrollment'
    );
    const currentGrade = myEnrollment?.grades?.current_grade ?? null;
    const currentScore = myEnrollment?.grades?.current_score ?? null;
    const finalGrade = myEnrollment?.grades?.final_grade ?? null;
    const finalScore = myEnrollment?.grades?.final_score ?? null;
    const gradesUrl = myEnrollment?.grades?.html_url ?? null;

    // Build group name map
    const groupMap = new Map<number, string>();
    for (const g of groups) groupMap.set(g.id, g.name);

    // Process assignments
    const assignmentExtracts: ICanvasAssignmentExtract[] = [];
    let missingCount = 0;
    let lateCount = 0;
    let upcomingCount = 0;

    for (const a of assignments) {
      const sub = submissions.find((s) => s.assignment_id === a.id);
      const category = a.assignment_group_id ? (groupMap.get(a.assignment_group_id) ?? 'Uncategorized') : 'Uncategorized';

      let status: ICanvasAssignmentExtract['status'] = 'unsubmitted';
      if (sub?.missing) { status = 'missing'; missingCount++; }
      else if (sub?.late) { status = 'late'; lateCount++; }
      else if (sub?.workflow_state === 'graded') status = 'graded';
      else if (sub?.workflow_state === 'submitted') status = 'submitted';
      else if (a.due_at && new Date(a.due_at).getTime() > now) { status = 'upcoming'; upcomingCount++; }

      assignmentExtracts.push({
        id: a.id,
        name: a.name,
        dueAt: a.due_at,
        pointsPossible: a.points_possible,
        score: sub?.score ?? null,
        grade: sub?.grade ?? null,
        status,
        late: sub?.late ?? false,
        missing: sub?.missing ?? false,
        excused: sub?.excused ?? false,
        submittedAt: sub?.submitted_at ?? null,
        category,
        url: a.html_url ?? null,
        description: a.description ? a.description.replace(/<[^>]+>/g, '').substring(0, 200) : null,
      });

      // Collect upcoming
      if (status === 'upcoming' && a.due_at) {
        const daysUntil = Math.ceil((new Date(a.due_at).getTime() - now) / (24 * 60 * 60_000));
        allUpcoming.push({
          courseName: course.name,
          courseSubject: reconciled.subject.area,
          assignmentName: a.name,
          dueAt: a.due_at,
          pointsPossible: a.points_possible,
          daysUntilDue: daysUntil,
          url: a.html_url ?? null,
        });
      }

      // Collect missing
      if (status === 'missing') {
        const daysPast = a.due_at ? Math.ceil((now - new Date(a.due_at).getTime()) / (24 * 60 * 60_000)) : 0;
        allMissing.push({
          courseName: course.name,
          courseSubject: reconciled.subject.area,
          assignmentName: a.name,
          dueAt: a.due_at,
          pointsPossible: a.points_possible,
          daysPastDue: daysPast,
          url: a.html_url ?? null,
        });
      }
    }

    // Process modules
    const moduleExtracts: ICanvasModuleExtract[] = [];
    for (const mod of modules) {
      let items: ICanvasModuleItem[] = [];
      try {
        items = [...await client.getModuleItems(course.id, mod.id)];
      } catch { /* some modules may not be accessible */ }

      moduleExtracts.push({
        name: mod.name,
        position: mod.position,
        itemCount: items.length,
        items: items.map((item) => ({
          title: item.title,
          type: item.type,
          completed: item.completion_requirement?.completed ?? false,
          url: item.html_url,
        })),
      });
    }

    // Assignment group summary
    const groupExtracts: ICanvasAssignmentGroupExtract[] = groups.map((g) => ({
      name: g.name,
      weight: g.group_weight,
      assignmentCount: assignments.filter((a) => a.assignment_group_id === g.id).length,
    }));

    // Process files (downloadable materials)
    const fileExtracts: ICanvasFileExtract[] = files.map((f) => ({
      name: f.display_name,
      filename: f.filename,
      size: f.size,
      contentType: f.content_type,
      url: f.url,
      createdAt: f.created_at,
      updatedAt: f.updated_at,
    }));

    // Process pages (wiki content)
    const pageExtracts: ICanvasPageExtract[] = pages.map((p) => ({
      title: p.title,
      url: p.url,
      updatedAt: p.updated_at,
      htmlUrl: p.html_url ?? null,
    }));

    // Process discussions
    const discussionExtracts: ICanvasDiscussionExtract[] = discussions.map((d) => ({
      title: d.title,
      postedAt: d.posted_at,
      author: d.author?.display_name ?? '',
      hasAssignment: Boolean(d.assignment_id),
      url: d.html_url ?? null,
    }));

    // Process rubrics
    const rubricExtracts: ICanvasRubricExtract[] = rubrics.map((r) => ({
      title: r.title,
      pointsPossible: r.points_possible,
      criteriaCount: r.data?.length ?? 0,
      criteria: (r.data ?? []).map((c) => ({
        description: c.description,
        points: c.points,
      })),
    }));

    courseExtracts.push({
      id: course.id,
      name: course.name,
      courseCode: course.course_code,
      reconciled,
      currentGrade,
      currentScore,
      finalGrade,
      finalScore,
      gradesUrl,
      hasSyllabus: Boolean(course.syllabus_body && course.syllabus_body.length > 10),
      assignmentGroups: groupExtracts,
      modules: moduleExtracts,
      assignments: assignmentExtracts,
      files: fileExtracts,
      pages: pageExtracts,
      discussions: discussionExtracts,
      rubrics: rubricExtracts,
      upcomingCount,
      missingCount,
      lateCount,
    });

    console.log(`     Grade: ${currentGrade ?? currentScore ?? 'N/A'} | ${assignments.length} assignments | ${files.length} files | ${pages.length} pages | ${discussions.length} discussions | ${modules.length} modules`);
  }

  // 4. Calendar events
  console.log('  4. Calendar events');
  const todayStr = new Date().toISOString().split('T')[0]!;
  const futureStr = new Date(Date.now() + 90 * 24 * 60 * 60_000).toISOString().split('T')[0]!;
  const events = await client.getCalendarEvents(todayStr, futureStr).catch(() => [] as ICanvasCalendarEvent[]);
  console.log(`     ${events.length} events (next 90 days)`);

  const courseNameMap = new Map<string, string>();
  for (const c of courses) courseNameMap.set(`course_${c.id}`, c.name);

  const calendarEvents: ICanvasEventItem[] = events.map((e) => ({
    title: e.title,
    startAt: e.start_at,
    endAt: e.end_at,
    course: courseNameMap.get(e.context_code) ?? e.context_code,
    type: e.type,
  }));

  // 5. Announcements
  console.log('  5. Announcements');
  const contextCodes = courses.map((c) => `course_${c.id}`);
  const rawAnnouncements = await client.getAnnouncements(contextCodes).catch(() => [] as ICanvasAnnouncement[]);
  const announcements: ICanvasAnnouncementItem[] = rawAnnouncements.map((a) => ({
    title: a.title,
    message: a.message?.replace(/<[^>]+>/g, '').substring(0, 300) ?? '',
    postedAt: a.posted_at,
    course: courseNameMap.get(a.context_code) ?? a.context_code,
    author: a.author?.display_name ?? '',
    url: a.html_url ?? null,
  }));
  console.log(`     ${announcements.length} announcements`);

  // 6. Sort upcoming by due date
  allUpcoming.sort((a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime());
  allMissing.sort((a, b) => b.daysPastDue - a.daysPastDue);

  // 7. Group by subject
  console.log('  6. Organizing by subject');
  const subjectMap = new Map<string, ICanvasCourseExtract[]>();
  for (const c of courseExtracts) {
    const key = c.reconciled.subject.area;
    const list = subjectMap.get(key) ?? [];
    list.push(c);
    subjectMap.set(key, list);
  }

  const subjects: ICanvasSubjectGroup[] = [];
  for (const [area, coursesInArea] of subjectMap) {
    subjects.push({
      subjectArea: area,
      subjectSubArea: coursesInArea[0]?.reconciled.subject.subArea,
      courses: coursesInArea,
    });
  }
  subjects.sort((a, b) => a.subjectArea.localeCompare(b.subjectArea));

  // 7. Calculate overall GPA
  const gradedCourses = courseExtracts.filter((c) => c.currentScore !== null);
  const overallGPA = gradedCourses.length > 0
    ? Math.round(gradedCourses.reduce((sum, c) => sum + (c.currentScore ?? 0), 0) / gradedCourses.length * 100) / 100
    : null;

  return {
    user: { id: profile.id, name: profile.name, email: profile.primary_email },
    timestamp: new Date().toISOString(),
    subjects,
    upcomingItems: allUpcoming,
    missingAssignments: allMissing,
    calendarEvents,
    announcements,
    summary: {
      totalCourses: courses.length,
      totalAssignments: courseExtracts.reduce((s, c) => s + c.assignments.length, 0),
      totalMissing: allMissing.length,
      totalUpcoming: allUpcoming.length,
      totalFiles: courseExtracts.reduce((s, c) => s + c.files.length, 0),
      totalPages: courseExtracts.reduce((s, c) => s + c.pages.length, 0),
      totalAnnouncements: announcements.length,
      overallGPA,
    },
  };
}

// ---------------------------------------------------------------------------
// Report printer
// ---------------------------------------------------------------------------

function printReport(data: ICanvasFullExtract): void {
  const line = '═'.repeat(70);

  console.log('\n' + line);
  console.log('  CANVAS FULL EXTRACT — ' + data.user.name);
  console.log('  ' + data.timestamp);
  console.log(line);

  // Summary
  console.log('\n  SUMMARY:');
  console.log('    Courses:        ' + data.summary.totalCourses);
  console.log('    Assignments:    ' + data.summary.totalAssignments);
  console.log('    Missing:        ' + data.summary.totalMissing);
  console.log('    Upcoming:       ' + data.summary.totalUpcoming);
  console.log('    Files/docs:     ' + data.summary.totalFiles);
  console.log('    Pages:          ' + data.summary.totalPages);
  console.log('    Announcements:  ' + data.summary.totalAnnouncements);
  console.log('    Overall avg:    ' + (data.summary.overallGPA ?? 'N/A'));

  // What's next (upcoming assignments)
  if (data.upcomingItems.length > 0) {
    console.log('\n  WHAT\'S NEXT (upcoming assignments):');
    for (const item of data.upcomingItems.slice(0, 15)) {
      const days = item.daysUntilDue === 0 ? 'TODAY' :
        item.daysUntilDue === 1 ? 'TOMORROW' :
        item.daysUntilDue + ' days';
      console.log('    ' + days.padEnd(12) + item.assignmentName.padEnd(40) + item.courseName + ' (' + item.pointsPossible + ' pts)');
    }
    if (data.upcomingItems.length > 15) {
      console.log('    ... and ' + (data.upcomingItems.length - 15) + ' more');
    }
  }

  // Missing assignments
  if (data.missingAssignments.length > 0) {
    console.log('\n  ⚠ MISSING ASSIGNMENTS (' + data.missingAssignments.length + '):');
    for (const item of data.missingAssignments) {
      const days = item.daysPastDue > 0 ? item.daysPastDue + 'd overdue' : 'just now';
      console.log('    ' + days.padEnd(14) + item.assignmentName.padEnd(40) + item.courseName + ' (' + item.pointsPossible + ' pts)');
    }
  }

  // By subject
  console.log('\n  BY SUBJECT:');
  for (const subject of data.subjects) {
    console.log('\n  ┌─ ' + subject.subjectArea.toUpperCase() + (subject.subjectSubArea ? ' > ' + subject.subjectSubArea : ''));
    for (const course of subject.courses) {
      const grade = course.currentGrade ?? (course.currentScore !== null ? course.currentScore + '%' : 'N/A');
      console.log('  │');
      console.log('  ├── ' + course.reconciled.normalizedTitle + ' (' + course.courseCode + ')');
      console.log('  │   Grade: ' + grade + (course.finalGrade ? '  Final: ' + course.finalGrade : ''));
      console.log('  │   ' + course.assignments.length + ' assignments (' + course.missingCount + ' missing, ' + course.lateCount + ' late, ' + course.upcomingCount + ' upcoming)');

      if (course.assignmentGroups.length > 0) {
        console.log('  │   Categories: ' + course.assignmentGroups.map((g) => g.name + ' (' + g.weight + '%)').join(', '));
      }

      if (course.modules.length > 0) {
        console.log('  │   Modules: ' + course.modules.length);
        for (const mod of course.modules.slice(0, 5)) {
          const completed = mod.items.filter((i) => i.completed).length;
          console.log('  │     • ' + mod.name + ' (' + completed + '/' + mod.itemCount + ' completed)');
        }
        if (course.modules.length > 5) {
          console.log('  │     ... and ' + (course.modules.length - 5) + ' more modules');
        }
      }

      // Files / downloadable materials
      if (course.files.length > 0) {
        console.log('  │   Files (' + course.files.length + '):');
        for (const f of course.files.slice(0, 8)) {
          const sizeKb = Math.round(f.size / 1024);
          const sizeStr = sizeKb > 1024 ? (sizeKb / 1024).toFixed(1) + 'MB' : sizeKb + 'KB';
          console.log('  │     📎 ' + f.name + ' (' + sizeStr + ', ' + f.contentType.split('/')[1] + ')');
        }
        if (course.files.length > 8) {
          console.log('  │     ... and ' + (course.files.length - 8) + ' more files');
        }
      }

      // Pages (wiki content, notes, instructions)
      if (course.pages.length > 0) {
        console.log('  │   Pages (' + course.pages.length + '):');
        for (const p of course.pages.slice(0, 5)) {
          console.log('  │     📝 ' + p.title);
        }
        if (course.pages.length > 5) {
          console.log('  │     ... and ' + (course.pages.length - 5) + ' more pages');
        }
      }

      // Discussions
      if (course.discussions.length > 0) {
        console.log('  │   Discussions (' + course.discussions.length + '):');
        for (const d of course.discussions.slice(0, 3)) {
          console.log('  │     💬 ' + d.title + (d.author ? ' — ' + d.author : ''));
        }
      }

      // Rubrics
      if (course.rubrics.length > 0) {
        console.log('  │   Rubrics (' + course.rubrics.length + '):');
        for (const r of course.rubrics.slice(0, 3)) {
          console.log('  │     📋 ' + r.title + ' (' + r.pointsPossible + ' pts, ' + r.criteriaCount + ' criteria)');
        }
      }

      if (course.hasSyllabus) {
        console.log('  │   📄 Has syllabus');
      }

      // Show next few upcoming for this course
      const courseUpcoming = course.assignments
        .filter((a) => a.status === 'upcoming' && a.dueAt)
        .sort((a, b) => new Date(a.dueAt!).getTime() - new Date(b.dueAt!).getTime())
        .slice(0, 3);
      if (courseUpcoming.length > 0) {
        console.log('  │   Next due:');
        for (const a of courseUpcoming) {
          const due = new Date(a.dueAt!);
          const dateStr = due.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
          console.log('  │     ' + dateStr.padEnd(8) + a.name + ' (' + a.pointsPossible + ' pts)');
        }
      }
    }
    console.log('  └───');
  }

  // Calendar
  if (data.calendarEvents.length > 0) {
    console.log('\n  CALENDAR (next 90 days, first 10):');
    for (const e of data.calendarEvents.slice(0, 10)) {
      const date = new Date(e.startAt).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
      console.log('    ' + date.padEnd(16) + e.title.padEnd(40) + e.course);
    }
  }

  // Announcements
  if (data.announcements.length > 0) {
    console.log('\n  ANNOUNCEMENTS (recent ' + Math.min(data.announcements.length, 10) + '):');
    for (const a of data.announcements.slice(0, 10)) {
      const date = new Date(a.postedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      const preview = a.message.substring(0, 80) + (a.message.length > 80 ? '...' : '');
      console.log('    ' + date.padEnd(8) + '[' + a.course + '] ' + a.title);
      console.log('            ' + preview);
    }
  }

  console.log('\n' + line);
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

if (require.main === module) {
  if (!CANVAS_URL || !CANVAS_TOKEN) {
    console.error('Usage: CANVAS_URL=https://school.instructure.com CANVAS_TOKEN=your-token npx ts-node src/harness/canvas-full-extract.ts');
    console.error('  or:  npx ts-node src/harness/canvas-full-extract.ts --url https://school.instructure.com --token your-token');
    process.exit(1);
  }

  console.log('🔬 Canvas Full Extractor');
  console.log('   ' + new Date().toISOString() + '\n');

  extractCanvasFull(CANVAS_URL, CANVAS_TOKEN)
    .then((result) => {
      printReport(result);

      mkdirSync('harness-output', { recursive: true });
      writeFileSync('harness-output/canvas-full-extract.json', JSON.stringify(result, null, 2), 'utf8');
      console.log('\n  Saved to harness-output/canvas-full-extract.json');
    })
    .catch((err) => {
      console.error('Extract failed:', err);
      process.exit(1);
    });
}
