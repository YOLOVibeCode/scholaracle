import type {
  ISlcDeltaOp,
  ISlcEntityKey,
  ISlcAssignment,
  ISlcCourse,
  ISlcGradeSnapshot,
  ISlcAttendanceEvent,
  ISlcTeacher,
  ISlcCourseMaterial,
  ISlcMessage,
} from '@scholaracle/contracts';
import type {
  ISkywardReport,
  ISkywardGradebook,
  ISkywardAssignment,
  ISkywardAttendanceRecord,
  ISkywardScheduleEntry,
  ISkywardMessage,
  ISkywardDocument,
} from './skyward-client';
import { reconcileCourse, type IReconciledCourse } from '../reconciliation/subject-reconciler';

type BaseKey = Omit<ISlcEntityKey, 'externalId'>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Map Skyward assignment meta flags to Scholaracle status. */
export function mapSkywardAssignmentStatus(
  assignment: ISkywardAssignment
): ISlcAssignment['status'] {
  const types = assignment.meta.map((m) => m.type);
  if (types.includes('missing')) return 'missing';
  if (types.includes('absent')) return 'unknown';
  if (assignment.grade !== null) return 'graded';
  if (assignment.score !== null) return 'submitted';
  return 'unknown';
}

// ---------------------------------------------------------------------------
// Transformers
// ---------------------------------------------------------------------------

/** Transform a Skyward assignment into an ISlcDeltaOp. */
export function transformSkywardAssignmentToOp(
  assignment: ISkywardAssignment,
  _courseTitle: string,
  _category: string,
  courseId: number,
  baseKey: BaseKey
): ISlcDeltaOp<ISlcAssignment> {
  return {
    op: 'upsert',
    entity: 'assignment',
    key: {
      ...baseKey,
      externalId: `skyward-${courseId}-${assignment.title}-${assignment.date}`,
      courseExternalId: `skyward-course-${courseId}`,
    },
    observedAt: new Date().toISOString(),
    record: {
      title: assignment.title,
      dueAt: assignment.date ? new Date(assignment.date).toISOString() : undefined,
      status: mapSkywardAssignmentStatus(assignment),
      pointsPossible: assignment.points.total ?? undefined,
      pointsEarned: assignment.points.earned ?? undefined,
    },
  };
}

/** Transform a Skyward report course into a grade snapshot. */
export function transformReportToGradeOps(
  report: ISkywardReport,
  baseKey: BaseKey
): readonly ISlcDeltaOp<ISlcGradeSnapshot>[] {
  return report.scores
    .filter((s) => s.score !== null)
    .map((s) => ({
      op: 'upsert' as const,
      entity: 'gradeSnapshot' as const,
      key: {
        ...baseKey,
        externalId: `skyward-grade-${report.course}-${s.bucket}`,
        courseExternalId: `skyward-course-${report.course}`,
        termExternalId: `skyward-term-${s.bucket}`,
      },
      observedAt: new Date().toISOString(),
      record: {
        courseExternalId: `skyward-course-${report.course}`,
        percentGrade: s.score!,
        asOfDate: new Date().toISOString().split('T')[0]!,
      },
    }));
}

/** Transform a Skyward gradebook into assignment ops. */
export function transformGradebookToAssignmentOps(
  gradebook: ISkywardGradebook,
  courseId: number,
  baseKey: BaseKey
): readonly ISlcDeltaOp<ISlcAssignment>[] {
  const ops: ISlcDeltaOp<ISlcAssignment>[] = [];

  for (const category of gradebook.gradebook) {
    for (const assignment of category.assignments) {
      ops.push(
        transformSkywardAssignmentToOp(
          assignment,
          gradebook.course,
          category.category,
          courseId,
          baseKey
        )
      );
    }
  }

  return ops;
}

/** Transform a Skyward course (from gradebook) into a course op with subject reconciliation. */
export function transformSkywardCourseToOp(
  gradebook: ISkywardGradebook,
  courseId: number,
  baseKey: BaseKey
): ISlcDeltaOp<ISlcCourse> {
  const reconciled = reconcileCourse(gradebook.course, gradebook.instructor);

  return {
    op: 'upsert',
    entity: 'course',
    key: {
      ...baseKey,
      externalId: `skyward-course-${courseId}`,
    },
    observedAt: new Date().toISOString(),
    record: {
      title: reconciled.normalizedTitle,
      courseCode: String(courseId),
      subjectArea: reconciled.subject.area,
      teacherName: gradebook.instructor,
    },
  };
}

/** Get the reconciled subject info for a Skyward course. */
export function reconcileSkywardCourse(
  gradebook: ISkywardGradebook
): IReconciledCourse {
  return reconcileCourse(gradebook.course, gradebook.instructor);
}

// ---------------------------------------------------------------------------
// Extended transformers (for data beyond what skyward-rest provides)
// ---------------------------------------------------------------------------

/** Transform a Skyward attendance record into an ISlcDeltaOp. */
export function transformAttendanceToOp(
  record: ISkywardAttendanceRecord,
  baseKey: BaseKey
): ISlcDeltaOp<ISlcAttendanceEvent> {
  return {
    op: 'upsert',
    entity: 'attendanceEvent',
    key: {
      ...baseKey,
      externalId: `skyward-attendance-${record.date}-${record.period}`,
    },
    observedAt: new Date().toISOString(),
    record: {
      date: record.date,
      status: record.status,
      periodName: record.period,
      notes: record.note,
    },
  };
}

/** Transform a Skyward schedule entry into teacher + course ops. */
export function transformScheduleToTeacherOp(
  entry: ISkywardScheduleEntry,
  baseKey: BaseKey
): ISlcDeltaOp<ISlcTeacher> {
  return {
    op: 'upsert',
    entity: 'teacher',
    key: {
      ...baseKey,
      externalId: `skyward-teacher-${entry.courseId}-${entry.teacherName.replace(/\s+/g, '-').toLowerCase()}`,
      courseExternalId: `skyward-course-${entry.courseId}`,
    },
    observedAt: new Date().toISOString(),
    record: {
      name: entry.teacherName,
      email: entry.teacherEmail,
    },
  };
}

/** Transform a Skyward document into an ISlcDeltaOp. */
export function transformDocumentToOp(
  doc: ISkywardDocument,
  baseKey: BaseKey
): ISlcDeltaOp<ISlcCourseMaterial> {
  return {
    op: 'upsert',
    entity: 'courseMaterial',
    key: {
      ...baseKey,
      externalId: `skyward-doc-${doc.courseId ?? 'general'}-${doc.title.replace(/\s+/g, '-').toLowerCase()}`,
      courseExternalId: doc.courseId ? `skyward-course-${doc.courseId}` : undefined,
    },
    observedAt: new Date().toISOString(),
    record: {
      title: doc.title,
      courseExternalId: doc.courseId ? `skyward-course-${doc.courseId}` : '',
      type: doc.type,
      url: doc.url,
      fileName: doc.fileName,
      postedAt: doc.postedAt,
    },
  };
}

/** Transform a Skyward message into an ISlcDeltaOp. */
export function transformMessageToOp(
  msg: ISkywardMessage,
  baseKey: BaseKey
): ISlcDeltaOp<ISlcMessage> {
  return {
    op: 'upsert',
    entity: 'message',
    key: {
      ...baseKey,
      externalId: `skyward-msg-${msg.id}`,
    },
    observedAt: new Date().toISOString(),
    record: {
      subject: msg.subject,
      body: msg.body,
      senderName: msg.senderName,
      senderRole: msg.senderRole,
      sentAt: msg.sentAt,
      read: msg.read,
    },
  };
}
