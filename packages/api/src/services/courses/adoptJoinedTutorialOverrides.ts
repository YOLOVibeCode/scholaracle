import type { IMergedCourse } from '@scholaracle/connector';
import type { ICourseTutorialOverrideWriter } from '@scholaracle/database';

export interface ITutorialOverride {
  readonly mergedCourseId: string;
  readonly tutorialWindow: string;
}

/**
 * Move a tutorial window saved on a class before its sources were joined onto the joined class,
 * so it still shows and a reset clears it. Returns the overrides keyed by merged course ID.
 */
export async function adoptJoinedTutorialOverrides(params: {
  readonly groups: readonly Pick<IMergedCourse, 'mergedId' | 'aliasMergedIds'>[];
  readonly overrides: readonly ITutorialOverride[];
  readonly repo: ICourseTutorialOverrideWriter;
  readonly userId: string;
  readonly studentId: string;
}): Promise<Map<string, ITutorialOverride>> {
  const owner = { userId: params.userId, studentId: params.studentId };
  const byMerged = new Map<string, ITutorialOverride>(
    params.overrides.map((o) => [o.mergedCourseId, o])
  );

  for (const group of params.groups) {
    if (byMerged.has(group.mergedId)) continue;
    const saved = (group.aliasMergedIds ?? [])
      .map((id) => byMerged.get(id))
      .find((o): o is ITutorialOverride => o != null);
    if (!saved) continue;
    const moved = await params.repo.upsertManual({
      ...owner,
      mergedCourseId: group.mergedId,
      tutorialWindow: saved.tutorialWindow,
    });
    await params.repo.deleteByStudentAndMergedCourse({
      ...owner,
      mergedCourseId: saved.mergedCourseId,
    });
    byMerged.set(group.mergedId, moved);
    byMerged.delete(saved.mergedCourseId);
  }

  return byMerged;
}
