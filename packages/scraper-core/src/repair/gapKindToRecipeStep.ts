import type { ISlcRunCoverage, SlcSyncGapKind } from '@scholaracle/contracts';
import { resolveCanonicalAdapterId } from '../registry/adapter-aliases';

const AERIES_GAP_KIND_TO_STEP: Partial<Record<SlcSyncGapKind, string>> = {
  no_grade_no_assignments: 'aeries.gradebook.assignments',
  no_assignments: 'aeries.gradebook.assignments',
  no_grade: 'aeries.gradebook.assignments',
  missing_course_title: 'aeries.dashboard.classes',
};

const GAP_KIND_TO_STEP_BY_RECIPE: Readonly<
  Record<string, Partial<Record<SlcSyncGapKind, string>>>
> = {
  aeries: AERIES_GAP_KIND_TO_STEP,
  canvas: {},
  skyward: {},
};

export function mapGapKindToRecipeStep(
  recipeId: string,
  gapKind: SlcSyncGapKind
): string | undefined {
  const canonical = resolveCanonicalAdapterId(recipeId);
  const map = GAP_KIND_TO_STEP_BY_RECIPE[canonical];
  if (!map) return undefined;
  return map[gapKind];
}

export function uniqueGapKindsFromCoverage(coverage: ISlcRunCoverage): SlcSyncGapKind[] {
  const kinds = new Set<SlcSyncGapKind>();
  for (const stu of coverage.students) {
    for (const gap of stu.gaps) {
      kinds.add(gap.kind);
    }
  }
  return [...kinds].sort();
}
