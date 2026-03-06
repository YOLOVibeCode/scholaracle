/**
 * Signal scorers for multi-signal assignment reconciliation.
 * Each scorer evaluates one dimension of assignment similarity.
 */

import type { IAssignmentForReconciliation } from './assignment-reconciler';
import { titleSimilarity } from './course-reconciler';

// ---------------------------------------------------------------------------
// Core interfaces
// ---------------------------------------------------------------------------

export interface IMatchSignal {
  readonly scorer: string;
  readonly value: number; // 0-1
  readonly strength: 'strong' | 'medium' | 'weak' | 'none';
  readonly detail?: string;
}

export interface ISignalScorer {
  readonly name: string;
  readonly weight: number;
  score(lms: IAssignmentForReconciliation, sis: IAssignmentForReconciliation): IMatchSignal;
}

// ---------------------------------------------------------------------------
// Helper functions
// ---------------------------------------------------------------------------

function classifyStrength(value: number): 'strong' | 'medium' | 'weak' | 'none' {
  if (value >= 0.85) return 'strong';
  if (value >= 0.6) return 'medium';
  if (value >= 0.4) return 'weak';
  return 'none';
}

function extractSequenceNumber(title: string): number | null {
  // Extract trailing number or decimal (e.g., "Quiz 3" -> 3, "HW 5.2" -> 5.2)
  const match = title.match(/(\d+(?:\.\d+)?)\D*$/);
  return match ? parseFloat(match[1]!) : null;
}

function normalizeCategory(category: string): string {
  return category.toLowerCase().trim();
}

// ---------------------------------------------------------------------------
// TitleScorer - Jaccard similarity of word tokens
// ---------------------------------------------------------------------------

export class TitleScorer implements ISignalScorer {
  readonly name = 'title';
  readonly weight = 0.35;

  score(lms: IAssignmentForReconciliation, sis: IAssignmentForReconciliation): IMatchSignal {
    const similarity = titleSimilarity(lms.title, sis.title);
    return {
      scorer: this.name,
      value: similarity,
      strength: classifyStrength(similarity),
      detail: `Title similarity: ${(similarity * 100).toFixed(1)}%`,
    };
  }
}

// ---------------------------------------------------------------------------
// PointsScorer - Compare pointsPossible values
// ---------------------------------------------------------------------------

export class PointsScorer implements ISignalScorer {
  readonly name = 'points';
  readonly weight = 0.25;

  score(lms: IAssignmentForReconciliation, sis: IAssignmentForReconciliation): IMatchSignal {
    const lmsPoints = lms.pointsPossible;
    const sisPoints = sis.pointsPossible;

    // Both missing or both zero
    if (lmsPoints == null || sisPoints == null) {
      return {
        scorer: this.name,
        value: 0,
        strength: 'none',
        detail: 'Points data missing',
      };
    }

    // Handle 0/0 edge case
    if (lmsPoints === 0 && sisPoints === 0) {
      return {
        scorer: this.name,
        value: 1.0,
        strength: 'strong',
        detail: 'Both zero points',
      };
    }

    // Exact match
    if (lmsPoints === sisPoints) {
      return {
        scorer: this.name,
        value: 1.0,
        strength: 'strong',
        detail: `Exact match: ${lmsPoints} points`,
      };
    }

    // Calculate percentage difference
    const maxPoints = Math.max(lmsPoints, sisPoints);
    const diff = Math.abs(lmsPoints - sisPoints);
    const pctDiff = (diff / maxPoints) * 100;

    let value: number;
    if (pctDiff <= 5) {
      value = 0.8; // Within 5%
    } else if (pctDiff <= 20) {
      value = 0.5; // Within 20%
    } else {
      value = 0; // More than 20% difference
    }

    return {
      scorer: this.name,
      value,
      strength: value >= 0.8 ? 'strong' : value >= 0.5 ? 'medium' : 'none',
      detail: `${lmsPoints} vs ${sisPoints} (${pctDiff.toFixed(1)}% diff)`,
    };
  }
}

// ---------------------------------------------------------------------------
// DateScorer - Compare due dates
// ---------------------------------------------------------------------------

export class DateScorer implements ISignalScorer {
  readonly name = 'date';
  readonly weight = 0.2;

