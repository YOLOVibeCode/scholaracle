/**
 * Where a tapped push notification should take the user.
 *
 * Pure planning (`planPushNavigation`) is separate from the async lookup that turns ids into the
 * objects the screens need (`resolvePushNav`), so both are unit-tested without React or network.
 *
 * Push `data` comes from the server (ExpoPushDelivery.buildPushData): `studentId` (the student's
 * Mongo id, i.e. IStudentListItem.id), and optionally `assignmentId` / `courseId` / `alertId`.
 * Older builds of the server send only `notificationId` and `type`; those fall back to home.
 * A student push with `type: 'weekly_review'` (R4) opens This week.
 */

import {
  WEEKLY_REVIEW_PUSH_TYPE,
  type UserRole,
  type IStudentListItem,
  type IStudentGradesResponse,
  type ICourseGrade,
  type ICourseGradeAssignment,
} from '@scholaracle/contracts';
import { homeViewForRole, isStudentSession } from '../studio/studentMode';

/** `data.type` of the weekly review push (student review spec §3.3); the worker sets the same constant. */
export { WEEKLY_REVIEW_PUSH_TYPE };

export type PushTarget =
  | { readonly kind: 'home' }
  | { readonly kind: 'week' }
  | { readonly kind: 'student'; readonly studentId: string }
  | { readonly kind: 'course'; readonly studentId: string; readonly courseId: string }
  | {
      readonly kind: 'assignment';
      readonly studentId: string;
      readonly assignmentId: string;
      readonly courseId?: string;
    };

export interface IPushSession {
  readonly isLoggedIn: boolean;
  readonly role?: UserRole | null;
}

function str(data: Readonly<Record<string, unknown>>, key: string): string | undefined {
  const value = data[key];
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

/**
 * Decide the target for a tap. Returns null when nothing should happen (signed out). Student
 * sessions go home (Today), or to This week for a weekly review push: they have no
 * dashboard/course/assignment views.
 */
export function planPushNavigation(data: unknown, session: IPushSession): PushTarget | null {
  if (!session.isLoggedIn) return null;
  const d =
    data && typeof data === 'object' ? (data as Readonly<Record<string, unknown>>) : undefined;
  if (isStudentSession(session.role)) {
    return d !== undefined && str(d, 'type') === WEEKLY_REVIEW_PUSH_TYPE
      ? { kind: 'week' }
      : { kind: 'home' };
  }
  if (d === undefined) return { kind: 'home' };
  const studentId = str(d, 'studentId');
  if (!studentId) return { kind: 'home' };
  const assignmentId = str(d, 'assignmentId');
  const courseId = str(d, 'courseId');
  if (assignmentId) {
    return courseId
      ? { kind: 'assignment', studentId, assignmentId, courseId }
      : { kind: 'assignment', studentId, assignmentId };
  }
  if (courseId) return { kind: 'course', studentId, courseId };
  return { kind: 'student', studentId };
}

/** The slice of the app's nav state a push can set. */
export interface IPushNavResult {
  readonly view:
    'students' | 'today' | 'week' | 'dashboard' | 'course-detail' | 'assignment-detail';
  readonly student?: IStudentListItem;
  readonly course?: ICourseGrade;
  readonly assignment?: ICourseGradeAssignment;
}

export interface IPushNavApi {
  getStudents(): Promise<IStudentListItem[]>;
  getStudentGrades(studentId: string): Promise<IStudentGradesResponse>;
}

/**
 * Turn a target into screen state. Degrades one step at a time and never throws:
 * unknown assignment/course -> that student's dashboard; unknown student or any API failure
 * -> the home view. Course ids are matched exactly (grades use merged ids), so a raw portal
 * course id that does not match lands on the dashboard rather than the wrong course.
 */
export async function resolvePushNav(
  target: PushTarget,
  role: UserRole | null | undefined,
  api: IPushNavApi
): Promise<IPushNavResult> {
  const home: IPushNavResult = { view: homeViewForRole(role) };
  if (target.kind === 'home') return home;
  if (target.kind === 'week') return isStudentSession(role) ? { view: 'week' } : home;
  try {
    const students = await api.getStudents();
    const student = students.find((s) => s.id === target.studentId);
    if (!student) return home;
    if (target.kind === 'student') return { view: 'dashboard', student };

    const { courseGrades } = await api.getStudentGrades(student.id);
    if (target.kind === 'course') {
      const course = courseGrades.find((c) => c.courseExternalId === target.courseId);
      return course ? { view: 'course-detail', student, course } : { view: 'dashboard', student };
    }
    const preferred = target.courseId;
    const candidates = preferred
      ? [
          ...courseGrades.filter((c) => c.courseExternalId === preferred),
          ...courseGrades.filter((c) => c.courseExternalId !== preferred),
        ]
      : courseGrades;
    for (const course of candidates) {
      const assignment = course.assignments.find((a) => a.externalId === target.assignmentId);
      if (assignment) return { view: 'assignment-detail', student, course, assignment };
    }
    return { view: 'dashboard', student };
  } catch {
    return home;
  }
}
