import { resolveMergedCourseId } from './resolveMergedCourseId';

describe('resolveMergedCourseId', () => {
  it('returns merged id when canvas and skyward titles match', () => {
    const merged = resolveMergedCourseId('sky-1', [
      {
        externalId: 'sky-1',
        sourceId: 's1',
        provider: 'skyward',
        title: 'Algebra 1',
      },
      {
        externalId: 'canvas-1',
        sourceId: 's2',
        provider: 'canvas',
        title: 'Algebra 1',
      },
    ]);
    expect(merged).toBe('d6f4be7215a0');
    expect(merged).toBe(
      resolveMergedCourseId('canvas-1', [
        {
          externalId: 'sky-1',
          sourceId: 's1',
          provider: 'skyward',
          title: 'Algebra 1',
        },
        {
          externalId: 'canvas-1',
          sourceId: 's2',
          provider: 'canvas',
          title: 'Algebra 1',
        },
      ])
    );
  });
});
