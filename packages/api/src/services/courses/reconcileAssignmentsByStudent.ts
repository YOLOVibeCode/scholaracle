import {
  mergeCourses,
  reconcileAssignments,
  type IAssignmentForReconciliation,
  type IAssignmentMatch,
  type ISourceCourse,
} from '@scholaracle/connector';

/** An assignment before its merged class is known. */
export type IStudentAssignment = Omit<IAssignmentForReconciliation, 'mergedCourseId'> & {
  readonly studentExternalId?: string;
};

/**
 * Pair LMS assignments with gradebook assignments one student at a time, so a sibling's class
 * with the same name can never clear this student's missing work. Courses saved without a
 * student join every student's merge; assignments saved without one see every course.
 */
export function reconcileAssignmentsByStudent(params: {
  readonly courses: readonly ISourceCourse[];
  readonly lms: readonly IStudentAssignment[];
  readonly sis: readonly IStudentAssignment[];
}): readonly IAssignmentMatch[] {
  const students = new Set(params.lms.map((a) => a.studentExternalId ?? ''));
  const matches: IAssignmentMatch[] = [];

  for (const student of students) {
    const courses = params.courses
      .filter((c) => !student || !c.studentExternalId || c.studentExternalId === student)
      .map(({ studentExternalId: _student, ...c }) => c);
    const mergedIdByCourse = new Map<string, string>();
    for (const group of mergeCourses(courses)) {
      for (const source of group.sources) mergedIdByCourse.set(source.externalId, group.mergedId);
    }

    const ofStudent = (a: IStudentAssignment): boolean => (a.studentExternalId ?? '') === student;
    const inClass = ({
      studentExternalId: _student,
      ...a
    }: IStudentAssignment): IAssignmentForReconciliation => ({
      ...a,
      mergedCourseId: mergedIdByCourse.get(a.courseExternalId) ?? a.courseExternalId,
    });
    matches.push(
      ...reconcileAssignments(
        params.lms.filter(ofStudent).map(inClass),
        params.sis.filter(ofStudent).map(inClass)
      )
    );
  }

  return matches;
}
