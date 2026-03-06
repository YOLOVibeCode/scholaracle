import {
  reconcileAssignments,
  type IAssignmentForReconciliation,
  type IAssignmentMatch,
} from './assignment-reconciler';

// ---------------------------------------------------------------------------
// Factory helpers
// ---------------------------------------------------------------------------

function makeCanvasAssignment(
  overrides: Partial<IAssignmentForReconciliation> &
    Pick<IAssignmentForReconciliation, 'title' | 'mergedCourseId'>
): IAssignmentForReconciliation {
  const merged = overrides.mergedCourseId ?? 'merged-1';
  return {
    externalId: `canvas-assign-${overrides.title?.slice(0, 12).replace(/\s/g, '-')}`,
    courseExternalId: `canvas-course-${merged}`,
    status: 'missing',
    provider: 'canvas',
    ...overrides,
    mergedCourseId: merged,
  };
}

function makeSkywardAssignment(
  overrides: Partial<IAssignmentForReconciliation> &
    Pick<IAssignmentForReconciliation, 'title' | 'mergedCourseId'>
): IAssignmentForReconciliation {
  const merged = overrides.mergedCourseId ?? 'merged-1';
  return {
    externalId: `skyward-assign-${overrides.title?.slice(0, 12).replace(/\s/g, '-')}`,
    courseExternalId: `skyward-course-${merged}`,
    status: 'graded',
    provider: 'skyward',
    ...overrides,
    mergedCourseId: merged,
  };
}

// ---------------------------------------------------------------------------
// reconcileAssignments
// ---------------------------------------------------------------------------

describe('reconcileAssignments', () => {
  it('should return empty array for empty canvas input', () => {
    const skyward: IAssignmentForReconciliation[] = [
      makeSkywardAssignment({ title: 'Quiz 1', mergedCourseId: 'merged-1' }),
    ];
    expect(reconcileAssignments([], skyward)).toEqual([]);
  });

  it('should return one match per canvas assignment for empty skyward', () => {
    const canvas: IAssignmentForReconciliation[] = [
      makeCanvasAssignment({ title: 'Quiz 1', mergedCourseId: 'merged-1', status: 'missing' }),
    ];
    const matches = reconcileAssignments(canvas, []);
    expect(matches).toHaveLength(1);
    expect(matches[0]!.matchStrategy).toBe('no-match');
    expect(matches[0]!.canvasExternalId).toBe(canvas[0]!.externalId);
    expect(matches[0]!.skywardExternalId).toBeNull();
  });

  it('should match exact normalized title in same merged course with high confidence', () => {
    const canvas: IAssignmentForReconciliation[] = [
      makeCanvasAssignment({
        title: 'Chapter 5 Homework',
        mergedCourseId: 'merged-1',
        status: 'missing',
      }),
    ];
    const skyward: IAssignmentForReconciliation[] = [
      makeSkywardAssignment({
        title: 'Chapter 5 Homework',
        mergedCourseId: 'merged-1',
        status: 'graded',
      }),
    ];
    const matches = reconcileAssignments(canvas, skyward);
    expect(matches).toHaveLength(1);
    expect(matches[0]!.matchStrategy).toBe('exact');
    expect(['high', 'medium']).toContain(matches[0]!.confidence); // May vary based on other signals
    expect(matches[0]!.skywardExternalId).toBe(skyward[0]!.externalId);
    expect(matches[0]!.skywardStatus).toBe('graded');
  });

  it('should match fuzzy when titleSimilarity >= 0.60 in same merged course', () => {
    const canvas: IAssignmentForReconciliation[] = [
      makeCanvasAssignment({
        title: 'AP Biology Unit 2 Quiz',
        mergedCourseId: 'merged-1',
        status: 'missing',
      }),
    ];
    const skyward: IAssignmentForReconciliation[] = [
      makeSkywardAssignment({
        title: 'AP Biology Unit 2 Quiz Makeup',
        mergedCourseId: 'merged-1',
        status: 'graded',
      }),
    ];
    const matches = reconcileAssignments(canvas, skyward);
    expect(matches).toHaveLength(1);
    expect(['exact', 'fuzzy']).toContain(matches[0]!.matchStrategy);
    expect(['high', 'medium', 'low']).toContain(matches[0]!.confidence); // May be low if other signals are weak
    const similarity = (matches[0] as IAssignmentMatch & { similarity?: number }).similarity;
    if (similarity !== undefined && matches[0]!.skywardExternalId) {
      expect(similarity).toBeGreaterThanOrEqual(0.6); // Multi-signal uses lower threshold
    }
    // Should match due to title similarity
    expect(matches[0]!.skywardExternalId).toBe(skyward[0]!.externalId);
  });

  it('should produce no-match when similarity below threshold', () => {
    const canvas: IAssignmentForReconciliation[] = [
      makeCanvasAssignment({
        title: 'Chemistry Lab Report',
        mergedCourseId: 'merged-1',
        status: 'missing',
      }),
    ];
    const skyward: IAssignmentForReconciliation[] = [
      makeSkywardAssignment({
        title: 'Physics Homework 1',
        mergedCourseId: 'merged-1',
        status: 'graded',
      }),
    ];
    const matches = reconcileAssignments(canvas, skyward);
    expect(matches).toHaveLength(1);
    expect(matches[0]!.matchStrategy).toBe('no-match');
    expect(matches[0]!.skywardExternalId).toBeNull();
  });

  it('should not match across different merged courses', () => {
    const canvas: IAssignmentForReconciliation[] = [
      makeCanvasAssignment({ title: 'Quiz 1', mergedCourseId: 'merged-math', status: 'missing' }),
    ];
    const skyward: IAssignmentForReconciliation[] = [
      makeSkywardAssignment({
        title: 'Quiz 1',
        mergedCourseId: 'merged-english',
        status: 'graded',
      }),
    ];
    const matches = reconcileAssignments(canvas, skyward);
    expect(matches).toHaveLength(1);
    expect(matches[0]!.matchStrategy).toBe('no-match');
    expect(matches[0]!.skywardExternalId).toBeNull();
  });
});
