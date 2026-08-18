/**
 * Skyward transformer tests — TDD for _cni-based course IDs, teacher ops from
 * schedule, attendance courseExternalId, and single-arg extractor contract.
 */

import { transformSkywardExtract, type ISkywardFullExtract } from '../../index';
import type { ITransformContext } from '../../types';

const ctx: ITransformContext = {
  provider: 'skyward',
  adapterId: 'com.skyward.grade',
  studentExternalId: 'stu-emma',
  institutionExternalId: 'inst-test',
};

function makeExtract(overrides: Partial<ISkywardFullExtract> = {}): ISkywardFullExtract {
  return {
    student: 'Emma Lewis',
    school: 'Central HS',
    courses: [],
    missingAssignments: [],
    assignments: [],
    attendance: [],
    schedule: [],
    timestamp: '2026-01-15T10:00:00.000Z',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// native-ids: course externalId uses _cni when present
// ---------------------------------------------------------------------------

describe('native IDs — Skyward', () => {
  it('course externalId uses _cni when present', () => {
    const extract = makeExtract({
      courses: [
        {
          name: 'ALGEBRA 1',
          period: '1',
          _cni: 'ABC123',
          teacher: 'Smith',
          currentGrade: '90%',
          grades: {},
          time: '',
        },
      ],
    });
    const ops = transformSkywardExtract(extract, ctx);
    const courseOp = ops.find((o) => o.entity === 'course');
    expect(courseOp?.key.externalId).toBe('skyward-course-ABC123');
  });

  it('course externalId falls back to period-slug when _cni absent', () => {
    const extract = makeExtract({
      courses: [
        {
          name: 'ALGEBRA 1',
          period: '1',
          _cni: undefined,
          teacher: 'Smith',
          currentGrade: '90%',
          grades: {},
          time: '',
        },
      ],
    });
    const ops = transformSkywardExtract(extract, ctx);
    const courseOp = ops.find((o) => o.entity === 'course');
    expect(courseOp?.key.externalId).toBe('skyward-course-1-algebra-1');
  });

  it('gradeSnapshot externalId matches the course externalId pattern', () => {
    const extract = makeExtract({
      courses: [
        {
          name: 'ALGEBRA 1',
          period: '1',
          _cni: 'XYZ',
          teacher: '',
          currentGrade: '85',
          grades: {},
          time: '',
        },
      ],
    });
    const ops = transformSkywardExtract(extract, ctx);
    const gradeOp = ops.find((o) => o.entity === 'gradeSnapshot');
    expect(gradeOp?.key.courseExternalId).toBe('skyward-course-XYZ');
    expect(gradeOp?.record?.['courseExternalId']).toBe('skyward-course-XYZ');
  });

  it('missing assignment courseExtId respects _cni of matched course', () => {
    const extract = makeExtract({
      courses: [
        {
          name: 'ALGEBRA 1',
          period: '1',
          _cni: 'A1CNI',
          teacher: '',
          currentGrade: '',
          grades: {},
          time: '',
        },
      ],
      missingAssignments: [
        {
          title: 'HW 3',
          course: 'ALGEBRA 1',
          period: '1',
          dueDate: '01/20/2026',
          teacher: 'Smith',
        },
      ],
    });
    const ops = transformSkywardExtract(extract, ctx);
    const assignOp = ops.find((o) => o.entity === 'assignment');
    expect(assignOp?.key.courseExternalId).toBe('skyward-course-A1CNI');
    expect(assignOp?.record?.['courseExternalId']).toBe('skyward-course-A1CNI');
  });
});

// ---------------------------------------------------------------------------
// four-pictures: teacher ops from schedule
// ---------------------------------------------------------------------------

describe('teacher ops — Skyward', () => {
  it('emits teacher op for each distinct teacher in schedule', () => {
    const extract = makeExtract({
      schedule: [
        {
          period: '1',
          course: 'ALGEBRA 1',
          teacher: 'Smith, John',
          room: '101',
          time: '8:00 AM - 8:50 AM',
        },
        {
          period: '2',
          course: 'ENGLISH 2',
          teacher: 'Jones, Mary',
          room: '205',
          time: '9:00 AM - 9:50 AM',
        },
      ],
    });
    const ops = transformSkywardExtract(extract, ctx);
    const teacherOps = ops.filter((o) => o.entity === 'teacher');
    expect(teacherOps).toHaveLength(2);
    const names = teacherOps.map((o) => o.record?.['name']).sort();
    expect(names).toEqual(['Jones, Mary', 'Smith, John']);
  });

  it('deduplicates the same teacher across periods', () => {
    const extract = makeExtract({
      schedule: [
        { period: '1', course: 'ALGEBRA 1', teacher: 'Smith, John', room: '101', time: '' },
        { period: '2', course: 'ALGEBRA 2', teacher: 'Smith, John', room: '101', time: '' },
      ],
    });
    const ops = transformSkywardExtract(extract, ctx);
    const teacherOps = ops.filter((o) => o.entity === 'teacher');
    expect(teacherOps).toHaveLength(1);
  });

  it('teacher record includes list of courseExternalIds for their courses', () => {
    const extract = makeExtract({
      courses: [
        {
          name: 'ALGEBRA 1',
          period: '1',
          _cni: 'A1',
          teacher: '',
          currentGrade: '',
          grades: {},
          time: '',
        },
      ],
      schedule: [
        { period: '1', course: 'ALGEBRA 1', teacher: 'Smith, John', room: '101', time: '' },
      ],
    });
    const ops = transformSkywardExtract(extract, ctx);
    const teacherOp = ops.find((o) => o.entity === 'teacher');
    expect(teacherOp?.record?.['courseExternalIds']).toContain('skyward-course-A1');
  });
});

// ---------------------------------------------------------------------------
// four-pictures: attendance courseExternalId via _cni
// ---------------------------------------------------------------------------

describe('attendance courseExternalId — Skyward', () => {
  it('attendance op includes courseExternalId when period matches a course with _cni', () => {
    const extract = makeExtract({
      courses: [
        {
          name: 'ALGEBRA 1',
          period: '1',
          _cni: 'A1CNI',
          teacher: '',
          currentGrade: '',
          grades: {},
          time: '',
        },
      ],
      attendance: [
        { date: '01/10/2026', period: '1', status: 'Present', reason: '', course: 'ALGEBRA 1' },
      ],
    });
    const ops = transformSkywardExtract(extract, ctx);
    const attOp = ops.find((o) => o.entity === 'attendanceEvent');
    expect(attOp?.record?.['courseExternalId']).toBe('skyward-course-A1CNI');
  });

  it('attendance externalId uses date+period (not array index)', () => {
    const extract = makeExtract({
      attendance: [{ date: '01/10/2026', period: '1', status: 'Present', reason: '', course: '' }],
    });
    const ops = transformSkywardExtract(extract, ctx);
    const attOp = ops.find((o) => o.entity === 'attendanceEvent');
    expect(attOp?.key.externalId).toBe('skyward-attendance-2026-01-10-1');
    // no raw array index in id — the positive assertion above is sufficient
  });
});
