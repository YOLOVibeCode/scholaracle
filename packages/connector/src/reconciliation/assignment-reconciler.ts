/**
 * Assignment reconciliation: match LMS assignments (Canvas/Google Classroom) to SIS (Skyward)
 * using multi-signal scoring. Used to suppress MISSING_ASSIGNMENT when Skyward shows graded/submitted.
 */

import { titleSimilarity } from './course-reconciler';
import { multiSignalMatch } from './multi-signal-matcher';
import type { IMatchSignal } from './signal-scorers';

export type MatchStrategy = 'exact' | 'fuzzy' | 'no-match';
export type MatchConfidence = 'high' | 'medium' | 'low';

export interface IAssignmentForReconciliation {
  readonly externalId: string;
  readonly title: string;
  readonly courseExternalId: string;
  readonly mergedCourseId: string;
  readonly status: string;
  readonly dueAt?: string;
  readonly pointsPossible?: number;
  readonly pointsEarned?: number;
  readonly category?: string;
  readonly observedAt?: string;
  readonly provider: string;
  readonly assignedAt?: string;
}

export interface IAssignmentMatch {
  readonly canvasExternalId: string;
  readonly skywardExternalId: string | null;
  readonly matchStrategy: MatchStrategy;
  readonly confidence: MatchConfidence;
  readonly similarity?: number;
  readonly skywardStatus?: string;
  // New multi-signal fields (optional for backward compatibility)
  readonly signals?: readonly IMatchSignal[];
  readonly aggregateScore?: number;
  readonly matchPass?: number;
  readonly requiresReview?: boolean;
  readonly alternativeCandidates?: number;
  readonly lmsProvider?: string;
  readonly sisProvider?: string;
}

const FUZZY_THRESHOLD = 0.75;

/**
 * For each LMS assignment (Canvas/Google Classroom), find best SIS match (Skyward)
 * in same merged course using multi-signal scoring.
 *
 * Backward compatible: still returns IAssignmentMatch with canvasExternalId/skywardExternalId,
 * but internally delegates to multi-signal matcher for improved accuracy.
 */
export function reconcileAssignments(
  lms: readonly IAssignmentForReconciliation[],
  sis: readonly IAssignmentForReconciliation[]
): readonly IAssignmentMatch[] {
  // Delegate to multi-signal matcher
  const multiSignalMatches = multiSignalMatch(lms, sis);

  // Convert to legacy IAssignmentMatch format
  return multiSignalMatches.map((match) => {
    const sisAssignment = match.sisExternalId
      ? sis.find((s) => s.externalId === match.sisExternalId)
      : null;

    let matchStrategy: MatchStrategy;
    if (!match.sisExternalId) {
      matchStrategy = 'no-match';
    } else if (match.matchPass === 1) {
      matchStrategy = 'exact';
    } else {
      matchStrategy = 'fuzzy';
    }

    const titleSignal = match.signals.find((s) => s.scorer === 'title');

    return {
      canvasExternalId: match.lmsExternalId,
      skywardExternalId: match.sisExternalId,
      matchStrategy,
      confidence: match.confidence,
      similarity: titleSignal?.value,
      skywardStatus: sisAssignment?.status,
      signals: match.signals,
      aggregateScore: match.aggregateScore,
      matchPass: match.matchPass,
      requiresReview: match.requiresReview,
      alternativeCandidates: match.alternativeCandidates,
      lmsProvider: match.lmsProvider,
      sisProvider: match.sisProvider,
    };
  });
}

/**
 * Legacy title-only reconciliation (kept for reference/fallback if needed).
 * Use reconcileAssignments() instead for production.
 */
export function reconcileAssignmentsByTitleOnly(
  canvas: readonly IAssignmentForReconciliation[],
  skyward: readonly IAssignmentForReconciliation[]
): readonly IAssignmentMatch[] {
  return canvas.map((c) => {
    const inSameCourse = skyward.filter((s) => s.mergedCourseId === c.mergedCourseId);
    if (inSameCourse.length === 0) {
      return {
        canvasExternalId: c.externalId,
        skywardExternalId: null,
        matchStrategy: 'no-match' as const,
        confidence: 'low' as const,
      };
    }

    const cNorm = normalizeTitle(c.title);
    let best: {
      s: IAssignmentForReconciliation;
      strategy: MatchStrategy;
      confidence: MatchConfidence;
      similarity?: number;
    } | null = null;

    for (const s of inSameCourse) {
      const sNorm = normalizeTitle(s.title);
      if (cNorm === sNorm) {
        best = { s, strategy: 'exact', confidence: 'high' };
        break;
      }
      const sim = titleSimilarity(c.title, s.title);
      if (sim >= FUZZY_THRESHOLD && (!best || (best.similarity ?? 0) < sim)) {
        best = { s, strategy: 'fuzzy', confidence: 'medium', similarity: sim };
      }
    }

    if (!best) {
      return {
        canvasExternalId: c.externalId,
        skywardExternalId: null,
        matchStrategy: 'no-match' as const,
        confidence: 'low' as const,
      };
    }

    return {
      canvasExternalId: c.externalId,
      skywardExternalId: best.s.externalId,
      matchStrategy: best.strategy,
      confidence: best.confidence,
      similarity: best.similarity,
      skywardStatus: best.s.status,
    };
  });
}

function normalizeTitle(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
