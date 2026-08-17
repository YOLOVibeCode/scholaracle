/**
 * Aeries transformer tests — TDD for stable course/assignment IDs, teacher ops,
 * academicTerm, and attendance courseExternalId.
 */

import { transformAeriesExtract, type IAeriesFullExtract } from '../../index';
import type { ITransformContext } from '../../types';

const ctx: ITransformContext = {
  provider: 'aeries',
  adapterId: 'com.aeries.portal',
  studentExternalId: 'stu-emma',
  institutionExternalId: 'inst-test',
};

function makeExtract(overrides: Partial<IAeriesFullExtract> = {}): IAeriesFullExtract {
  return {
    students: [],
    timestamp: '2026-01-15T10:00:00.000Z',
    ...overrides,
  };
}

function makeStudent(overrides: Partial<IAeriesFullExtract['students'][number]> = {}) {
  return {
    name: 'Emma Lewis',
    studentId: 'S12345',
    grade: '10',
    school: 'Central HS',
    courses: [],
    attendance: [],
    ...overrides,
  };
}

function makeCourse(
  overrides: Partial<IAeriesFullExtract['students'][number]['courses'][number]> = {}
) {
  return {
    period: '3',
    name: 'English 2',
    term: 'Q3',
    teacher: 'Jones, Mary',
    teacherEmail: 'mjones@school.edu',
    room: '205',
    currentGrade: null,
    currentPercent: null,
    missingCount: 0,
    assignments: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// native-ids: stable course externalId
// ---------------------------------------------------------------------------

describe('native IDs — Aeries', () => {
  it('course externalId uses studentId+period+slug, NOT array index', () => {
    const extract = makeExtract({ students: [makeStudent({ courses: [makeCourse()] })] });
    const ops = transformAeriesExtract(extract, ctx);
    const courseOp = ops.find((o) => o.entity === 'course');
    expect(courseOp?.key.externalId).toBe('aeries-course-S12345-3-english-2');
    // must NOT contain an array index segment (no bare number between two dashes)
    expect(courseOp?.key.externalId).not.toMatch(/aeries-course-S12345-\d+-\d/);
  });

  it('course externalId is stable across re-runs (same period+name → same id)', () => {
    const makeOps = () =>
      transformAeriesExtract(
        makeExtract({ students: [makeStudent({ courses: [makeCourse()] })] }),
        ctx
      );
    expect(makeOps()[0]?.key.externalId).toBe(makeOps()[0]?.key.externalId);
  });

  it('assignment externalId uses studentId+period+number when number present', () => {
    const extract = makeExtract({
      students: [
        makeStudent({
          courses: [
            makeCourse({
              assignments: [
                {
                  number: '42',
                  title: 'HW 5',
                  category: 'HW',
                  scoreEarned: null,
                  scorePossible: 10,
                  percentCorrect: null,
                  dateAssigned: '01/05/2026',
                  dateDue: '01/10/2026',
                  dateCompleted: '',
                  gradingComplete: false,
                  isMissing: false,
                  comment: '',
                },
              ],
            }),
          ],
        }),
      ],
    });
    const ops = transformAeriesExtract(extract, ctx);
    const assignOp = ops.find((o) => o.entity === 'assignment');
    expect(assignOp?.key.externalId).toBe('aeries-assign-S12345-3-42');
  });

  it('assignment externalId falls back to date+title-slug when number absent', () => {
    const extract = makeExtract({
      students: [
        makeStudent({
          courses: [
            makeCourse({
              assignments: [
                {
                  number: '',
                  title: 'Untitled',
                  category: '',
                  scoreEarned: null,
                  scorePossible: null,
                  percentCorrect: null,
                  dateAssigned: '01/05/2026',
                  dateDue: '01/10/2026',
                  dateCompleted: '',
                  gradingComplete: false,
                  isMissing: false,
                  comment: '',
                },
              ],
            }),
          ],
        }),
      ],
    });
    const ops = transformAeriesExtract(extract, ctx);
    const assignOp = ops.find((o) => o.entity === 'assignment');
    // fallback must still include studentId and period
    expect(assignOp?.key.externalId).toMatch(/^aeries-assign-S12345-3-/);
  });

  it('gradeSnapshot courseExternalId reflects new stable course id', () => {
    const extract = makeExtract({
      students: [makeStudent({ courses: [makeCourse({ currentPercent: 92 })] })],
    });
    const ops = transformAeriesExtract(extract, ctx);
    const gradeOp = ops.find((o) => o.entity === 'gradeSnapshot');
    expect(gradeOp?.key.courseExternalId).toBe('aeries-course-S12345-3-english-2');
    expect(gradeOp?.record?.['courseExternalId']).toBe('aeries-course-S12345-3-english-2');
  });
});

// ---------------------------------------------------------------------------
// four-pictures: academicTerm from course.term
// ---------------------------------------------------------------------------

describe('academicTerm — Aeries', () => {
  it('emits an academicTerm op for each distinct term value', () => {
    const extract = makeExtract({
      students: [
        makeStudent({
          courses: [
            makeCourse({ period: '1', term: 'Quarter 3' }),
            makeCourse({ period: '2', name: 'Math', term: 'Quarter 3' }),
            makeCourse({ period: '3', name: 'History', term: 'Semester 2' }),
          ],
        }),
      ],
    });
    const ops = transformAeriesExtract(extract, ctx);
    const termOps = ops.filter((o) => o.entity === 'academicTerm');
    const externalIds = termOps.map((o) => o.key.externalId);
    expect(externalIds).toContain('aeries-term-quarter-3');
    expect(externalIds).toContain('aeries-term-semester-2');
    // Deduplicated — no duplicates
    expect(new Set(externalIds).size).toBe(externalIds.length);
  });

  it('does not emit academicTerm when term is blank', () => {
    const extract = makeExtract({
      students: [makeStudent({ courses: [makeCourse({ term: '' })] })],
    });
    const ops = transformAeriesExtract(extract, ctx);
    const termOps = ops.filter((o) => o.entity === 'academicTerm');
    expect(termOps).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// four-pictures: teacher ops from courses
// ---------------------------------------------------------------------------

describe('teacher ops — Aeries', () => {
  it('emits a teacher op for each course that has a teacher', () => {
    const extract = makeExtract({
      students: [
        makeStudent({
          courses: [
            makeCourse({ teacher: 'Jones, Mary', teacherEmail: 'mjones@school.edu' }),
            makeCourse({
              period: '4',
              name: 'Math',
              teacher: 'Kim, Alex',
              teacherEmail: 'akim@school.edu',
            }),
          ],
        }),
      ],
    });
    const ops = transformAeriesExtract(extract, ctx);
    const teacherOps = ops.filter((o) => o.entity === 'teacher');
    expect(teacherOps.length).toBeGreaterThanOrEqual(2);
    expect(teacherOps.some((o) => o.record?.['name'] === 'Jones, Mary')).toBe(true);
    expect(teacherOps.some((o) => o.record?.['name'] === 'Kim, Alex')).toBe(true);
  });

  it('deduplicates the same teacher by name+email across courses', () => {
    const extract = makeExtract({
      students: [
        makeStudent({
          courses: [
            makeCourse({ period: '1', teacher: 'Smith, Bob', teacherEmail: 'bsmith@school.edu' }),
            makeCourse({
              period: '2',
              name: 'Honors Math',
              teacher: 'Smith, Bob',
              teacherEmail: 'bsmith@school.edu',
            }),
          ],
        }),
      ],
    });
    const ops = transformAeriesExtract(extract, ctx);
    const teacherOps = ops.filter((o) => o.entity === 'teacher');
    expect(teacherOps.filter((o) => o.record?.['name'] === 'Smith, Bob')).toHaveLength(1);
  });

  it('teacher record includes email and courseExternalIds', () => {
    const extract = makeExtract({
      students: [makeStudent({ courses: [makeCourse()] })],
    });
    const ops = transformAeriesExtract(extract, ctx);
    const teacherOp = ops.find((o) => o.entity === 'teacher');
    expect(teacherOp?.record?.['email']).toBe('mjones@school.edu');
    expect(teacherOp?.record?.['courseExternalIds']).toContain('aeries-course-S12345-3-english-2');
  });
});

// ---------------------------------------------------------------------------
// four-pictures: attendance courseExternalId FK
// ---------------------------------------------------------------------------

describe('attendance courseExternalId — Aeries', () => {
  it('emits courseExternalId on attendanceEvent when period matches a course', () => {
    const extract = makeExtract({
      students: [
        makeStudent({
          courses: [makeCourse()], // period '3'
          attendance: [
            { date: '01/10/2026', period: '3', status: 'Present', reason: '', course: 'English 2' },
          ],
        }),
      ],
    });
    const ops = transformAeriesExtract(extract, ctx);
    const attOp = ops.find((o) => o.entity === 'attendanceEvent');
    expect(attOp?.record?.['courseExternalId']).toBe('aeries-course-S12345-3-english-2');
  });

  it('attendance externalId uses date+period, not array index', () => {
    const extract = makeExtract({
      students: [
        makeStudent({
          attendance: [
            { date: '01/10/2026', period: '3', status: 'Present', reason: '', course: '' },
          ],
        }),
      ],
    });
    const ops = transformAeriesExtract(extract, ctx);
    const attOp = ops.find((o) => o.entity === 'attendanceEvent');
    expect(attOp?.key.externalId).toBe('aeries-attendance-S12345-2026-01-10-3');
    // positive assertion above is sufficient — period suffix is expected
  });
});
