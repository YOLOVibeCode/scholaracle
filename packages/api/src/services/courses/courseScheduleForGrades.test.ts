import { buildMergedCourseScheduleMaps, pickSisCourseExternalId } from './courseScheduleForGrades';
import type { ISourceCourse } from '@scholaracle/connector';

describe('courseScheduleForGrades', () => {
  it('pickSisCourseExternalId prefers skyward over canvas', () => {
    const sources: ISourceCourse[] = [
      { externalId: 'canvas-1', sourceId: 's1', provider: 'canvas', title: 'Alg' },
      { externalId: 'sky-1', sourceId: 's2', provider: 'skyward', title: 'Alg' },
    ];
    expect(pickSisCourseExternalId(sources)).toBe('sky-1');
  });

  it('buildMergedCourseScheduleMaps formats class meeting and tutorial', () => {
    const courseRecordsByExternalId = new Map([
      [
        'sky-1',
        {
          period: '2',
          startTime: '09:00',
          endTime: '09:50',
          tutorialWindow: 'Tue/Thu 7:15–7:45 AM',
        },
      ],
    ]);
    const mergedIdToSources = new Map<string, readonly ISourceCourse[]>([
      ['merged-1', [{ externalId: 'sky-1', sourceId: 's2', provider: 'skyward', title: 'Alg' }]],
    ]);
    const maps = buildMergedCourseScheduleMaps({ courseRecordsByExternalId, mergedIdToSources });
    expect(maps.get('merged-1')).toEqual({
      classMeetingSummary: 'Period 2 · 09:00–09:50',
      scrapedTutorialWindow: 'Tue/Thu 7:15–7:45 AM',
    });
  });
});
