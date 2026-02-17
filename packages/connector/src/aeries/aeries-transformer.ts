import type {
  ISlcDeltaOp,
  ISlcEntityKey,
  ISlcAssignment,
  ISlcCourse,
  ISlcGradeSnapshot,
  ISlcAcademicTerm,
  ISlcAttendanceEvent,
  ISlcTeacher,
  ISlcInstitution,
} from '@scholaracle/contracts';
import type {
  IAeriesReportCardCourse,
  IAeriesMarkingPeriod,
  IAeriesAssignment,
  IAeriesAssignmentScore,
  IAeriesSection,
  IAeriesCourse,
  IAeriesSchool,
  IAeriesClassScheduleEntry,
} from './aeries-client';
import { reconcileCourse, type IReconciledCourse } from '../reconciliation/subject-reconciler';

type BaseKey = Omit<ISlcEntityKey, 'externalId'>;

// ---------------------------------------------------------------------------
// Assignment helpers
// ---------------------------------------------------------------------------

/** Map Aeries assignment score state to Scholaracle status. */
export function mapAeriesAssignmentStatus(
  assignment: IAeriesAssignment,
  score: IAeriesAssignmentScore | undefined
): ISlcAssignment['status'] {
  if (score?.IsMissing) return 'missing';
  if (score && score.PointsEarned > 0) return 'graded';
  if (score && score.Mark && score.Mark !== '' && score.Mark !== '0') return 'graded';
  if (score && score.DateCompleted) return 'submitted';
  if (assignment.GradingCompleted && !score) return 'missing';
  return 'unknown';
}

// ---------------------------------------------------------------------------
// Transformers
// ---------------------------------------------------------------------------

/** Transform an Aeries assignment + optional score into an assignment op. */
export function transformAssignmentToOp(
  assignment: IAeriesAssignment,
  score: IAeriesAssignmentScore | undefined,
  courseId: string,
  baseKey: BaseKey
): ISlcDeltaOp<ISlcAssignment> {
  return {
    op: 'upsert',
    entity: 'assignment',
    key: {
      ...baseKey,
      externalId: `aeries-assignment-${assignment.GradebookNumber}-${assignment.AssignmentNumber}`,
      courseExternalId: `aeries-course-${courseId}`,
    },
    observedAt: new Date().toISOString(),
    record: {
      title: assignment.Description,
      dueAt: assignment.DateDue ? new Date(assignment.DateDue).toISOString() : undefined,
      status: mapAeriesAssignmentStatus(assignment, score),
      pointsPossible: assignment.PointsPossible,
      pointsEarned: score?.PointsEarned ?? undefined,
    },
  };
}

/** Transform assignments from a gradebook into assignment ops. */
export function transformAssignmentsToOps(
  assignments: readonly IAeriesAssignment[],
  scores: ReadonlyMap<number, IAeriesAssignmentScore>,
  courseId: string,
  baseKey: BaseKey
): readonly ISlcDeltaOp<ISlcAssignment>[] {
  return assignments.map((a) =>
    transformAssignmentToOp(a, scores.get(a.AssignmentNumber), courseId, baseKey)
  );
}

/** Transform an Aeries report card course into grade snapshot ops (one per marking period). */
export function transformReportCardToGradeOps(
  course: IAeriesReportCardCourse,
  baseKey: BaseKey
): readonly ISlcDeltaOp<ISlcGradeSnapshot>[] {
  return course.MarkingPeriodGrades
    .filter((mpg) => mpg.Mark && mpg.Mark.trim() !== '')
    .map((mpg) => ({
      op: 'upsert' as const,
      entity: 'gradeSnapshot' as const,
      key: {
        ...baseKey,
        externalId: `aeries-grade-${course.CourseID}-mp${mpg.MarkingPeriod}`,
        courseExternalId: `aeries-course-${course.CourseID}`,
        termExternalId: `aeries-term-mp${mpg.MarkingPeriod}`,
      },
      observedAt: new Date().toISOString(),
      record: {
        courseExternalId: `aeries-course-${course.CourseID}`,
        termExternalId: `aeries-term-mp${mpg.MarkingPeriod}`,
        letterGrade: mpg.Mark,
        asOfDate: new Date().toISOString().split('T')[0]!,
      },
    }));
}

