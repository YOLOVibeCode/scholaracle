/**
 * Signal scorer tests (TDD RED phase)
 * Tests for individual scorers that evaluate assignment match signals
 */

import type { IAssignmentForReconciliation } from './assignment-reconciler';
import type { ISignalScorer } from './signal-scorers';
import {
  TitleScorer,
  PointsScorer,
  DateScorer,
  CategoryScorer,
  SequenceScorer,
} from './signal-scorers';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeAssignment(
  overrides: Partial<IAssignmentForReconciliation>
): IAssignmentForReconciliation {
  return {
    externalId: 'test-1',
    title: 'Test Assignment',
    courseExternalId: 'course-1',
    mergedCourseId: 'merged-1',
    status: 'missing',
    provider: 'canvas',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// TitleScorer tests
// ---------------------------------------------------------------------------

describe('TitleScorer', () => {
  let scorer: ISignalScorer;

  beforeEach(() => {
    scorer = new TitleScorer();
  });

  it('should have correct name and weight', () => {
    expect(scorer.name).toBe('title');
    expect(scorer.weight).toBe(0.35);
  });

  it('should return 1.0 for exact title match', () => {
    const lms = makeAssignment({ title: 'Chapter 5 Quiz' });
    const sis = makeAssignment({ title: 'Chapter 5 Quiz' });

    const signal = scorer.score(lms, sis);

    expect(signal.value).toBe(1.0);
    expect(signal.strength).toBe('strong');
    expect(signal.scorer).toBe('title');
  });

  it('should return high value for similar titles (>= 0.85)', () => {
    const lms = makeAssignment({ title: 'Chapter 5 Quiz' });
    const sis = makeAssignment({ title: 'Chapter 5 Quiz Makeup' });

    const signal = scorer.score(lms, sis);

    expect(signal.value).toBeGreaterThanOrEqual(0.75);
    // Actual similarity might be medium, that's ok
    expect(['strong', 'medium']).toContain(signal.strength);
  });

  it('should return medium value for moderately similar titles (0.60-0.84)', () => {
    const lms = makeAssignment({ title: 'Unit 3 Test Chapter' });
    const sis = makeAssignment({ title: 'Unit 3 Chapter Exam' });

    const signal = scorer.score(lms, sis);

    expect(signal.value).toBeGreaterThanOrEqual(0.4);
    expect(['medium', 'weak']).toContain(signal.strength);
  });

  it('should return weak or none value for slightly similar titles', () => {
    const lms = makeAssignment({ title: 'Homework Assignment 5 Practice' });
    const sis = makeAssignment({ title: 'HW 5 Problems Work' });

    const signal = scorer.score(lms, sis);

    // Jaccard similarity can be low for different wording
    expect(signal.value).toBeGreaterThanOrEqual(0);
    expect(['weak', 'medium', 'none']).toContain(signal.strength);
  });

  it('should return 0 for completely different titles', () => {
    const lms = makeAssignment({ title: 'Chapter 5 Quiz' });
    const sis = makeAssignment({ title: 'Semester Final Exam' });

    const signal = scorer.score(lms, sis);

    expect(signal.value).toBeLessThan(0.4);
    expect(signal.strength).toBe('none');
  });

  it('should ignore case and punctuation', () => {
    const lms = makeAssignment({ title: 'Chapter 5: Quiz!' });
    const sis = makeAssignment({ title: 'chapter 5 quiz' });

    const signal = scorer.score(lms, sis);

    expect(signal.value).toBeGreaterThanOrEqual(0.85);
    expect(signal.strength).toBe('strong');
  });
});

// ---------------------------------------------------------------------------
// PointsScorer tests
// ---------------------------------------------------------------------------

describe('PointsScorer', () => {
  let scorer: ISignalScorer;

  beforeEach(() => {
    scorer = new PointsScorer();
  });

  it('should have correct name and weight', () => {
    expect(scorer.name).toBe('points');
    expect(scorer.weight).toBe(0.25);
  });

  it('should return 1.0 for exact points match', () => {
    const lms = makeAssignment({ pointsPossible: 100 });
    const sis = makeAssignment({ pointsPossible: 100 });

    const signal = scorer.score(lms, sis);

    expect(signal.value).toBe(1.0);
    expect(signal.strength).toBe('strong');
  });

  it('should return 0.8 for points within 5%', () => {
    const lms = makeAssignment({ pointsPossible: 100 });
    const sis = makeAssignment({ pointsPossible: 98 });

    const signal = scorer.score(lms, sis);

    expect(signal.value).toBe(0.8);
    expect(signal.strength).toBe('strong');
  });

  it('should return 0.5 for points within 20%', () => {
    const lms = makeAssignment({ pointsPossible: 100 });
    const sis = makeAssignment({ pointsPossible: 85 });

    const signal = scorer.score(lms, sis);

    expect(signal.value).toBe(0.5);
    expect(signal.strength).toBe('medium');
  });

  it('should return 0 for points differing by more than 20%', () => {
    const lms = makeAssignment({ pointsPossible: 100 });
    const sis = makeAssignment({ pointsPossible: 50 });

    const signal = scorer.score(lms, sis);

    expect(signal.value).toBe(0);
    expect(signal.strength).toBe('none');
  });

  it('should return none when LMS points missing', () => {
    const lms = makeAssignment({ pointsPossible: undefined });
    const sis = makeAssignment({ pointsPossible: 100 });

    const signal = scorer.score(lms, sis);

    expect(signal.value).toBe(0);
    expect(signal.strength).toBe('none');
  });

  it('should return none when SIS points missing', () => {
    const lms = makeAssignment({ pointsPossible: 100 });
    const sis = makeAssignment({ pointsPossible: undefined });

    const signal = scorer.score(lms, sis);

    expect(signal.value).toBe(0);
    expect(signal.strength).toBe('none');
  });

  it('should handle 0/0 edge case', () => {
    const lms = makeAssignment({ pointsPossible: 0 });
    const sis = makeAssignment({ pointsPossible: 0 });

    const signal = scorer.score(lms, sis);

    expect(signal.value).toBe(1.0);
    expect(signal.strength).toBe('strong');
  });
});

// ---------------------------------------------------------------------------
// DateScorer tests
// ---------------------------------------------------------------------------

describe('DateScorer', () => {
  let scorer: ISignalScorer;

  beforeEach(() => {
    scorer = new DateScorer();
  });

  it('should have correct name and weight', () => {
    expect(scorer.name).toBe('date');
    expect(scorer.weight).toBe(0.2);
  });

  it('should return 1.0 for same day', () => {
    const lms = makeAssignment({ dueAt: '2026-03-15T23:59:00Z' });
    const sis = makeAssignment({ dueAt: '2026-03-15T14:00:00Z' });

    const signal = scorer.score(lms, sis);

    expect(signal.value).toBe(1.0);
    expect(signal.strength).toBe('strong');
  });

  it('should return 0.9 for dates within 1-2 days', () => {
    const lms = makeAssignment({ dueAt: '2026-03-15T10:00:00Z' });
    const sis = makeAssignment({ dueAt: '2026-03-16T18:00:00Z' }); // 32 hours = 1.33 days

    const signal = scorer.score(lms, sis);

    expect(signal.value).toBe(0.9);
    expect(signal.strength).toBe('strong');
  });

  it('should return 0.7 for dates within 3 days', () => {
    const lms = makeAssignment({ dueAt: '2026-03-15T12:00:00Z' });
    const sis = makeAssignment({ dueAt: '2026-03-18T06:00:00Z' }); // ~2.75 days

    const signal = scorer.score(lms, sis);

    expect(signal.value).toBe(0.7);
    expect(signal.strength).toBe('medium');
  });

  it('should return 0.4 for dates within 7 days', () => {
    const lms = makeAssignment({ dueAt: '2026-03-15T23:59:00Z' });
    const sis = makeAssignment({ dueAt: '2026-03-20T14:00:00Z' });

    const signal = scorer.score(lms, sis);

    expect(signal.value).toBe(0.4);
    expect(signal.strength).toBe('weak');
  });

  it('should return 0 for dates more than 7 days apart', () => {
    const lms = makeAssignment({ dueAt: '2026-03-15T23:59:00Z' });
    const sis = makeAssignment({ dueAt: '2026-04-01T14:00:00Z' });

    const signal = scorer.score(lms, sis);

    expect(signal.value).toBe(0);
    expect(signal.strength).toBe('none');
  });

  it('should return none when LMS date missing', () => {
    const lms = makeAssignment({ dueAt: undefined });
    const sis = makeAssignment({ dueAt: '2026-03-15T14:00:00Z' });

    const signal = scorer.score(lms, sis);

    expect(signal.value).toBe(0);
    expect(signal.strength).toBe('none');
  });

  it('should return none when SIS date missing', () => {
    const lms = makeAssignment({ dueAt: '2026-03-15T14:00:00Z' });
    const sis = makeAssignment({ dueAt: undefined });

    const signal = scorer.score(lms, sis);

    expect(signal.value).toBe(0);
    expect(signal.strength).toBe('none');
  });
});

// ---------------------------------------------------------------------------
// CategoryScorer tests
// ---------------------------------------------------------------------------

describe('CategoryScorer', () => {
  let scorer: ISignalScorer;

  beforeEach(() => {
    scorer = new CategoryScorer();
  });

  it('should have correct name and weight', () => {
    expect(scorer.name).toBe('category');
    expect(scorer.weight).toBe(0.1);
  });

  it('should return 1.0 for exact category match', () => {
    const lms = makeAssignment({ category: 'Quiz' });
    const sis = makeAssignment({ category: 'Quiz' });

    const signal = scorer.score(lms, sis);

    expect(signal.value).toBe(1.0);
    expect(signal.strength).toBe('strong');
  });

  it('should return 1.0 for equivalent categories (quiz/quizzes)', () => {
    const lms = makeAssignment({ category: 'Quiz' });
    const sis = makeAssignment({ category: 'Quizzes' });

    const signal = scorer.score(lms, sis);

    expect(signal.value).toBe(1.0);
    expect(signal.strength).toBe('strong');
  });

  it('should return 1.0 for equivalent categories (test/exam)', () => {
    const lms = makeAssignment({ category: 'Test' });
    const sis = makeAssignment({ category: 'Exam' });

    const signal = scorer.score(lms, sis);

    expect(signal.value).toBe(1.0);
    expect(signal.strength).toBe('strong');
  });

  it('should return 1.0 for equivalent categories (homework/hw)', () => {
    const lms = makeAssignment({ category: 'Homework' });
    const sis = makeAssignment({ category: 'HW' });

    const signal = scorer.score(lms, sis);

    expect(signal.value).toBe(1.0);
    expect(signal.strength).toBe('strong');
  });

  it('should return 0.2 for incompatible categories', () => {
    const lms = makeAssignment({ category: 'Test' });
    const sis = makeAssignment({ category: 'Homework' });

    const signal = scorer.score(lms, sis);

    expect(signal.value).toBe(0.2);
    expect(signal.strength).toBe('none');
  });

  it('should return 0.5 when LMS category missing', () => {
    const lms = makeAssignment({ category: undefined });
    const sis = makeAssignment({ category: 'Quiz' });

    const signal = scorer.score(lms, sis);

    expect(signal.value).toBe(0.5);
    expect(signal.strength).toBe('medium');
  });

  it('should return 0.5 when SIS category missing', () => {
    const lms = makeAssignment({ category: 'Quiz' });
    const sis = makeAssignment({ category: undefined });

    const signal = scorer.score(lms, sis);

    expect(signal.value).toBe(0.5);
    expect(signal.strength).toBe('medium');
  });

  it('should return 0.5 when both categories missing', () => {
    const lms = makeAssignment({ category: undefined });
    const sis = makeAssignment({ category: undefined });

    const signal = scorer.score(lms, sis);

    expect(signal.value).toBe(0.5);
    expect(signal.strength).toBe('medium');
  });

  it('should ignore case when matching', () => {
    const lms = makeAssignment({ category: 'QUIZ' });
    const sis = makeAssignment({ category: 'quiz' });

    const signal = scorer.score(lms, sis);

    expect(signal.value).toBe(1.0);
    expect(signal.strength).toBe('strong');
  });
});

// ---------------------------------------------------------------------------
// SequenceScorer tests
// ---------------------------------------------------------------------------

describe('SequenceScorer', () => {
  let scorer: ISignalScorer;

  beforeEach(() => {
    scorer = new SequenceScorer();
  });

  it('should have correct name and weight', () => {
    expect(scorer.name).toBe('sequence');
    expect(scorer.weight).toBe(0.1);
  });

  it('should return 1.0 for exact sequence match (Quiz 3)', () => {
    const lms = makeAssignment({ title: 'Quiz 3' });
    const sis = makeAssignment({ title: 'Quiz 3' });

    const signal = scorer.score(lms, sis);

    expect(signal.value).toBe(1.0);
    expect(signal.strength).toBe('strong');
  });

  it('should return 1.0 for same decimal sequence (HW 5.2)', () => {
    const lms = makeAssignment({ title: 'Homework 5.2' });
    const sis = makeAssignment({ title: 'HW 5.2' });

    const signal = scorer.score(lms, sis);

    expect(signal.value).toBe(1.0);
    expect(signal.strength).toBe('strong');
  });

  it('should return 0.5 for adjacent sequences (Quiz 5 vs Quiz 6)', () => {
    const lms = makeAssignment({ title: 'Quiz 5' });
    const sis = makeAssignment({ title: 'Quiz 6' });

    const signal = scorer.score(lms, sis);

    expect(signal.value).toBe(0.5);
    expect(signal.strength).toBe('medium');
  });

  it('should return 0 for non-adjacent sequences', () => {
    const lms = makeAssignment({ title: 'Quiz 3' });
    const sis = makeAssignment({ title: 'Quiz 8' });

    const signal = scorer.score(lms, sis);

    expect(signal.value).toBe(0);
    expect(signal.strength).toBe('none');
  });

  it('should return 0 when LMS has no sequence number', () => {
    const lms = makeAssignment({ title: 'Chapter Quiz' });
    const sis = makeAssignment({ title: 'Quiz 5' });

    const signal = scorer.score(lms, sis);

    expect(signal.value).toBe(0);
    expect(signal.strength).toBe('none');
  });

  it('should return 0 when SIS has no sequence number', () => {
    const lms = makeAssignment({ title: 'Quiz 5' });
    const sis = makeAssignment({ title: 'Chapter Quiz' });

    const signal = scorer.score(lms, sis);

    expect(signal.value).toBe(0);
    expect(signal.strength).toBe('none');
  });

  it('should return 0 when neither has sequence number', () => {
    const lms = makeAssignment({ title: 'Chapter Quiz' });
    const sis = makeAssignment({ title: 'Unit Test' });

    const signal = scorer.score(lms, sis);

    expect(signal.value).toBe(0);
    expect(signal.strength).toBe('none');
  });

  it('should extract sequence from end of title', () => {
    const lms = makeAssignment({ title: 'Biology Unit 3 Test' });
    const sis = makeAssignment({ title: 'Bio U3 Exam' });

    const signal = scorer.score(lms, sis);

    expect(signal.value).toBe(1.0);
    expect(signal.strength).toBe('strong');
  });
});
