import type {
  ISlcDeltaOp,
  ISlcEntityKey,
  ISlcAssignment,
  ISlcCourse,
  ISlcAcademicTerm,
  ISlcInstitution,
} from '@scholaracle/contracts';
import type {
  IOneRosterLineItem,
  IOneRosterResult,
  IOneRosterCourse,
  IOneRosterAcademicSession,
  IOneRosterOrg,
} from './oneroster-client';

type BaseKey = Omit<ISlcEntityKey, 'externalId'>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Map OneRoster scoreStatus to Scholaracle assignment status. */
export function mapOneRosterStatus(result: IOneRosterResult | undefined): ISlcAssignment['status'] {
  if (!result) return 'unknown';
  switch (result.scoreStatus) {
    case 'fully graded':
    case 'partially graded':
      return 'graded';
    case 'submitted':
      return 'submitted';
    case 'not submitted':
      return 'missing';
    case 'exempt':
      return 'unknown';
    default:
      return 'unknown';
  }
}

// ---------------------------------------------------------------------------
// Transformers
// ---------------------------------------------------------------------------

export function transformLineItemToOp(
  lineItem: IOneRosterLineItem,
  result: IOneRosterResult | undefined,
  baseKey: BaseKey
): ISlcDeltaOp<ISlcAssignment> {
  return {
    op: 'upsert',
    entity: 'assignment',
    key: {
      ...baseKey,
      externalId: `or-lineitem-${lineItem.sourcedId}`,
      courseExternalId: lineItem.class ? `or-class-${lineItem.class.sourcedId}` : undefined,
    },
    observedAt: new Date().toISOString(),
    record: {
      title: lineItem.title,
      dueAt: lineItem.dueDate ? `${lineItem.dueDate}T23:59:59Z` : undefined,
      status: mapOneRosterStatus(result),
      pointsPossible: lineItem.resultValueMax,
      pointsEarned: result?.score,
    },
  };
}

export function transformCourseToOp(
  course: IOneRosterCourse,
  baseKey: BaseKey
): ISlcDeltaOp<ISlcCourse> {
  return {
    op: 'upsert',
    entity: 'course',
    key: {
      ...baseKey,
      externalId: `or-course-${course.sourcedId}`,
    },
    observedAt: new Date().toISOString(),
    record: {
      title: course.title,
      courseCode: course.courseCode,
      subjectArea: course.subjects?.[0],
    },
  };
}

export function transformAcademicSessionToOp(
  session: IOneRosterAcademicSession,
  baseKey: BaseKey
): ISlcDeltaOp<ISlcAcademicTerm> {
  const typeMap: Record<string, ISlcAcademicTerm['type']> = {
    semester: 'semester',
    gradingPeriod: 'quarter',
    term: 'trimester',
    schoolYear: 'year',
  };

  return {
    op: 'upsert',
    entity: 'academicTerm',
    key: {
      ...baseKey,
      externalId: `or-session-${session.sourcedId}`,
    },
    observedAt: new Date().toISOString(),
    record: {
      title: session.title,
      startDate: session.startDate,
      endDate: session.endDate,
      type: typeMap[session.type] ?? 'other',
    },
  };
}

export function transformOrgToOp(
  org: IOneRosterOrg,
  baseKey: BaseKey
): ISlcDeltaOp<ISlcInstitution> {
  const typeMap: Record<string, ISlcInstitution['type']> = {
    school: 'school',
    district: 'district',
  };

  return {
    op: 'upsert',
    entity: 'institution',
    key: {
      ...baseKey,
      externalId: `or-org-${org.sourcedId}`,
    },
    observedAt: new Date().toISOString(),
    record: {
      name: org.name,
      type: typeMap[org.type] ?? 'other',
    },
  };
}
