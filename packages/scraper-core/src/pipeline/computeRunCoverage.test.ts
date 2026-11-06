/**
 * Per-student coverage from envelope ops — Aeries gap case (Entrepreneurship).
 */

import type { IAeriesFullExtract } from '../extractors/aeries/aeries-extractors';
import { transformAeriesExtract } from '../transformers/aeries/aeries-transformer';
import type { ITransformContext } from '../types';
import { computeRunCoverage } from './computeRunCoverage';

const ctx: ITransformContext = {
  provider: 'aeries',
  adapterId: 'com.aeries.portal',
  studentExternalId: 'stu-emma',
  institutionExternalId: 'inst-test',
};

describe('computeRunCoverage — Aeries', () => {
  it('reports Entrepreneurship: no grade and no assignments as one gap', () => {
    const assignmentRow = {
      number: '1',
      title: 'Essay',
      category: 'Writing',
      scoreEarned: null,
      scorePossible: 100,
      percentCorrect: null,
      dateAssigned: '01/10/2026',
      dateDue: '01/20/2026',
      dateCompleted: '',
      gradingComplete: false,
      isMissing: false,
      comment: '',
    };

    const extract: IAeriesFullExtract = {
      timestamp: '2026-01-15T10:00:00.000Z',
      students: [
        {
          name: 'Emma Lewis',
          studentId: 'S12345',
          grade: '10',
          school: 'Central HS',
          courses: [
            {
              period: '3',
              name: 'English 2',
              term: 'Q3',
              teacher: 'Jones, Mary',
              teacherEmail: 'mjones@school.edu',
              room: '205',
              currentGrade: null,
              currentPercent: 88,
              missingCount: 0,
              assignments: [assignmentRow],
            },
            {
              period: '4',
              name: 'Entrepreneurship',
              term: 'Q3',
              teacher: 'Lee, Sam',
              teacherEmail: 'slee@school.edu',
              room: '110',
              currentGrade: null,
              currentPercent: null,
              missingCount: 0,
              assignments: [],
            },
          ],
          attendance: [],
        },
      ],
    };

    const ops = transformAeriesExtract(extract, ctx);
    const coverage = computeRunCoverage(ops);
    const stu = coverage.students.find((s) => s.studentExternalId === 'stu-emma');
    expect(stu).toBeDefined();
    const gap = stu!.gaps.find((g) => g.course === 'Entrepreneurship');
    expect(gap).toEqual({
      course: 'Entrepreneurship',
      kind: 'no_grade_no_assignments',
    });
  });
});
