import type { ISlcRunCoverage } from '@scholaracle/contracts';
import { describeGapKind, gapLinesFromCoverage } from './runHistoryCoverage';

describe('runHistoryCoverage', () => {
  it('describes no_grade_no_assignments like the product brief', () => {
    expect(describeGapKind('no_grade_no_assignments')).toBe('grade none, assignments 0');
  });

  it('lists Entrepreneurship gap line', () => {
    const coverage: ISlcRunCoverage = {
      students: [
        {
          studentExternalId: 'stu-1',
          courses: 1,
          coursesWithGrade: 0,
          coursesWithAssignments: 0,
          attendanceRows: 0,
          teacherEmails: 0,
          gaps: [{ course: 'Entrepreneurship', kind: 'no_grade_no_assignments' }],
        },
      ],
    };
    expect(gapLinesFromCoverage(coverage)).toEqual(['Entrepreneurship: grade none, assignments 0']);
  });
});
