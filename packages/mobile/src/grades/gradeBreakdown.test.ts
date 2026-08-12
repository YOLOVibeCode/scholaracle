/**
 * gradeBreakdown — category rollup + CourseDetail section building.
 */

import type { ICourseGrade, ICourseGradeAssignment } from '@scholaracle/contracts';
import {
  buildCategoryRollup,
  buildCourseDetailSections,
  rowKey,
  sectionKindFor,
} from './gradeBreakdown';

function makeAssignment(overrides: Partial<ICourseGradeAssignment> = {}): ICourseGradeAssignment {
  return {
    externalId: 'a-1',
    title: 'Worksheet 1',
    status: 'graded',
    isOverdue: false,
    ...overrides,
  };
}

function makeCourse(overrides: Partial<ICourseGrade> = {}): ICourseGrade {
  return {
    courseExternalId: 'course-1',
    courseName: 'AP Calculus',
    officialGrade: 92.3,
    letterGrade: 'A-',
    gradeSource: 'sis',
    totalAssignments: 0,
    gradedAssignments: 0,
    missingAssignments: 0,
    lateAssignments: 0,
    totalPointsPossible: 0,
    totalPointsEarned: 0,
    recentTrend: 'stable',
    riskLevel: 'low',
    materialCount: 0,
    assignments: [],
    ...overrides,
  };
}

describe('buildCategoryRollup', () => {
  it('should return [] for an empty assignment list', () => {
    expect(buildCategoryRollup([])).toEqual([]);
  });

  it('should return [] when NO assignment has a category (screen falls back to totals)', () => {
    const rollup = buildCategoryRollup([
      makeAssignment({ externalId: 'a-1', pointsEarned: 9, pointsPossible: 10 }),
      makeAssignment({ externalId: 'a-2', pointsEarned: 8, pointsPossible: 10 }),
    ]);
    expect(rollup).toEqual([]);
  });

  it('should only include graded assignments with a positive pointsPossible', () => {
    const rollup = buildCategoryRollup([
      makeAssignment({
        externalId: 'a-1',
        category: 'Homework',
        pointsEarned: 9,
        pointsPossible: 10,
      }),
      // Not graded — excluded even though it has points.
      makeAssignment({
        externalId: 'a-2',
        status: 'missing',
        category: 'Homework',
        pointsPossible: 10,
      }),
      makeAssignment({
        externalId: 'a-3',
        status: 'submitted',
        category: 'Homework',
        pointsPossible: 10,
      }),
      // Graded but pointsPossible 0/absent — excluded.
      makeAssignment({
        externalId: 'a-4',
        category: 'Homework',
        pointsEarned: 5,
        pointsPossible: 0,
      }),
      makeAssignment({ externalId: 'a-5', category: 'Homework', pointsEarned: 5 }),
    ]);

    expect(rollup).toHaveLength(1);
    expect(rollup[0]).toMatchObject({
      category: 'Homework',
      pointsEarned: 9,
      pointsPossible: 10,
      count: 1,
      percent: 90,
    });
  });

  it("should group uncategorized graded assignments under 'Other' when any category exists", () => {
    const rollup = buildCategoryRollup([
      makeAssignment({
        externalId: 'a-1',
        category: 'Tests',
        pointsEarned: 40,
        pointsPossible: 50,
      }),
      makeAssignment({ externalId: 'a-2', pointsEarned: 10, pointsPossible: 10 }),
    ]);

    expect(rollup.map((r) => r.category)).toEqual(expect.arrayContaining(['Tests', 'Other']));
    const other = rollup.find((r) => r.category === 'Other');
    expect(other).toMatchObject({ pointsEarned: 10, pointsPossible: 10, count: 1 });
  });

  it('should aggregate points, count, and percent per category', () => {
    const rollup = buildCategoryRollup([
      makeAssignment({
        externalId: 'a-1',
        category: 'Homework',
        pointsEarned: 9,
        pointsPossible: 10,
      }),
      makeAssignment({
        externalId: 'a-2',
        category: 'Homework',
        pointsEarned: 6,
        pointsPossible: 10,
      }),
      // Missing pointsEarned counts as 0 toward the sum.
      makeAssignment({ externalId: 'a-3', category: 'Homework', pointsPossible: 5 }),
    ]);

    expect(rollup).toHaveLength(1);
    expect(rollup[0]).toMatchObject({
      category: 'Homework',
      pointsEarned: 15,
      pointsPossible: 25,
      percent: 60,
      count: 3,
    });
  });

  it('should keep the weight when every group member agrees on categoryWeight', () => {
    const rollup = buildCategoryRollup([
      makeAssignment({
        externalId: 'a-1',
        category: 'Tests',
        categoryWeight: 40,
        pointsEarned: 40,
        pointsPossible: 50,
      }),
      makeAssignment({
        externalId: 'a-2',
        category: 'Tests',
        categoryWeight: 40,
        pointsEarned: 45,
        pointsPossible: 50,
      }),
    ]);

    expect(rollup[0]?.weight).toBe(40);
  });

  it('should drop the weight when group members disagree', () => {
    const rollup = buildCategoryRollup([
      makeAssignment({
        externalId: 'a-1',
        category: 'Tests',
        categoryWeight: 40,
        pointsEarned: 40,
        pointsPossible: 50,
      }),
      makeAssignment({
        externalId: 'a-2',
        category: 'Tests',
        categoryWeight: 30,
        pointsEarned: 45,
        pointsPossible: 50,
      }),
    ]);

    expect(rollup[0]?.weight).toBeUndefined();
  });

  it('should drop the weight when only some members carry one', () => {
    const rollup = buildCategoryRollup([
      makeAssignment({
        externalId: 'a-1',
        category: 'Tests',
        categoryWeight: 40,
        pointsEarned: 40,
        pointsPossible: 50,
      }),
      makeAssignment({
        externalId: 'a-2',
        category: 'Tests',
        pointsEarned: 45,
        pointsPossible: 50,
      }),
    ]);

    expect(rollup[0]?.weight).toBeUndefined();
  });

  it('should sort by weight descending, unweighted last, then category ascending', () => {
    const rollup = buildCategoryRollup([
      makeAssignment({
        externalId: 'a-1',
        category: 'Homework',
        categoryWeight: 20,
        pointsEarned: 9,
        pointsPossible: 10,
      }),
      makeAssignment({
        externalId: 'a-2',
        category: 'Tests',
        categoryWeight: 40,
        pointsEarned: 40,
        pointsPossible: 50,
      }),
      makeAssignment({ externalId: 'a-3', category: 'Zeta', pointsEarned: 1, pointsPossible: 2 }),
      makeAssignment({ externalId: 'a-4', category: 'Alpha', pointsEarned: 1, pointsPossible: 2 }),
      makeAssignment({
        externalId: 'a-5',
        category: 'Quizzes',
        categoryWeight: 20,
        pointsEarned: 8,
        pointsPossible: 10,
      }),
    ]);

    expect(rollup.map((r) => r.category)).toEqual([
      'Tests', // 40
      'Homework', // 20, ties broken alphabetically
      'Quizzes', // 20
      'Alpha', // unweighted, alphabetical
      'Zeta',
    ]);
  });

  it('should return [] when categories exist but nothing is graded with points', () => {
    const rollup = buildCategoryRollup([
      makeAssignment({ externalId: 'a-1', status: 'missing', category: 'Homework' }),
      makeAssignment({
        externalId: 'a-2',
        status: 'submitted',
        category: 'Tests',
        pointsPossible: 10,
      }),
    ]);
    expect(rollup).toEqual([]);
  });
});