  score(lms: IAssignmentForReconciliation, sis: IAssignmentForReconciliation): IMatchSignal {
    const lmsDate = lms.dueAt;
    const sisDate = sis.dueAt;

    if (!lmsDate || !sisDate) {
      return {
        scorer: this.name,
        value: 0,
        strength: 'none',
        detail: 'Date data missing',
      };
    }

    const lmsTime = new Date(lmsDate).getTime();
    const sisTime = new Date(sisDate).getTime();
    const daysDiff = Math.abs(lmsTime - sisTime) / (24 * 60 * 60 * 1000);

    let value: number;
    let strength: 'strong' | 'medium' | 'weak' | 'none';

    if (daysDiff < 1) {
      // Same calendar day
      value = 1.0;
      strength = 'strong';
    } else if (daysDiff < 2) {
      // Within 1-2 days
      value = 0.9;
      strength = 'strong';
    } else if (daysDiff <= 3) {
      value = 0.7;
      strength = 'medium';
    } else if (daysDiff <= 7) {
      value = 0.4;
      strength = 'weak';
    } else {
      value = 0;
      strength = 'none';
    }

    return {
      scorer: this.name,
      value,
      strength,
      detail: `${daysDiff.toFixed(1)} days apart`,
    };
  }
}

// ---------------------------------------------------------------------------
// CategoryScorer - Category compatibility check
// ---------------------------------------------------------------------------

const CATEGORY_EQUIVALENTS: ReadonlyArray<readonly string[]> = [
  ['quiz', 'quizzes'],
  ['test', 'exam', 'assessment', 'exams', 'tests'],
  ['homework', 'hw', 'daily', 'daily work', 'dailywork'],
  ['project', 'projects'],
  ['classwork', 'class work'],
  ['lab', 'labs', 'laboratory'],
];

export class CategoryScorer implements ISignalScorer {
  readonly name = 'category';
  readonly weight = 0.1;

  score(lms: IAssignmentForReconciliation, sis: IAssignmentForReconciliation): IMatchSignal {
    const lmsCat = lms.category;
    const sisCat = sis.category;

    // Both missing - neutral
    if (!lmsCat && !sisCat) {
      return {
        scorer: this.name,
        value: 0.5,
        strength: 'medium',
        detail: 'Categories unknown',
      };
    }

    // One missing - neutral
    if (!lmsCat || !sisCat) {
      return {
        scorer: this.name,
        value: 0.5,
        strength: 'medium',
        detail: 'One category missing',
      };
    }

    const lmsNorm = normalizeCategory(lmsCat);
    const sisNorm = normalizeCategory(sisCat);

    // Exact match
    if (lmsNorm === sisNorm) {
      return {
        scorer: this.name,
        value: 1.0,
        strength: 'strong',
        detail: `Category match: ${lmsCat}`,
      };
    }

    // Check equivalents
    for (const group of CATEGORY_EQUIVALENTS) {
      if (group.includes(lmsNorm) && group.includes(sisNorm)) {
        return {
          scorer: this.name,
          value: 1.0,
          strength: 'strong',
          detail: `Equivalent: ${lmsCat} / ${sisCat}`,
        };
      }
    }

    // Incompatible
    return {
      scorer: this.name,
      value: 0.2,
      strength: 'none',
      detail: `Mismatch: ${lmsCat} vs ${sisCat}`,
    };
  }
}

// ---------------------------------------------------------------------------
// SequenceScorer - Sequence number extraction and comparison
// ---------------------------------------------------------------------------

export class SequenceScorer implements ISignalScorer {
  readonly name = 'sequence';
  readonly weight = 0.1;

  score(lms: IAssignmentForReconciliation, sis: IAssignmentForReconciliation): IMatchSignal {
    const lmsSeq = extractSequenceNumber(lms.title);
    const sisSeq = extractSequenceNumber(sis.title);

    if (lmsSeq === null || sisSeq === null) {
      return {
        scorer: this.name,
        value: 0,
        strength: 'none',
        detail: 'No sequence number found',
      };
    }

    // Exact match
    if (lmsSeq === sisSeq) {
      return {
        scorer: this.name,
        value: 1.0,
        strength: 'strong',
        detail: `Sequence match: ${lmsSeq}`,
      };
    }

    // Adjacent (off by 1)
    if (Math.abs(lmsSeq - sisSeq) === 1) {
      return {
        scorer: this.name,
        value: 0.5,
        strength: 'medium',
        detail: `Adjacent: ${lmsSeq} vs ${sisSeq}`,
      };
    }

    // Not close
    return {
      scorer: this.name,
      value: 0,
      strength: 'none',
      detail: `Different: ${lmsSeq} vs ${sisSeq}`,
    };
  }
}
