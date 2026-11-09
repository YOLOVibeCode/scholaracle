import type { ICourseGrade, IStudentListItem } from '@scholaracle/contracts';
import {
  planPushNavigation,
  resolvePushNav,
  type IPushNavApi,
  type PushTarget,
} from './pushRouting';

const parent = { isLoggedIn: true, role: 'parent' as const };
const student = { isLoggedIn: true, role: 'student' as const };

describe('planPushNavigation', () => {
  it('ignores taps when signed out', () => {
    expect(planPushNavigation({ studentId: 's1' }, { isLoggedIn: false, role: null })).toBeNull();
    expect(
      planPushNavigation({ studentId: 's1' }, { isLoggedIn: false, role: 'parent' })
    ).toBeNull();
  });

  it('sends student sessions home regardless of payload', () => {
    expect(
      planPushNavigation({ studentId: 's1', assignmentId: 'a1', courseId: 'c1' }, student)
    ).toEqual({ kind: 'home' });
    expect(planPushNavigation(undefined, student)).toEqual({ kind: 'home' });
    expect(planPushNavigation({ type: 'deadline' }, student)).toEqual({ kind: 'home' });
  });

  it('opens This week for a student weekly review push; parents never route there', () => {
    expect(planPushNavigation({ type: 'weekly_review', studentId: 's1' }, student)).toEqual({
      kind: 'week',
    });
    expect(planPushNavigation({ type: ' weekly_review ' }, student)).toEqual({ kind: 'week' });
    expect(planPushNavigation({ type: 'weekly_review' }, parent)).toEqual({ kind: 'home' });
    expect(planPushNavigation({ type: 'weekly_review', studentId: 's1' }, parent)).toEqual({
      kind: 'student',
      studentId: 's1',
    });
    expect(planPushNavigation({ type: 'weekly_review' }, { isLoggedIn: false })).toBeNull();
  });

  it('routes to an assignment, with and without a course id', () => {
    expect(
      planPushNavigation({ studentId: 's1', assignmentId: 'a1', courseId: 'c1' }, parent)
    ).toEqual({ kind: 'assignment', studentId: 's1', assignmentId: 'a1', courseId: 'c1' });
    expect(planPushNavigation({ studentId: 's1', assignmentId: 'a1' }, parent)).toEqual({
      kind: 'assignment',
      studentId: 's1',
      assignmentId: 'a1',
    });
  });

  it('routes to a course when only a course id is present', () => {
    expect(planPushNavigation({ studentId: 's1', courseId: 'c1' }, parent)).toEqual({
      kind: 'course',
      studentId: 's1',
      courseId: 'c1',
    });
  });

  it('routes to the student dashboard when only studentId is present', () => {
    expect(
      planPushNavigation({ studentId: 's1', notificationId: 'n', type: 'deadline' }, parent)
    ).toEqual({ kind: 'student', studentId: 's1' });
  });

  it('falls back to home for legacy or malformed payloads', () => {
    const home: PushTarget = { kind: 'home' };
    expect(planPushNavigation({ notificationId: 'n', type: 'x' }, parent)).toEqual(home);
    expect(planPushNavigation(undefined, parent)).toEqual(home);
    expect(planPushNavigation(null, parent)).toEqual(home);
    expect(planPushNavigation('studentId', parent)).toEqual(home);
    expect(planPushNavigation({ studentId: 42, assignmentId: 'a1' }, parent)).toEqual(home);
    expect(planPushNavigation({ studentId: '   ' }, parent)).toEqual(home);
  });

  it('ignores non-string course/assignment ids', () => {
    expect(planPushNavigation({ studentId: 's1', assignmentId: 7, courseId: {} }, parent)).toEqual({
      kind: 'student',
      studentId: 's1',
    });
  });

  it('treats a session with no role as a parent', () => {
    expect(planPushNavigation({ studentId: 's1' }, { isLoggedIn: true })).toEqual({
      kind: 'student',
      studentId: 's1',
    });
  });
});

const kid = { id: 's1', userId: 'u1', name: 'Ava' } as IStudentListItem;
const courses = [
  {
    courseExternalId: 'merged-1',
    courseName: 'Math',
    assignments: [{ externalId: 'a-math', title: 'HW' }],
  },
  {
    courseExternalId: 'merged-2',
    courseName: 'Art',
    assignments: [{ externalId: 'a-art', title: 'Sketch' }],
  },
] as unknown as ICourseGrade[];

