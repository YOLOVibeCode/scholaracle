import type {
  ISlcDeltaOp,
  ISlcEntityKey,
  ISlcAssignment,
  ISlcCourse,
  ISlcGradeSnapshot,
} from '@scholaracle/contracts';
import type { ISkywardClass, ISkywardLineItem, ISkywardResult } from './skyward-client';

type BaseKey = Omit<ISlcEntityKey, 'externalId'>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Map Skyward result status to Scholaracle assignment status. */
export function mapSkywardResultStatus(
  result: ISkywardResult | undefined,
  lineItem: ISkywardLineItem
): ISlcAssignment['status'] {
  if (!result) {
    if (lineItem.dueDate && new Date(lineItem.dueDate) < new Date()) return 'missing';
    return 'not_started';
  }
  if (result.scoreStatus === 'not submitted') {
    if (lineItem.dueDate && new Date(lineItem.dueDate) < new Date()) return 'missing';
    return 'not_started';
  }
  if (result.scoreStatus === 'fully graded') return 'graded';
  if (result.scoreStatus === 'partially graded') return 'submitted';
  if (result.scoreStatus === 'exempt') return 'graded';
  return 'unknown';
}

// ---------------------------------------------------------------------------
// Transformers
// ---------------------------------------------------------------------------

export function transformClassToOp(cls: ISkywardClass, baseKey: BaseKey): ISlcDeltaOp<ISlcCourse> {
  return {
    op: 'upsert',
    entity: 'course',
    key: {
      ...baseKey,
      externalId: `skyward-class-${cls.sourcedId}`,
    },
    observedAt: new Date().toISOString(),
    record: {
      title: cls.title,
      courseCode: cls.course?.sourcedId,
    },
  };
}

export function transformLineItemToOp(
  lineItem: ISkywardLineItem,
  result: ISkywardResult | undefined,
  baseKey: BaseKey
): ISlcDeltaOp<ISlcAssignment> {
  return {
    op: 'upsert',
    entity: 'assignment',
    key: {
      ...baseKey,
      externalId: `skyward-lineitem-${lineItem.sourcedId}`,
      courseExternalId: `skyward-class-${lineItem.class.sourcedId}`,
    },
    observedAt: new Date().toISOString(),
    record: {
      title: lineItem.title,
      dueAt: lineItem.dueDate ?? undefined,
      status: mapSkywardResultStatus(result, lineItem),
      pointsPossible: lineItem.resultValueMax,
      pointsEarned: result?.score ?? undefined,
    },
  };
}

export function transformGradeSnapshotToOp(
  classId: string,
  totalEarned: number,
  totalPossible: number,
  baseKey: BaseKey
): ISlcDeltaOp<ISlcGradeSnapshot> {
  const percent = totalPossible > 0 ? Math.round((totalEarned / totalPossible) * 10000) / 100 : 0;
  return {
    op: 'upsert',
    entity: 'gradeSnapshot',
    key: {
      ...baseKey,
      externalId: `skyward-grade-${classId}-${new Date().toISOString().split('T')[0]}`,
      courseExternalId: `skyward-class-${classId}`,
    },
    observedAt: new Date().toISOString(),
    record: {
      courseExternalId: `skyward-class-${classId}`,
      percentGrade: percent,
      asOfDate: new Date().toISOString().split('T')[0]!,
    },
  };
}
