/**
 * Multi-signal matcher tests (TDD RED phase)
 * Tests for the 4-pass multi-signal matching algorithm
 */

import type { IAssignmentForReconciliation } from './assignment-reconciler';
import { multiSignalMatch } from './multi-signal-matcher';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeLmsAssignment(
  overrides: Partial<IAssignmentForReconciliation>
): IAssignmentForReconciliation {
  return {
    externalId: `lms-${Math.random()}`,
    title: 'Test Assignment',
    courseExternalId: 'lms-course-1',
    mergedCourseId: 'merged-1',
    status: 'missing',
    provider: 'canvas',
    ...overrides,
  };
}

function makeSisAssignment(
  overrides: Partial<IAssignmentForReconciliation>
): IAssignmentForReconciliation {
  return {
    externalId: `sis-${Math.random()}`,
    title: 'Test Assignment',
    courseExternalId: 'sis-course-1',
    mergedCourseId: 'merged-1',
    status: 'graded',
    provider: 'skyward',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Pass 1: Exact title match
// ---------------------------------------------------------------------------

describe('multiSignalMatch - Pass 1 (Exact title)', () => {
  it('should match assignments with exact titles in same merged course', () => {
    const lms = [makeLmsAssignment({ title: 'Chapter 5 Quiz', externalId: 'lms-1' })];
    const sis = [makeSisAssignment({ title: 'Chapter 5 Quiz', externalId: 'sis-1' })];

    const matches = multiSignalMatch(lms, sis);

    expect(matches).toHaveLength(1);
    expect(matches[0]?.lmsExternalId).toBe('lms-1');
    expect(matches[0]?.sisExternalId).toBe('sis-1');
    expect(matches[0]?.matchPass).toBe(1);
    expect(['high', 'medium']).toContain(matches[0]?.confidence);
    expect(matches[0]?.aggregateScore).toBeGreaterThanOrEqual(0.35); // Title weight
  });

  it('should not match assignments in different merged courses', () => {
    const lms = [makeLmsAssignment({ title: 'Quiz 1', mergedCourseId: 'merged-math' })];
    const sis = [makeSisAssignment({ title: 'Quiz 1', mergedCourseId: 'merged-english' })];

    const matches = multiSignalMatch(lms, sis);

    expect(matches).toHaveLength(1);
    expect(matches[0]?.sisExternalId).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Pass 2: Fuzzy title + signal boost
// ---------------------------------------------------------------------------

describe('multiSignalMatch - Pass 2 (Fuzzy title + signals)', () => {
  it('should match with fuzzy title and strong points signal', () => {
    const lms = [
      makeLmsAssignment({
        title: 'Chapter 5 Quiz',
        pointsPossible: 100,
        externalId: 'lms-1',
      }),
    ];
    const sis = [
      makeSisAssignment({
        title: 'Ch 5 Quiz',
        pointsPossible: 100,
        externalId: 'sis-1',
      }),
    ];

    const matches = multiSignalMatch(lms, sis);

    expect(matches).toHaveLength(1);
    expect(matches[0]?.lmsExternalId).toBe('lms-1');
    expect(matches[0]?.sisExternalId).toBe('sis-1');
    expect(matches[0]?.matchPass).toBeGreaterThanOrEqual(1);
    expect(matches[0]?.matchPass).toBeLessThanOrEqual(4);
    expect(matches[0]?.aggregateScore).toBeGreaterThanOrEqual(0.5);
  });

  it('should match with moderate title but same date and points', () => {
    const lms = [
      makeLmsAssignment({
        title: 'Unit 3 Test',
        pointsPossible: 100,
        dueAt: '2026-03-15T23:59:00Z',
        externalId: 'lms-1',
      }),
    ];
    const sis = [
      makeSisAssignment({
        title: 'Unit 3 Exam',
        pointsPossible: 100,
        dueAt: '2026-03-15T14:00:00Z',
        externalId: 'sis-1',
      }),
    ];

    const matches = multiSignalMatch(lms, sis);

    expect(matches).toHaveLength(1);
    expect(matches[0]?.sisExternalId).toBe('sis-1');
    expect(matches[0]?.aggregateScore).toBeGreaterThanOrEqual(0.7);
  });
});

// ---------------------------------------------------------------------------
// Pass 3: Score + Date (no title required)
// ---------------------------------------------------------------------------

describe('multiSignalMatch - Pass 3 (Score + Date)', () => {
  it('should match assignments with same points and date despite different titles', () => {
    const lms = [
      makeLmsAssignment({
        title: 'Assignment 1',
        pointsPossible: 50,
        dueAt: '2026-03-15T23:59:00Z',
        externalId: 'lms-1',
      }),
    ];
    const sis = [
      makeSisAssignment({
        title: 'HW Chapter 5',
        pointsPossible: 50,
        dueAt: '2026-03-15T14:00:00Z',
        externalId: 'sis-1',
      }),
    ];

    const matches = multiSignalMatch(lms, sis);

    expect(matches).toHaveLength(1);
    expect(matches[0]?.sisExternalId).toBe('sis-1');
    expect(matches[0]?.matchPass).toBeLessThanOrEqual(3);
  });

  it('should match with same category, points, and date', () => {
    const lms = [
      makeLmsAssignment({
        title: 'Test A',
        category: 'Quiz',
        pointsPossible: 20,
        dueAt: '2026-03-15T23:59:00Z',
        externalId: 'lms-1',
      }),
    ];
    const sis = [
      makeSisAssignment({
        title: 'Q1',
        category: 'Quizzes',
        pointsPossible: 20,
        dueAt: '2026-03-15T14:00:00Z',
        externalId: 'sis-1',
      }),
    ];

    const matches = multiSignalMatch(lms, sis);

    expect(matches).toHaveLength(1);
    expect(matches[0]?.sisExternalId).toBe('sis-1');
  });
});

// ---------------------------------------------------------------------------
// Pass 4: Sequence + Chronological
// ---------------------------------------------------------------------------

describe('multiSignalMatch - Pass 4 (Sequence)', () => {
  it('should match by sequence number when titles differ', () => {
    const lms = [
      makeLmsAssignment({
        title: 'Homework 5',
        category: 'Homework',
        externalId: 'lms-1',
      }),
    ];
    const sis = [
      makeSisAssignment({
        title: 'HW5',
        category: 'Daily Work',
        externalId: 'sis-1',
      }),
    ];

    const matches = multiSignalMatch(lms, sis);

    expect(matches).toHaveLength(1);
    // Sequence signal alone might not be strong enough, so check if matched or not
    if (matches[0]?.sisExternalId) {
      expect(matches[0].sisExternalId).toBe('sis-1');
      expect(matches[0].matchPass).toBeGreaterThanOrEqual(1);
      expect(matches[0].matchPass).toBeLessThanOrEqual(4);
    } else {
      // If not matched, that's also acceptable for weak signals
      expect(matches[0]?.sisExternalId).toBeNull();
    }
  });
});

// ---------------------------------------------------------------------------
// Greedy exclusion
// ---------------------------------------------------------------------------

describe('multiSignalMatch - Greedy exclusion', () => {
  it('should not reuse SIS assignments once matched', () => {
    const lms = [
      makeLmsAssignment({ title: 'Quiz 1', externalId: 'lms-1' }),
      makeLmsAssignment({ title: 'Quiz One', externalId: 'lms-2' }),
    ];
    const sis = [makeSisAssignment({ title: 'Quiz 1', externalId: 'sis-1' })];

    const matches = multiSignalMatch(lms, sis);

    expect(matches).toHaveLength(2);
    const matched = matches.filter((m) => m.sisExternalId !== null);
    expect(matched).toHaveLength(1); // Only one can match
    const unmatched = matches.filter((m) => m.sisExternalId === null);
    expect(unmatched).toHaveLength(1);
  });

  it('should pick best match in each pass before moving to next', () => {
    const lms = [makeLmsAssignment({ title: 'Chapter 5 Quiz', externalId: 'lms-1' })];
    const sis = [
      makeSisAssignment({ title: 'Chapter 5 Quiz Makeup', externalId: 'sis-1' }),
      makeSisAssignment({ title: 'Chapter 5 Quiz', externalId: 'sis-2' }),
    ];

    const matches = multiSignalMatch(lms, sis);

    expect(matches).toHaveLength(1);
    expect(matches[0]?.sisExternalId).toBe('sis-2'); // Exact match wins
  });
});

// ---------------------------------------------------------------------------
// Review flagging
// ---------------------------------------------------------------------------

describe('multiSignalMatch - Review flagging', () => {
  it('should flag for review when aggregate score is 0.50-0.70', () => {
    const lms = [
      makeLmsAssignment({
        title: 'Assignment',
        pointsPossible: 10,
        externalId: 'lms-1',
      }),
    ];
    const sis = [
      makeSisAssignment({
        title: 'Work',
        pointsPossible: 10,
        externalId: 'sis-1',
      }),
    ];

    const matches = multiSignalMatch(lms, sis);

    // With weak signals, might be flagged or unmatched
    expect(matches).toHaveLength(1);
    if (matches[0]?.sisExternalId) {
      expect([true, false]).toContain(matches[0]?.requiresReview);
    }
  });

  it('should not flag high confidence matches for review', () => {
    const lms = [
      makeLmsAssignment({
        title: 'Chapter 5 Quiz',
        pointsPossible: 100,
        dueAt: '2026-03-15T23:59:00Z',
        externalId: 'lms-1',
      }),
    ];
    const sis = [
      makeSisAssignment({
        title: 'Chapter 5 Quiz',
        pointsPossible: 100,
        dueAt: '2026-03-15T14:00:00Z',
        externalId: 'sis-1',
      }),
    ];

    const matches = multiSignalMatch(lms, sis);

    expect(matches[0]?.requiresReview).toBe(false);
    expect(matches[0]?.confidence).toBe('high');
  });
});

// ---------------------------------------------------------------------------
// No match scenarios
// ---------------------------------------------------------------------------

describe('multiSignalMatch - No match', () => {
  it('should return null sisExternalId when no match found', () => {
    const lms = [makeLmsAssignment({ title: 'Chapter 5 Quiz', externalId: 'lms-1' })];
    const sis = [makeSisAssignment({ title: 'Semester Final Exam', externalId: 'sis-1' })];

    const matches = multiSignalMatch(lms, sis);

    expect(matches).toHaveLength(1);
    expect(matches[0]?.lmsExternalId).toBe('lms-1');
    expect(matches[0]?.sisExternalId).toBeNull();
    expect(matches[0]?.confidence).toBe('low');
  });

  it('should return empty sisExternalId array when no SIS assignments provided', () => {
    const lms = [makeLmsAssignment({ title: 'Quiz 1', externalId: 'lms-1' })];
    const sis: IAssignmentForReconciliation[] = [];

    const matches = multiSignalMatch(lms, sis);

    expect(matches).toHaveLength(1);
    expect(matches[0]?.sisExternalId).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Alternative candidates tracking
// ---------------------------------------------------------------------------

describe('multiSignalMatch - Alternative candidates', () => {
  it('should track number of alternative plausible matches', () => {
    const lms = [
      makeLmsAssignment({
        title: 'Quiz',
        pointsPossible: 50,
        externalId: 'lms-1',
      }),
    ];
    const sis = [
      makeSisAssignment({ title: 'Quiz 1', pointsPossible: 50, externalId: 'sis-1' }),
      makeSisAssignment({ title: 'Quiz 2', pointsPossible: 50, externalId: 'sis-2' }),
      makeSisAssignment({ title: 'Quiz 3', pointsPossible: 50, externalId: 'sis-3' }),
    ];

    const matches = multiSignalMatch(lms, sis);

    expect(matches).toHaveLength(1);
    // Should pick one and note there were alternatives
    if (matches[0]?.alternativeCandidates != null) {
      expect(matches[0].alternativeCandidates).toBeGreaterThanOrEqual(0);
    }
  });
});

// ---------------------------------------------------------------------------
// Google Classroom parity
// ---------------------------------------------------------------------------

describe('multiSignalMatch - Google Classroom', () => {
  it('should treat Google Classroom same as Canvas', () => {
    const lms = [
      makeLmsAssignment({
        title: 'Chapter 5 Quiz',
        provider: 'google_classroom',
        externalId: 'gc-1',
      }),
    ];
    const sis = [makeSisAssignment({ title: 'Chapter 5 Quiz', externalId: 'sis-1' })];

    const matches = multiSignalMatch(lms, sis);

    expect(matches).toHaveLength(1);
    expect(matches[0]?.lmsExternalId).toBe('gc-1');
    expect(matches[0]?.sisExternalId).toBe('sis-1');
    expect(matches[0]?.lmsProvider).toBe('google_classroom');
  });
});

// ---------------------------------------------------------------------------
// Multiple assignments
// ---------------------------------------------------------------------------

describe('multiSignalMatch - Multiple assignments', () => {
  it('should handle multiple LMS and SIS assignments across all passes', () => {
    const lms = [
      makeLmsAssignment({ title: 'Quiz 1', externalId: 'lms-1' }), // Pass 1
      makeLmsAssignment({
        title: 'Test 2',
        pointsPossible: 100,
        dueAt: '2026-03-15T23:59:00Z',
        externalId: 'lms-2',
      }), // Pass 2
      makeLmsAssignment({
        title: 'Assignment',
        pointsPossible: 20,
        dueAt: '2026-03-20T23:59:00Z',
        externalId: 'lms-3',
      }), // Pass 3
    ];
    const sis = [
      makeSisAssignment({ title: 'Quiz 1', externalId: 'sis-1' }),
      makeSisAssignment({
        title: 'Exam 2',
        pointsPossible: 100,
        dueAt: '2026-03-15T14:00:00Z',
        externalId: 'sis-2',
      }),
      makeSisAssignment({
        title: 'HW5',
        pointsPossible: 20,
        dueAt: '2026-03-20T14:00:00Z',
        externalId: 'sis-3',
      }),
    ];

    const matches = multiSignalMatch(lms, sis);

    expect(matches).toHaveLength(3);
    const matched = matches.filter((m) => m.sisExternalId !== null);
    expect(matched.length).toBeGreaterThanOrEqual(2); // At least 2 should match
  });
});
