/**
 * Coverage gap kinds → recipe steps for repair candidates.
 */

import type { IAeriesFullExtract } from '../extractors/aeries/aeries-extractors';
import { transformAeriesExtract } from '../transformers/aeries/aeries-transformer';
import type { ITransformContext } from '../types';
import { computeRunCoverage } from '../pipeline/computeRunCoverage';
import { mapGapKindToRecipeStep } from './gapKindToRecipeStep';

const ctx: ITransformContext = {
  provider: 'aeries',
  adapterId: 'com.aeries.portal',
  studentExternalId: 'stu-emma',
  institutionExternalId: 'inst-test',
};

describe('mapGapKindToRecipeStep — Aeries', () => {
  it('maps Entrepreneurship no_grade_no_assignments to aeries.gradebook.assignments', () => {
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
    const gap = stu!.gaps.find((g) => g.course === 'Entrepreneurship');
    expect(gap?.kind).toBe('no_grade_no_assignments');
    expect(mapGapKindToRecipeStep('aeries', gap!.kind)).toBe('aeries.gradebook.assignments');
    expect(mapGapKindToRecipeStep('com.aeries.portal', gap!.kind)).toBe(
      'aeries.gradebook.assignments'
    );
  });
});
