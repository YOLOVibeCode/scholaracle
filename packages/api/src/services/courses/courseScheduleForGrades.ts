import { formatClassMeetingSummary, type ISlcCourse } from '@scholaracle/contracts';
import type { ISourceCourse } from '@scholaracle/connector';

const SIS_PROVIDERS = new Set(['skyward', 'aeries']);

export interface IMergedCourseScheduleView {
  readonly classMeetingSummary?: string;
  readonly scrapedTutorialWindow?: string;
}

export function pickSisCourseExternalId(sources: readonly ISourceCourse[]): string | undefined {
  const sis = sources.find((s) => SIS_PROVIDERS.has(s.provider.toLowerCase()));
  return sis?.externalId ?? sources[0]?.externalId;
}

export function buildMergedCourseScheduleMaps(params: {
  readonly courseRecordsByExternalId: ReadonlyMap<string, Partial<ISlcCourse>>;
  readonly mergedIdToSources: ReadonlyMap<string, readonly ISourceCourse[]>;
}): Map<string, IMergedCourseScheduleView> {
  const result = new Map<string, IMergedCourseScheduleView>();
  for (const [mergedId, sources] of params.mergedIdToSources) {
    const extId = pickSisCourseExternalId(sources);
    if (!extId) continue;
    const rec = params.courseRecordsByExternalId.get(extId);
    if (!rec) continue;
    result.set(mergedId, {
      classMeetingSummary: formatClassMeetingSummary({
        period: rec.period,
        daysOfWeek: rec.daysOfWeek,
        startTime: rec.startTime,
        endTime: rec.endTime,
      }),
      scrapedTutorialWindow: rec.tutorialWindow,
    });
  }
  return result;
}
