import {
  googleDateToIso,
  mapGoogleSubmissionStatus,
  transformCourseWorkToOp,
  transformCourseToOp,
  transformGradeSnapshotToOp,
  transformMaterialToOps,
} from './google-classroom-transformer';
import type {
  IGoogleCourseWork,
  IGoogleStudentSubmission,
  IGoogleCourse,
  IGoogleMaterial,
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

describe('transformMaterialToOps', () => {
  it('should produce one courseMaterial op per Drive file (type document)', () => {
    const material: IGoogleMaterial = {
      courseId: 'c-1',
      id: 'mat-1',
      title: 'Syllabus',
      materials: [
        {
          driveFile: {
            id: 'drive-1',
            title: 'Syllabus.pdf',
            alternateLink: 'https://drive.google.com/file/d/1/view',
          },
        },
      ],
    };
    const ops = transformMaterialToOps(material, BASE_KEY);

    expect(ops).toHaveLength(1);
    expect(ops[0]!.entity).toBe('courseMaterial');
    expect(ops[0]!.key.externalId).toBe('gc-material-c-1-mat-1-0');
    expect(ops[0]!.key.courseExternalId).toBe('gc-course-c-1');
    expect(ops[0]!.record!.type).toBe('document');
    expect(ops[0]!.record!.url).toBe('https://drive.google.com/file/d/1/view');
    expect(ops[0]!.record!.title).toBe('Syllabus.pdf');
  });

  it('should produce one courseMaterial op per YouTube video (type video)', () => {
    const material: IGoogleMaterial = {
      courseId: 'c-2',
      id: 'mat-2',
      title: 'Intro Video',
      materials: [
        {
          youtubeVideo: {
            id: 'yt-1',
            title: 'Welcome',
            alternateLink: 'https://www.youtube.com/watch?v=abc',
          },
        },
      ],
    };
    const ops = transformMaterialToOps(material, BASE_KEY);

    expect(ops).toHaveLength(1);
    expect(ops[0]!.record!.type).toBe('video');
    expect(ops[0]!.record!.url).toBe('https://www.youtube.com/watch?v=abc');
    expect(ops[0]!.record!.title).toBe('Welcome');
  });

  it('should produce one courseMaterial op per link (type link)', () => {
    const material: IGoogleMaterial = {
      courseId: 'c-3',
      id: 'mat-3',
      title: 'Resources',
      materials: [{ link: { url: 'https://example.com/resource', title: 'Resource Page' } }],
    };
    const ops = transformMaterialToOps(material, BASE_KEY);

    expect(ops).toHaveLength(1);
    expect(ops[0]!.record!.type).toBe('link');
    expect(ops[0]!.record!.url).toBe('https://example.com/resource');
    expect(ops[0]!.record!.title).toBe('Resource Page');
  });

  it('should produce one op per attachment and use material title as fallback', () => {
    const material: IGoogleMaterial = {
      courseId: 'c-4',
      id: 'mat-4',
      title: 'Week 1 Materials',
      description: 'Read these',
      creationTime: '2025-09-01T00:00:00Z',
      materials: [
        { link: { url: 'https://a.com', title: 'Link A' } },
        { link: { url: 'https://b.com' } },
      ],
    };
    const ops = transformMaterialToOps(material, BASE_KEY);

    expect(ops).toHaveLength(2);
    expect(ops[0]!.key.externalId).toBe('gc-material-c-4-mat-4-0');
    expect(ops[0]!.record!.title).toBe('Link A');
    expect(ops[1]!.key.externalId).toBe('gc-material-c-4-mat-4-1');
    expect(ops[1]!.record!.title).toBe('Week 1 Materials');
    expect(ops[1]!.record!.description).toBe('Read these');
    expect(ops[1]!.record!.postedAt).toBe('2025-09-01T00:00:00Z');
  });

  it('should return empty array when materials is missing or empty', () => {
    expect(
      transformMaterialToOps({ courseId: 'c-1', id: 'm-1', title: 'Empty' }, BASE_KEY)
    ).toEqual([]);
    expect(
      transformMaterialToOps(
        { courseId: 'c-1', id: 'm-1', title: 'Empty', materials: [] },
        BASE_KEY
      )
    ).toEqual([]);
  });

  it('should handle form attachment as type link', () => {
    const material: IGoogleMaterial = {
      courseId: 'c-1',
      id: 'mat-form',
      title: 'Survey',
      materials: [{ form: { title: 'Feedback', formUrl: 'https://docs.google.com/forms/d/1' } }],
    };
    const ops = transformMaterialToOps(material, BASE_KEY);

    expect(ops).toHaveLength(1);
    expect(ops[0]!.record!.type).toBe('link');
    expect(ops[0]!.record!.url).toBe('https://docs.google.com/forms/d/1');
    expect(ops[0]!.record!.title).toBe('Feedback');
  });
});