/** Transform report card course attendance data into attendance ops. */
export function transformReportCardAttendanceToOps(
  course: IAeriesReportCardCourse,
  baseKey: BaseKey
): readonly ISlcDeltaOp<ISlcAttendanceEvent>[] {
  const ops: ISlcDeltaOp<ISlcAttendanceEvent>[] = [];

  for (const mpg of course.MarkingPeriodGrades) {
    if (mpg.TotalAbsences > 0) {
      ops.push({
        op: 'upsert',
        entity: 'attendanceEvent',
        key: {
          ...baseKey,
          externalId: `aeries-absence-${course.CourseID}-mp${mpg.MarkingPeriod}`,
          courseExternalId: `aeries-course-${course.CourseID}`,
        },
        observedAt: new Date().toISOString(),
        record: {
          date: new Date().toISOString().split('T')[0]!,
          status: mpg.TotalExcusedAbsences > 0 ? 'excused' : 'absent',
          periodName: course.Period,
          notes: `MP${mpg.MarkingPeriod}: ${mpg.TotalAbsences} absence(s), ${mpg.TotalTardies} tardy/tardies`,
        },
      });
    }

    if (mpg.TotalTardies > 0 && mpg.TotalAbsences === 0) {
      ops.push({
        op: 'upsert',
        entity: 'attendanceEvent',
        key: {
          ...baseKey,
          externalId: `aeries-tardy-${course.CourseID}-mp${mpg.MarkingPeriod}`,
          courseExternalId: `aeries-course-${course.CourseID}`,
        },
        observedAt: new Date().toISOString(),
        record: {
          date: new Date().toISOString().split('T')[0]!,
          status: 'tardy',
          periodName: course.Period,
          notes: `MP${mpg.MarkingPeriod}: ${mpg.TotalTardies} tardy/tardies`,
        },
      });
    }
  }

  return ops;
}

/** Transform an Aeries course + section into a course op. */
export function transformCourseToOp(
  course: IAeriesCourse,
  section: IAeriesSection | undefined,
  baseKey: BaseKey
): ISlcDeltaOp<ISlcCourse> {
  const primaryTeacher = section?.SectionStaffMembers?.find((s) => s.IsPrimaryTeacher);
  const teacherName = primaryTeacher
    ? `${primaryTeacher.FirstName} ${primaryTeacher.LastName}`.trim()
    : undefined;

  const reconciled = reconcileCourse(course.Title, teacherName);

  return {
    op: 'upsert',
    entity: 'course',
    key: {
      ...baseKey,
      externalId: `aeries-course-${course.ID}`,
    },
    observedAt: new Date().toISOString(),
    record: {
      title: reconciled.normalizedTitle,
      courseCode: course.ID,
      subjectArea: reconciled.subject.area,
      teacherName,
    },
  };
}

/** Get the reconciled subject info for an Aeries course. */
export function reconcileAeriesCourse(course: IAeriesCourse): IReconciledCourse {
  return reconcileCourse(course.Title);
}

/** Transform an Aeries section staff member into a teacher op. */
export function transformSectionToTeacherOp(
  section: IAeriesSection,
  baseKey: BaseKey
): ISlcDeltaOp<ISlcTeacher> | null {
  const primary = section.SectionStaffMembers?.find((s) => s.IsPrimaryTeacher);
  if (!primary) return null;

  return {
    op: 'upsert',
    entity: 'teacher',
    key: {
      ...baseKey,
      externalId: `aeries-teacher-${primary.StaffID}`,
      courseExternalId: `aeries-course-${section.CourseID}`,
    },
    observedAt: new Date().toISOString(),
    record: {
      name: `${primary.FirstName} ${primary.LastName}`.trim(),
    },
  };
}

/** Transform Aeries marking periods into academic term ops. */
export function transformMarkingPeriodToOp(
  mp: IAeriesMarkingPeriod,
  baseKey: BaseKey
): ISlcDeltaOp<ISlcAcademicTerm> {
  return {
    op: 'upsert',
    entity: 'academicTerm',
    key: {
      ...baseKey,
      externalId: `aeries-term-mp${mp.MarkingPeriod}`,
    },
    observedAt: new Date().toISOString(),
    record: {
      title: mp.LongDescription || mp.ShortDescription,
      startDate: mp.BeginningDate.split('T')[0]!,
      endDate: mp.EndingDate.split('T')[0]!,
      type: inferTermType(mp.LongDescription || mp.ShortDescription),
    },
  };
}

/** Transform an Aeries school into an institution op. */
export function transformSchoolToInstitutionOp(
  school: IAeriesSchool,
  baseKey: BaseKey
): ISlcDeltaOp<ISlcInstitution> {
  const address = [school.Address, school.City, school.State, school.ZipCode]
    .filter(Boolean)
    .join(', ');

  return {
    op: 'upsert',
    entity: 'institution',
    key: {
      ...baseKey,
      externalId: `aeries-school-${school.SchoolCode}`,
    },
    observedAt: new Date().toISOString(),
    record: {
      name: school.SchoolName,
      type: 'school',
      address: address || undefined,
    },
  };
}

/** Transform an Aeries class schedule entry into a course op (lightweight, from schedule). */
export function transformScheduleToCourseOp(
  entry: IAeriesClassScheduleEntry,
  baseKey: BaseKey
): ISlcDeltaOp<ISlcCourse> {
  return {
    op: 'upsert',
    entity: 'course',
    key: {
      ...baseKey,
      externalId: `aeries-course-${entry.CourseID}`,
    },
    observedAt: new Date().toISOString(),
    record: {
      title: entry.CourseID,
      courseCode: entry.CourseID,
    },
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function inferTermType(
  description: string
): ISlcAcademicTerm['type'] {
  const lower = description.toLowerCase();
  if (lower.includes('semester') || lower.includes('sem')) return 'semester';
  if (lower.includes('quarter') || lower.includes('qtr')) return 'quarter';
  if (lower.includes('trimester') || lower.includes('tri')) return 'trimester';
  if (lower.includes('year') || lower.includes('annual')) return 'year';
  return 'other';
}
