import { mergeCourses, type ISourceCourse } from '@scholaracle/connector';

/** Map a course external id to the merged id used by grades and tutorial overrides. */
export function resolveMergedCourseId(
  courseExternalId: string,
  sourceCourses: readonly ISourceCourse[]
): string {
  const groups = mergeCourses(sourceCourses);
  for (const group of groups) {
    if (group.sources.some((s) => s.externalId === courseExternalId)) {
      return group.mergedId;
    }
  }
  return courseExternalId;
}
