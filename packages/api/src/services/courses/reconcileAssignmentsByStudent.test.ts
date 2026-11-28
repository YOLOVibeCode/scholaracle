import type { ISourceCourse } from '@scholaracle/connector';
import {
  reconcileAssignmentsByStudent,
  type IStudentAssignment,
} from './reconcileAssignmentsByStudent';

function course(
  externalId: string,
  provider: string,
  title: string,
  studentExternalId?: string
): ISourceCourse {
  return { externalId, sourceId: `src-${provider}`, provider, title, studentExternalId };
}

function missingInLms(courseExternalId: string, studentExternalId?: string): IStudentAssignment {
  return {
    externalId: `lms-${courseExternalId}`,
    title: 'Glaze Test Tiles',
    courseExternalId,
    status: 'missing',
    provider: 'canvas',
    studentExternalId,
  };
}

function gradedInSis(courseExternalId: string, studentExternalId?: string): IStudentAssignment {
  return {
    externalId: `sis-${courseExternalId}`,
    title: 'Glaze Test Tiles',
    courseExternalId,
    status: 'graded',
    provider: 'skyward',
    studentExternalId,
  };
}

describe('reconcileAssignmentsByStudent', () => {
  it("does not clear one student's missing work with a sibling's grade in a same-named class", () => {
    const matches = reconcileAssignmentsByStudent({
      courses: [
        course('canvas-a', 'canvas', 'Pottery', 'stu-a'),
        course('sky-b', 'skyward', 'POTTERY', 'stu-b'),
      ],
      lms: [missingInLms('canvas-a', 'stu-a')],
      sis: [gradedInSis('sky-b', 'stu-b')],
    });

    expect(matches).toHaveLength(1);
    expect(matches[0]!.skywardExternalId).toBeNull();
  });

  it("matches one student's missing work to the gradebook across sources", () => {
    const matches = reconcileAssignmentsByStudent({
      courses: [
        course('canvas-a', 'canvas', 'Pottery', 'stu-a'),
        course('sky-a', 'skyward', 'POTTERY', 'stu-a'),
      ],
      lms: [missingInLms('canvas-a', 'stu-a')],
      sis: [gradedInSis('sky-a', 'stu-a')],
    });

    expect(matches).toHaveLength(1);
    expect(matches[0]!.skywardExternalId).toBe('sis-sky-a');
  });

  it('lets courses saved without a student join each student', () => {
    const matches = reconcileAssignmentsByStudent({
      courses: [
        course('canvas-a', 'canvas', 'Pottery', 'stu-a'),
        course('sky-x', 'skyward', 'POTTERY'),
      ],
      lms: [missingInLms('canvas-a', 'stu-a')],
      sis: [gradedInSis('sky-x', 'stu-a')],
    });

    expect(matches[0]!.skywardExternalId).toBe('sis-sky-x');
  });

  it('matches assignments saved without a student against every course, as before', () => {
    const matches = reconcileAssignmentsByStudent({
      courses: [
        course('canvas-a', 'canvas', 'Pottery', 'stu-a'),
        course('sky-a', 'skyward', 'POTTERY', 'stu-a'),
      ],
      lms: [missingInLms('canvas-a')],
      sis: [gradedInSis('sky-a')],
    });

    expect(matches[0]!.skywardExternalId).toBe('sis-sky-a');
  });

  it('returns no matches when nothing is missing', () => {
    const matches = reconcileAssignmentsByStudent({
      courses: [course('sky-a', 'skyward', 'POTTERY', 'stu-a')],
      lms: [],
      sis: [gradedInSis('sky-a', 'stu-a')],
    });

    expect(matches).toEqual([]);
  });
});
