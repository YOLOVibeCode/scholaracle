import {
  mapSkywardAssignmentStatus,
  transformSkywardAssignmentToOp,
  transformReportToGradeOps,
  transformGradebookToAssignmentOps,
  transformSkywardCourseToOp,
} from './skyward-transformer';
import type {
  ISkywardAssignment,
  ISkywardReport,
  ISkywardGradebook,
} from './skyward-client';

const BASE_KEY = {
  provider: 'skyward',
  adapterId: 'com.skyward',
  studentExternalId: 'self',
  institutionExternalId: 'skyward-instance',
};

describe('mapSkywardAssignmentStatus', () => {
  it('should return missing when meta includes missing', () => {
    expect(
      mapSkywardAssignmentStatus({
        title: 'HW',
        score: null,
        grade: null,
        points: { earned: null, total: 10 },
        date: '01/01/25',
        meta: [{ type: 'missing' }],
      })
    ).toBe('missing');
  });

  it('should return unknown when meta includes absent', () => {
    expect(
      mapSkywardAssignmentStatus({
        title: 'HW',
        score: null,
        grade: null,
        points: { earned: null, total: 10 },
        date: '01/01/25',
        meta: [{ type: 'absent', note: 'Excused' }],
      })
    ).toBe('unknown');
  });

  it('should return graded when grade is present', () => {
    expect(
      mapSkywardAssignmentStatus({
        title: 'Test',
        score: 95.5,
        grade: 96,
        points: { earned: 96, total: 100 },
        date: '01/01/25',
        meta: [],
      })
    ).toBe('graded');
  });

  it('should return unknown when no grade, no score, no meta', () => {
    expect(
      mapSkywardAssignmentStatus({
        title: 'Extra',
        score: null,
        grade: null,
        points: { earned: null, total: null },
        date: '01/01/25',
        meta: [],
      })
    ).toBe('unknown');
  });
});

describe('transformSkywardAssignmentToOp', () => {
  const assignment: ISkywardAssignment = {
    title: 'Chapter 5 Test',
    score: 88,
    grade: 88,
    points: { earned: 88, total: 100 },
    date: '09/15/25',
    meta: [],
  };

  it('should produce a valid assignment op', () => {
    const op = transformSkywardAssignmentToOp(assignment, 'Physics', 'Major', 97776, BASE_KEY);

    expect(op.op).toBe('upsert');
    expect(op.entity).toBe('assignment');
    expect(op.key.externalId).toContain('skyward-97776');
    expect(op.key.courseExternalId).toBe('skyward-course-97776');
    expect(op.record!.title).toBe('Chapter 5 Test');
    expect(op.record!.pointsPossible).toBe(100);
    expect(op.record!.pointsEarned).toBe(88);
    expect(op.record!.status).toBe('graded');
  });

  it('should handle null points', () => {
    const noPts: ISkywardAssignment = {
      ...assignment,
      points: { earned: null, total: null },
      grade: null,
      score: null,
      meta: [],
    };
    const op = transformSkywardAssignmentToOp(noPts, 'Math', 'Minor', 12345, BASE_KEY);
    expect(op.record!.pointsPossible).toBeUndefined();
    expect(op.record!.pointsEarned).toBeUndefined();
  });
});

describe('transformReportToGradeOps', () => {
  it('should create grade snapshots for each non-null score', () => {
    const report: ISkywardReport = {
      course: 97776,
      scores: [
        { bucket: 'TERM 1', score: 95 },
        { bucket: 'TERM 2', score: null },
        { bucket: 'SEM 1', score: 93 },
      ],
    };

    const ops = transformReportToGradeOps(report, BASE_KEY);

    expect(ops).toHaveLength(2);
    expect(ops[0]!.entity).toBe('gradeSnapshot');
    expect(ops[0]!.record!.percentGrade).toBe(95);
    expect(ops[0]!.key.termExternalId).toBe('skyward-term-TERM 1');
    expect(ops[1]!.record!.percentGrade).toBe(93);
  });

  it('should return empty array for all null scores', () => {
    const report: ISkywardReport = {
      course: 12345,
      scores: [{ bucket: 'Q1', score: null }],
    };
    expect(transformReportToGradeOps(report, BASE_KEY)).toHaveLength(0);
  });
});

describe('transformGradebookToAssignmentOps', () => {
  it('should flatten all categories into assignment ops', () => {
    const gradebook: ISkywardGradebook = {
      course: 'PHYSICS',
      instructor: 'Dr. Smith',
      period: 1,
      score: 95,
      grade: 95,
      gradebook: [
        {
          category: 'Major',
          assignments: [
            {
              title: 'Test 1',
              score: 90,
              grade: 90,
              points: { earned: 90, total: 100 },
              date: '09/01/25',
              meta: [],
            },
          ],
        },
        {
          category: 'Minor',
          assignments: [
            {
              title: 'Quiz 1',
              score: 100,
              grade: 100,
              points: { earned: 10, total: 10 },
              date: '09/05/25',
              meta: [],
            },
          ],
        },
      ],
    };

    const ops = transformGradebookToAssignmentOps(gradebook, 97776, BASE_KEY);
    expect(ops).toHaveLength(2);
    expect(ops[0]!.record!.title).toBe('Test 1');
    expect(ops[1]!.record!.title).toBe('Quiz 1');
  });
});

describe('transformSkywardCourseToOp', () => {
  it('should produce a valid course op', () => {
    const gradebook: ISkywardGradebook = {
      course: 'AP CHEMISTRY',
      instructor: 'Ms. Jones',
      period: 4,
      score: 97,
      grade: 97,
      gradebook: [],
    };
    const op = transformSkywardCourseToOp(gradebook, 54321, BASE_KEY);

    expect(op.op).toBe('upsert');
    expect(op.entity).toBe('course');
    expect(op.key.externalId).toBe('skyward-course-54321');
    expect(op.record!.title).toBe('AP Chemistry');
    expect(op.record!.teacherName).toBe('Ms. Jones');
    expect(op.record!.subjectArea).toBe('science');
  });
});
