import {
  mapOneRosterStatus,
  transformLineItemToOp,
  transformCourseToOp,
  transformAcademicSessionToOp,
  transformOrgToOp,
} from './oneroster-transformer';
import type {
  IOneRosterLineItem,
  IOneRosterResult,
  IOneRosterCourse,
  IOneRosterAcademicSession,
  IOneRosterOrg,
} from './oneroster-client';

const BASE_KEY = {
  provider: 'oneroster',
  adapterId: 'org.imsglobal.oneroster.1.2',
  studentExternalId: 'self',
  institutionExternalId: 'or-instance',
};

describe('mapOneRosterStatus', () => {
  it('should return unknown for undefined result', () => {
    expect(mapOneRosterStatus(undefined)).toBe('unknown');
  });

  it('should return graded for fully graded', () => {
    expect(
      mapOneRosterStatus({ scoreStatus: 'fully graded' } as IOneRosterResult)
    ).toBe('graded');
  });

  it('should return graded for partially graded', () => {
    expect(
      mapOneRosterStatus({ scoreStatus: 'partially graded' } as IOneRosterResult)
    ).toBe('graded');
  });

  it('should return submitted for submitted', () => {
    expect(
      mapOneRosterStatus({ scoreStatus: 'submitted' } as IOneRosterResult)
    ).toBe('submitted');
  });

  it('should return missing for not submitted', () => {
    expect(
      mapOneRosterStatus({ scoreStatus: 'not submitted' } as IOneRosterResult)
    ).toBe('missing');
  });

  it('should return unknown for exempt', () => {
    expect(
      mapOneRosterStatus({ scoreStatus: 'exempt' } as IOneRosterResult)
    ).toBe('unknown');
  });
});

describe('transformLineItemToOp', () => {
  const lineItem: IOneRosterLineItem = {
    sourcedId: 'li-1',
    title: 'Chapter 3 Quiz',
    dueDate: '2025-10-15',
    resultValueMax: 50,
    class: { sourcedId: 'cls-1' },
  };

  it('should produce a valid assignment op', () => {
    const op = transformLineItemToOp(lineItem, undefined, BASE_KEY);

    expect(op.op).toBe('upsert');
    expect(op.entity).toBe('assignment');
    expect(op.key.externalId).toBe('or-lineitem-li-1');
    expect(op.key.courseExternalId).toBe('or-class-cls-1');
    expect(op.record!.title).toBe('Chapter 3 Quiz');
    expect(op.record!.dueAt).toBe('2025-10-15T23:59:59Z');
    expect(op.record!.pointsPossible).toBe(50);
    expect(op.record!.status).toBe('unknown');
  });

  it('should include result score', () => {
    const result: IOneRosterResult = {
      sourcedId: 'r-1',
      lineItem: { sourcedId: 'li-1' },
      student: { sourcedId: 'stu-1' },
      score: 45,
      scoreStatus: 'fully graded',
      scoreDate: '2025-10-16',
    };
    const op = transformLineItemToOp(lineItem, result, BASE_KEY);

    expect(op.record!.pointsEarned).toBe(45);
    expect(op.record!.status).toBe('graded');
  });
});

describe('transformCourseToOp', () => {
  it('should produce a valid course op', () => {
    const course: IOneRosterCourse = {
      sourcedId: 'crs-1',
      title: 'Algebra II',
      courseCode: 'ALG2',
      subjects: ['Mathematics'],
    };
    const op = transformCourseToOp(course, BASE_KEY);

    expect(op.op).toBe('upsert');
    expect(op.entity).toBe('course');
    expect(op.key.externalId).toBe('or-course-crs-1');
    expect(op.record!.title).toBe('Algebra II');
    expect(op.record!.courseCode).toBe('ALG2');
    expect(op.record!.subjectArea).toBe('Mathematics');
  });
});

describe('transformAcademicSessionToOp', () => {
  it('should produce a valid academic term op', () => {
    const session: IOneRosterAcademicSession = {
      sourcedId: 'ses-1',
      title: 'Fall 2025',
      startDate: '2025-08-20',
      endDate: '2025-12-19',
      type: 'semester',
      schoolYear: '2025',
    };
    const op = transformAcademicSessionToOp(session, BASE_KEY);

    expect(op.op).toBe('upsert');
    expect(op.entity).toBe('academicTerm');
    expect(op.key.externalId).toBe('or-session-ses-1');
    expect(op.record!.title).toBe('Fall 2025');
    expect(op.record!.startDate).toBe('2025-08-20');
    expect(op.record!.endDate).toBe('2025-12-19');
    expect(op.record!.type).toBe('semester');
  });

  it('should map gradingPeriod to quarter', () => {
    const session: IOneRosterAcademicSession = {
      sourcedId: 'ses-2',
      title: 'Q1',
      startDate: '2025-08-20',
      endDate: '2025-10-15',
      type: 'gradingPeriod',
      schoolYear: '2025',
    };
    const op = transformAcademicSessionToOp(session, BASE_KEY);
    expect(op.record!.type).toBe('quarter');
  });
});

describe('transformOrgToOp', () => {
  it('should produce a valid institution op', () => {
    const org: IOneRosterOrg = {
      sourcedId: 'org-1',
      name: 'Lincoln High School',
      type: 'school',
    };
    const op = transformOrgToOp(org, BASE_KEY);

    expect(op.op).toBe('upsert');
    expect(op.entity).toBe('institution');
    expect(op.key.externalId).toBe('or-org-org-1');
    expect(op.record!.name).toBe('Lincoln High School');
    expect(op.record!.type).toBe('school');
  });

  it('should map district type', () => {
    const org: IOneRosterOrg = {
      sourcedId: 'org-2',
      name: 'Springfield USD',
      type: 'district',
    };
    const op = transformOrgToOp(org, BASE_KEY);
    expect(op.record!.type).toBe('district');
  });
});
