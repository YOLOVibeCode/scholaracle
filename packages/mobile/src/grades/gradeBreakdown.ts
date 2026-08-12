/**
 * Pure grade-breakdown math for CourseDetailScreen.
 *
 * Everything here is UI-free so it runs under the node-env jest harness
 * (screens are never jest-loaded).
 */

import type {
  CourseAssignmentStatus,
  ICourseGrade,
  ICourseGradeAssignment,
} from '@scholaracle/contracts';

export interface ICategoryRollup {
  readonly category: string;
  /**
   * The categoryWeight every graded assignment in the group agrees on;
   * undefined when the group is inconsistent (or no weight was synced).
   */
  readonly weight?: number;
  readonly pointsEarned: number;
  readonly pointsPossible: number;
  readonly percent: number | null;
  readonly count: number;
}

interface IMutableRollup {
  category: string;
  weight: number | undefined;
  isWeightConsistent: boolean;
  pointsEarned: number;
  pointsPossible: number;
  count: number;
}

/**
 * Roll graded assignments up per category ('Other' for uncategorized ones).
 * Only graded assignments with a positive numeric pointsPossible participate.
 * Returns [] when NO assignment carries a category at all — the screen then
 * falls back to plain course totals.
 */
export function buildCategoryRollup(
  assignments: readonly ICourseGradeAssignment[]
): ICategoryRollup[] {
  if (!assignments.some((a) => a.category != null)) return [];

  const groups = new Map<string, IMutableRollup>();
  for (const assignment of assignments) {
    if (assignment.status !== 'graded') continue;
    const possible = assignment.pointsPossible;
    if (typeof possible !== 'number' || !(possible > 0)) continue;

    const category = assignment.category ?? 'Other';
    const group = groups.get(category);
    if (!group) {
      groups.set(category, {
        category,
        weight: assignment.categoryWeight,
        isWeightConsistent: true,
        pointsEarned: assignment.pointsEarned ?? 0,
        pointsPossible: possible,
        count: 1,
      });
    } else {
      if (group.weight !== assignment.categoryWeight) group.isWeightConsistent = false;
      group.pointsEarned += assignment.pointsEarned ?? 0;
      group.pointsPossible += possible;
      group.count += 1;
    }
  }

  const rollup: ICategoryRollup[] = [...groups.values()].map((group) => ({
    category: group.category,
    weight: group.isWeightConsistent ? group.weight : undefined,
    pointsEarned: group.pointsEarned,
    pointsPossible: group.pointsPossible,
    percent: group.pointsPossible > 0 ? (group.pointsEarned / group.pointsPossible) * 100 : null,
    count: group.count,
  }));

  return rollup.sort((a, b) => {
    const weightA = a.weight ?? Number.NEGATIVE_INFINITY;
    const weightB = b.weight ?? Number.NEGATIVE_INFINITY;
    if (weightA !== weightB) return weightB - weightA;
    return a.category.localeCompare(b.category);
  });
}

export type CourseSectionKind = 'missing' | 'graded' | 'other';

export interface ICourseDetailSection {
  readonly key: string;
  readonly title: string;
  readonly kind: CourseSectionKind;
  readonly data: ICourseGradeAssignment[];
}

/** Which CourseDetail section an assignment belongs to, from its status. */
export function sectionKindFor(status: CourseAssignmentStatus): CourseSectionKind {
  if (status === 'missing') return 'missing';
  if (status === 'graded') return 'graded';
  return 'other';
}

const SECTION_TITLES: Record<CourseSectionKind, string> = {
  missing: 'Missing',
  graded: 'What makes up this grade',
  other: 'Other assignments',
};

/**
 * SectionList sections for a course: Missing, then graded ('What makes up
 * this grade'), then everything else — each sorted due-date-descending
 * (assignments without a parseable dueAt sink to the bottom). Empty sections
 * are omitted entirely.
 */
export function buildCourseDetailSections(course: ICourseGrade): ICourseDetailSection[] {
  const byKind: Record<CourseSectionKind, ICourseGradeAssignment[]> = {
    missing: [],
    graded: [],
    other: [],
  };
  for (const assignment of course.assignments) {
    byKind[sectionKindFor(assignment.status)].push(assignment);
  }

  const order: readonly CourseSectionKind[] = ['missing', 'graded', 'other'];
  return order
    .filter((kind) => byKind[kind].length > 0)
    .map((kind) => ({
      key: kind,
      title: SECTION_TITLES[kind],
      kind,
      data: sortByDueDesc(byKind[kind]),
    }));
}

/** Stable composite key for a SectionList row. */
export function rowKey(sectionKey: string, externalId: string): string {
  return `${sectionKey}:${externalId}`;
}

function dueTime(assignment: ICourseGradeAssignment): number {
  if (assignment.dueAt == null || assignment.dueAt === '') return Number.NEGATIVE_INFINITY;
  const time = new Date(assignment.dueAt).getTime();
  return Number.isNaN(time) ? Number.NEGATIVE_INFINITY : time;
}

function sortByDueDesc(assignments: readonly ICourseGradeAssignment[]): ICourseGradeAssignment[] {
  return [...assignments].sort((a, b) => dueTime(b) - dueTime(a));
}
