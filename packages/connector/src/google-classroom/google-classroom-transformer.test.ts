import {
  googleDateToIso,
  mapGoogleSubmissionStatus,
  transformCourseWorkToOp,
  transformCourseToOp,
  transformGradeSnapshotToOp,
} from './google-classroom-transformer';
import type {
  IGoogleCourseWork,
  IGoogleStudentSubmission,
  IGoogleCourse,
} from './google-classroom-client';

const BASE_KEY = {
  provider: 'google-classroom',
  adapterId: 'com.google.classroom',
  studentExternalId: 'self',
  institutionExternalId: 'gc-instance',
};

describe('googleDateToIso', () => {
  it('should convert date + time to ISO string', () => {
    expect(googleDateToIso({ year: 2025, month: 10, day: 15 }, { hours: 14, minutes: 30 })).toBe(
      '2025-10-15T14:30:00Z'
    );
  });

  it('should default to 23:59:59Z when no time given', () => {
    expect(googleDateToIso({ year: 2025, month: 3, day: 5 })).toBe('2025-03-05T23:59:59Z');
  });

  it('should return undefined when no date given', () => {
    expect(googleDateToIso(undefined)).toBeUndefined();
  });

  it('should handle midnight (0 hours, 0 minutes)', () => {
    expect(googleDateToIso({ year: 2025, month: 1, day: 1 }, { hours: 0, minutes: 0 })).toBe(
      '2025-01-01T00:00:00Z'
    );
  });
});

describe('mapGoogleSubmissionStatus', () => {
  it('should return unknown for undefined submission', () => {
    expect(mapGoogleSubmissionStatus(undefined)).toBe('unknown');
  });

  it('should return late when late is true', () => {
    expect(
      mapGoogleSubmissionStatus({ late: true, state: 'TURNED_IN' } as IGoogleStudentSubmission)
    ).toBe('late');
  });

  it('should return graded when assignedGrade is present', () => {
    expect(
      mapGoogleSubmissionStatus({
        assignedGrade: 90,
        state: 'RETURNED',
        late: false,
      } as IGoogleStudentSubmission)
    ).toBe('graded');
  });

  it('should return submitted for TURNED_IN without grade', () => {
    expect(
      mapGoogleSubmissionStatus({ state: 'TURNED_IN', late: false } as IGoogleStudentSubmission)
    ).toBe('submitted');
  });

  it('should return graded for RETURNED without assignedGrade', () => {
    expect(
      mapGoogleSubmissionStatus({ state: 'RETURNED', late: false } as IGoogleStudentSubmission)
    ).toBe('graded');
  });

  it('should return missing for NEW or CREATED', () => {
    expect(
      mapGoogleSubmissionStatus({ state: 'NEW', late: false } as IGoogleStudentSubmission)
    ).toBe('missing');
    expect(
      mapGoogleSubmissionStatus({ state: 'CREATED', late: false } as IGoogleStudentSubmission)
    ).toBe('missing');
  });
});

describe('transformCourseWorkToOp', () => {
  const courseWork: IGoogleCourseWork = {
    id: 'cw-1',
    courseId: 'c-1',
    title: 'Essay on History',
    dueDate: { year: 2025, month: 11, day: 20 },
    dueTime: { hours: 17, minutes: 0 },
    maxPoints: 100,
    workType: 'ASSIGNMENT',
    state: 'PUBLISHED',
  };

  it('should produce a valid assignment op', () => {
    const op = transformCourseWorkToOp(courseWork, undefined, BASE_KEY);

    expect(op.op).toBe('upsert');
    expect(op.entity).toBe('assignment');
    expect(op.key.externalId).toBe('gc-coursework-cw-1');
    expect(op.key.courseExternalId).toBe('gc-course-c-1');
    expect(op.record!.title).toBe('Essay on History');
    expect(op.record!.dueAt).toBe('2025-11-20T17:00:00Z');
    expect(op.record!.pointsPossible).toBe(100);
    expect(op.record!.status).toBe('unknown');
  });

  it('should include grade from submission', () => {
    const submission: IGoogleStudentSubmission = {
      id: 'sub-1',
      courseId: 'c-1',
      courseWorkId: 'cw-1',
      userId: 'u-1',
      state: 'RETURNED',
      assignedGrade: 88,
      late: false,
    };
    const op = transformCourseWorkToOp(courseWork, submission, BASE_KEY);

    expect(op.record!.status).toBe('graded');
    expect(op.record!.pointsEarned).toBe(88);
  });
});

describe('transformCourseToOp', () => {
  it('should produce a valid course op', () => {
    const course: IGoogleCourse = {
      id: 'c-42',
      name: 'AP Biology',
      section: 'Period 3',
      courseState: 'ACTIVE',
    };
    const op = transformCourseToOp(course, BASE_KEY);

    expect(op.op).toBe('upsert');
    expect(op.entity).toBe('course');
    expect(op.key.externalId).toBe('gc-course-c-42');
    expect(op.record!.title).toBe('AP Biology');
    expect(op.record!.courseCode).toBe('Period 3');
  });
});

describe('transformGradeSnapshotToOp', () => {
  it('should calculate percent grade correctly', () => {
    const op = transformGradeSnapshotToOp('c-1', 85, 100, BASE_KEY);

    expect(op.op).toBe('upsert');
    expect(op.entity).toBe('gradeSnapshot');
    expect(op.record!.percentGrade).toBe(85);
    expect(op.record!.courseExternalId).toBe('gc-course-c-1');
  });

  it('should handle zero possible points', () => {
    const op = transformGradeSnapshotToOp('c-1', 0, 0, BASE_KEY);
    expect(op.record!.percentGrade).toBe(0);
  });
});
