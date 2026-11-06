import type { SlcSyncGapKind } from '@scholaracle/contracts';

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
