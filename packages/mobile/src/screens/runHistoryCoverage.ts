/**
 * Build human-readable gap lines for run detail (pure; unit-tested).
 */

import type { ISlcRunCoverage, SlcSyncGapKind } from '@scholaracle/contracts';

export function describeGapKind(kind: SlcSyncGapKind): string {
  switch (kind) {
    case 'no_grade_no_assignments':
      return 'grade none, assignments 0';
    case 'no_grade':
      return 'grade none';
    case 'no_assignments':
      return 'assignments 0';
    case 'missing_course_title':
      return 'course title missing';
    default: {
      const _exhaustive: never = kind;
      return _exhaustive;
    }
  }
}

export function gapLinesFromCoverage(coverage: ISlcRunCoverage | undefined): string[] {
  if (!coverage) return [];
  const lines: string[] = [];
  for (const stu of coverage.students) {
    for (const g of stu.gaps) {
      lines.push(`${g.course}: ${describeGapKind(g.kind)}`);
    }
  }
  return lines;
}