describe('sectionKindFor', () => {
  it('should map statuses onto the three section kinds', () => {
    expect(sectionKindFor('missing')).toBe('missing');
    expect(sectionKindFor('graded')).toBe('graded');
    expect(sectionKindFor('submitted')).toBe('other');
    expect(sectionKindFor('late')).toBe('other');
    expect(sectionKindFor('unknown')).toBe('other');
  });
});

describe('buildCourseDetailSections', () => {
  it('should return [] for a course with no assignments (snapshot-only grade)', () => {
    expect(buildCourseDetailSections(makeCourse())).toEqual([]);
  });

  it('should order sections Missing -> graded -> other with the right titles and kinds', () => {
    const course = makeCourse({
      assignments: [
        makeAssignment({ externalId: 'g-1', status: 'graded' }),
        makeAssignment({ externalId: 'm-1', status: 'missing' }),
        makeAssignment({ externalId: 'o-1', status: 'submitted' }),
        makeAssignment({ externalId: 'o-2', status: 'late' }),
      ],
    });

    const sections = buildCourseDetailSections(course);

    expect(sections.map((s) => ({ key: s.key, title: s.title, kind: s.kind }))).toEqual([
      { key: 'missing', title: 'Missing', kind: 'missing' },
      { key: 'graded', title: 'What makes up this grade', kind: 'graded' },
      { key: 'other', title: 'Other assignments', kind: 'other' },
    ]);
    expect(sections[2]?.data.map((a) => a.externalId)).toEqual(
      expect.arrayContaining(['o-1', 'o-2'])
    );
  });

  it('should omit empty sections entirely', () => {
    const course = makeCourse({
      assignments: [
        makeAssignment({ externalId: 'g-1', status: 'graded' }),
        makeAssignment({ externalId: 'g-2', status: 'graded' }),
      ],
    });

    const sections = buildCourseDetailSections(course);

    expect(sections).toHaveLength(1);
    expect(sections[0]?.kind).toBe('graded');
  });

  it('should sort each section due-date-descending with undated assignments last', () => {
    const course = makeCourse({
      assignments: [
        makeAssignment({ externalId: 'g-old', status: 'graded', dueAt: '2026-01-05T12:00:00Z' }),
        makeAssignment({ externalId: 'g-none', status: 'graded' }),
        makeAssignment({ externalId: 'g-new', status: 'graded', dueAt: '2026-03-01T12:00:00Z' }),
        makeAssignment({ externalId: 'g-bad', status: 'graded', dueAt: 'garbage' }),
        makeAssignment({ externalId: 'g-mid', status: 'graded', dueAt: '2026-02-01T12:00:00Z' }),
      ],
    });

    const sections = buildCourseDetailSections(course);
    const ids = sections[0]?.data.map((a) => a.externalId) ?? [];

    expect(ids.slice(0, 3)).toEqual(['g-new', 'g-mid', 'g-old']);
    // Undated and unparseable dates sink to the bottom (relative order free).
    expect(ids.slice(3).sort()).toEqual(['g-bad', 'g-none']);
  });
});

describe('rowKey', () => {
  it('should build a stable composite key', () => {
    expect(rowKey('missing', 'a-1')).toBe('missing:a-1');
    expect(rowKey('graded', 'a-1')).toBe('graded:a-1');
  });

  it('should keep rows from different sections distinct for the same assignment id', () => {
    expect(rowKey('missing', 'a-1')).not.toBe(rowKey('other', 'a-1'));
  });
});