function makeApi(overrides: Partial<Record<keyof IPushNavApi, jest.Mock>> = {}): IPushNavApi & {
  getStudents: jest.Mock;
  getStudentGrades: jest.Mock;
} {
  return {
    getStudents: jest.fn().mockResolvedValue([kid]),
    getStudentGrades: jest.fn().mockResolvedValue({ courseGrades: courses }),
    ...overrides,
  } as never;
}

describe('resolvePushNav', () => {
  it('home needs no network', async () => {
    const api = makeApi();
    expect(await resolvePushNav({ kind: 'home' }, 'parent', api)).toEqual({ view: 'students' });
    expect(await resolvePushNav({ kind: 'home' }, 'student', api)).toEqual({ view: 'today' });
    expect(api.getStudents).not.toHaveBeenCalled();
  });

  it('This week needs no network and stays student-only', async () => {
    const api = makeApi();
    expect(await resolvePushNav({ kind: 'week' }, 'student', api)).toEqual({ view: 'week' });
    expect(await resolvePushNav({ kind: 'week' }, 'parent', api)).toEqual({ view: 'students' });
    expect(api.getStudents).not.toHaveBeenCalled();
  });

  it('opens the student dashboard', async () => {
    const api = makeApi();
    expect(await resolvePushNav({ kind: 'student', studentId: 's1' }, 'parent', api)).toEqual({
      view: 'dashboard',
      student: kid,
    });
    expect(api.getStudentGrades).not.toHaveBeenCalled();
  });

  it('falls back to home when the student is unknown or the lookup fails', async () => {
    expect(await resolvePushNav({ kind: 'student', studentId: 'zz' }, 'parent', makeApi())).toEqual(
      { view: 'students' }
    );
    const failing = makeApi({ getStudents: jest.fn().mockRejectedValue(new Error('offline')) });
    expect(await resolvePushNav({ kind: 'student', studentId: 's1' }, 'parent', failing)).toEqual({
      view: 'students',
    });
  });

  it('opens a course on an exact id match, else the dashboard', async () => {
    const api = makeApi();
    const hit = await resolvePushNav(
      { kind: 'course', studentId: 's1', courseId: 'merged-2' },
      'parent',
      api
    );
    expect(hit).toEqual({ view: 'course-detail', student: kid, course: courses[1] });
    const miss = await resolvePushNav(
      { kind: 'course', studentId: 's1', courseId: 'raw-portal-id' },
      'parent',
      api
    );
    expect(miss).toEqual({ view: 'dashboard', student: kid });
  });

  it('opens an assignment found in any course, preferring the named course', async () => {
    const api = makeApi();
    expect(
      await resolvePushNav(
        { kind: 'assignment', studentId: 's1', assignmentId: 'a-art' },
        'parent',
        api
      )
    ).toEqual({
      view: 'assignment-detail',
      student: kid,
      course: courses[1],
      assignment: courses[1]!.assignments[0],
    });
    const named = await resolvePushNav(
      { kind: 'assignment', studentId: 's1', assignmentId: 'a-math', courseId: 'merged-2' },
      'parent',
      api
    );
    expect(named.course).toBe(courses[0]);
    const preferred = await resolvePushNav(
      { kind: 'assignment', studentId: 's1', assignmentId: 'a-art', courseId: 'merged-2' },
      'parent',
      api
    );
    expect(preferred.course).toBe(courses[1]);
  });

  it('falls back to the dashboard when the assignment is not found', async () => {
    expect(
      await resolvePushNav(
        { kind: 'assignment', studentId: 's1', assignmentId: 'gone' },
        'parent',
        makeApi()
      )
    ).toEqual({ view: 'dashboard', student: kid });
  });

  it('falls back to home when the grades lookup fails', async () => {
    const api = makeApi({ getStudentGrades: jest.fn().mockRejectedValue(new Error('500')) });
    expect(
      await resolvePushNav({ kind: 'course', studentId: 's1', courseId: 'merged-1' }, 'parent', api)
    ).toEqual({ view: 'students' });
  });
});
