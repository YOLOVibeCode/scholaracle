/* eslint-disable complexity */
/**
 * Multi-signal assignment matcher.
 * Implements a 4-pass greedy matching algorithm with weighted signal scoring.
 */

import type { IAssignmentForReconciliation } from './assignment-reconciler';
import type { IMatchSignal } from './signal-scorers';
import {
  TitleScorer,
  PointsScorer,
  DateScorer,
  CategoryScorer,
  SequenceScorer,
} from './signal-scorers';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface IMultiSignalMatch {
  readonly lmsExternalId: string;
  readonly sisExternalId: string | null;
  readonly lmsProvider: string;
  readonly sisProvider: string;
  readonly signals: readonly IMatchSignal[];
  readonly aggregateScore: number;
  readonly confidence: 'high' | 'medium' | 'low';
  readonly matchPass: number;
  readonly requiresReview: boolean;
  readonly alternativeCandidates?: number;
}

// ---------------------------------------------------------------------------
// Scorers
// ---------------------------------------------------------------------------

const scorers = [
  new TitleScorer(),
  new PointsScorer(),
  new DateScorer(),
  new CategoryScorer(),
  new SequenceScorer(),
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function computeAggregateScore(signals: readonly IMatchSignal[]): number {
  let total = 0;
  for (const signal of signals) {
    const scorer = scorers.find((s) => s.name === signal.scorer);
    if (scorer) {
      total += signal.value * scorer.weight;
    }
  }
  return total;
}

function classifyConfidence(score: number): 'high' | 'medium' | 'low' {
  if (score >= 0.7) return 'high';
  if (score >= 0.5) return 'medium';
  return 'low';
}

function scoreCandidate(
  lms: IAssignmentForReconciliation,
  sis: IAssignmentForReconciliation
): { signals: IMatchSignal[]; aggregateScore: number } {
  const signals = scorers.map((scorer) => scorer.score(lms, sis));
  const aggregateScore = computeAggregateScore(signals);
  return { signals, aggregateScore };
}

// ---------------------------------------------------------------------------
// Multi-pass matching
// ---------------------------------------------------------------------------

export function multiSignalMatch(
  lmsAssignments: readonly IAssignmentForReconciliation[],
  sisAssignments: readonly IAssignmentForReconciliation[]
): readonly IMultiSignalMatch[] {
  const results: IMultiSignalMatch[] = [];
  const unmatchedLms = [...lmsAssignments];
  const unmatchedSis = [...sisAssignments];

  // Pass 1: Exact title match
  for (let i = unmatchedLms.length - 1; i >= 0; i--) {
    const lms = unmatchedLms[i]!;
    const lmsNorm = normalizeTitle(lms.title);

    let bestMatch: { sis: IAssignmentForReconciliation; sisIdx: number; score: number } | null =
      null;

    for (let j = 0; j < unmatchedSis.length; j++) {
      const sis = unmatchedSis[j]!;
      if (sis.mergedCourseId !== lms.mergedCourseId) continue;

      const sisNorm = normalizeTitle(sis.title);
      if (lmsNorm === sisNorm) {
        const { aggregateScore } = scoreCandidate(lms, sis);
        if (!bestMatch || aggregateScore > bestMatch.score) {
          bestMatch = { sis, sisIdx: j, score: aggregateScore };
        }
      }
    }

    if (bestMatch) {
      const { signals, aggregateScore } = scoreCandidate(lms, bestMatch.sis);
      results.push({
        lmsExternalId: lms.externalId,
        sisExternalId: bestMatch.sis.externalId,
        lmsProvider: lms.provider,
        sisProvider: bestMatch.sis.provider,
        signals,
        aggregateScore,
        confidence: classifyConfidence(aggregateScore),
        matchPass: 1,
        requiresReview: aggregateScore >= 0.5 && aggregateScore < 0.7,
      });
      unmatchedLms.splice(i, 1);
      unmatchedSis.splice(bestMatch.sisIdx, 1);
    }
  }

  // Pass 2: Fuzzy title + signal boost (title >= 0.60, aggregate >= 0.60)
  for (let i = unmatchedLms.length - 1; i >= 0; i--) {
    const lms = unmatchedLms[i]!;

    let bestMatch: {
      sis: IAssignmentForReconciliation;
      sisIdx: number;
      signals: IMatchSignal[];
      score: number;
      alternatives: number;
    } | null = null;

    const candidates: Array<{ sis: IAssignmentForReconciliation; sisIdx: number; score: number }> =
      [];

    for (let j = 0; j < unmatchedSis.length; j++) {
      const sis = unmatchedSis[j]!;
      if (sis.mergedCourseId !== lms.mergedCourseId) continue;

      const { signals, aggregateScore } = scoreCandidate(lms, sis);
      const titleSignal = signals.find((s) => s.scorer === 'title');

      if (titleSignal && titleSignal.value >= 0.6 && aggregateScore >= 0.6) {
        candidates.push({ sis, sisIdx: j, score: aggregateScore });
        if (!bestMatch || aggregateScore > bestMatch.score) {
          bestMatch = {
            sis,
            sisIdx: j,
            signals,
            score: aggregateScore,
            alternatives: 0,
          };
        }
      }
    }

    if (bestMatch) {
      bestMatch.alternatives = candidates.length - 1;
      results.push({
        lmsExternalId: lms.externalId,
        sisExternalId: bestMatch.sis.externalId,
        lmsProvider: lms.provider,
        sisProvider: bestMatch.sis.provider,
        signals: bestMatch.signals,
        aggregateScore: bestMatch.score,
        confidence: classifyConfidence(bestMatch.score),
        matchPass: 2,
        requiresReview: bestMatch.score >= 0.5 && bestMatch.score < 0.7,
        alternativeCandidates: bestMatch.alternatives > 0 ? bestMatch.alternatives : undefined,
      });
      unmatchedLms.splice(i, 1);
      unmatchedSis.splice(bestMatch.sisIdx, 1);
    }
  }

  // Pass 3: Score + Date (no title required, aggregate >= 0.50, at least 2 medium+ signals)
  for (let i = unmatchedLms.length - 1; i >= 0; i--) {
    const lms = unmatchedLms[i]!;

    let bestMatch: {
      sis: IAssignmentForReconciliation;
      sisIdx: number;
      signals: IMatchSignal[];
      score: number;
    } | null = null;

    for (let j = 0; j < unmatchedSis.length; j++) {
      const sis = unmatchedSis[j]!;
      if (sis.mergedCourseId !== lms.mergedCourseId) continue;

      const { signals, aggregateScore } = scoreCandidate(lms, sis);
      const strongOrMediumSignals = signals.filter((s) =>
        ['strong', 'medium'].includes(s.strength)
      ).length;

      if (aggregateScore >= 0.5 && strongOrMediumSignals >= 2) {
        if (!bestMatch || aggregateScore > bestMatch.score) {
          bestMatch = { sis, sisIdx: j, signals, score: aggregateScore };
        }
      }
    }

    if (bestMatch) {
      results.push({
        lmsExternalId: lms.externalId,
        sisExternalId: bestMatch.sis.externalId,
        lmsProvider: lms.provider,
        sisProvider: bestMatch.sis.provider,
        signals: bestMatch.signals,
        aggregateScore: bestMatch.score,
        confidence: classifyConfidence(bestMatch.score),
        matchPass: 3,
        requiresReview: bestMatch.score >= 0.5 && bestMatch.score < 0.7,
      });
      unmatchedLms.splice(i, 1);
      unmatchedSis.splice(bestMatch.sisIdx, 1);
    }
  }

  // Pass 4: Sequence + category (aggregate >= 0.40 or sequence match with any aggregate > 0)
  for (let i = unmatchedLms.length - 1; i >= 0; i--) {
    const lms = unmatchedLms[i]!;

    let bestMatch: {
      sis: IAssignmentForReconciliation;
      sisIdx: number;
      signals: IMatchSignal[];
      score: number;
    } | null = null;

    for (let j = 0; j < unmatchedSis.length; j++) {
      const sis = unmatchedSis[j]!;
      if (sis.mergedCourseId !== lms.mergedCourseId) continue;

      const { signals, aggregateScore } = scoreCandidate(lms, sis);
      const seqSignal = signals.find((s) => s.scorer === 'sequence');

      if (seqSignal && seqSignal.value > 0 && aggregateScore >= 0.4) {
        if (!bestMatch || aggregateScore > bestMatch.score) {
          bestMatch = { sis, sisIdx: j, signals, score: aggregateScore };
        }
      }
    }

    if (bestMatch) {
      results.push({
        lmsExternalId: lms.externalId,
        sisExternalId: bestMatch.sis.externalId,
        lmsProvider: lms.provider,
        sisProvider: bestMatch.sis.provider,
        signals: bestMatch.signals,
        aggregateScore: bestMatch.score,
        confidence: classifyConfidence(bestMatch.score),
        matchPass: 4,
        requiresReview: bestMatch.score >= 0.5 && bestMatch.score < 0.7,
      });
      unmatchedLms.splice(i, 1);
      unmatchedSis.splice(bestMatch.sisIdx, 1);
    }
  }

  // Remaining LMS assignments: no match
  for (const lms of unmatchedLms) {
    results.push({
      lmsExternalId: lms.externalId,
      sisExternalId: null,
      lmsProvider: lms.provider,
      sisProvider: '',
      signals: [],
      aggregateScore: 0,
      confidence: 'low',
      matchPass: 0,
      requiresReview: false,
    });
  }

  // Sort by original LMS order (by externalId)
  return results.sort((a, b) => {
    const aIdx = lmsAssignments.findIndex((lms) => lms.externalId === a.lmsExternalId);
    const bIdx = lmsAssignments.findIndex((lms) => lms.externalId === b.lmsExternalId);
    return aIdx - bIdx;
  });
}
