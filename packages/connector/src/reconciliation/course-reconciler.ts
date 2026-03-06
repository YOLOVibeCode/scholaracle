import { createHash } from 'crypto';
import { reconcileCourse, type IReconciledCourse } from './subject-reconciler';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface ISourceCourse {
  readonly externalId: string;
  readonly sourceId: string;
  readonly provider: string;
  readonly title: string;
  readonly teacherName?: string;
  readonly period?: string;
  readonly courseCode?: string;
  readonly grade?: number;
  readonly letterGrade?: string;
}

export interface IMergedCourse {
  readonly mergedId: string;
  readonly normalizedTitle: string;
  readonly subject: IReconciledCourse['subject'];
  readonly isAP: boolean;
  readonly isHonors: boolean;
  readonly sources: readonly ISourceCourse[];
  readonly bestGrade?: number;
  readonly bestLetterGrade?: string;
  readonly teacherName?: string;
  readonly period?: string;
  /** Which source is considered authoritative for grades. */
  readonly primarySourceId: string;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

interface IAnnotatedCourse {
  readonly source: ISourceCourse;
  readonly reconciled: IReconciledCourse;
  readonly matchKey: string;
}

function buildMatchKey(reconciled: IReconciledCourse): string {
  const cleanTitle = reconciled.normalizedTitle
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return `${cleanTitle}|${reconciled.subject.area}|${reconciled.subject.subArea ?? ''}`;
}

function hashKey(input: string): string {
  return createHash('sha256').update(input).digest('hex').slice(0, 12);
}

function effectivePeriod(a: IAnnotatedCourse): string | undefined {
  if (a.reconciled.period != null) return a.reconciled.period.toString();
  return a.source.period;
}

function effectiveTeacher(a: IAnnotatedCourse): string | undefined {
  return a.reconciled.teacherName ?? a.source.teacherName;
}

function firstDefined<T>(
  items: readonly IAnnotatedCourse[],
  fn: (a: IAnnotatedCourse) => T | undefined
): T | undefined {
  for (const item of items) {
    const v = fn(item);
    if (v != null) return v;
  }
  return undefined;
}

/**
 * Two courses within the same match-key group should be split into separate
 * merged groups only when both period AND teacher name are present and differ.
 */
function shouldSplit(a: IAnnotatedCourse, b: IAnnotatedCourse): boolean {
  const pA = effectivePeriod(a);
  const pB = effectivePeriod(b);
  const tA = effectiveTeacher(a);
  const tB = effectiveTeacher(b);

  const periodsDiffer = pA != null && pB != null && pA !== pB;
  const teachersDiffer = tA != null && tB != null && tA.toLowerCase() !== tB.toLowerCase();

  return periodsDiffer && teachersDiffer;
}

/**
 * Partition a match-key group into sub-groups where no two members conflict
 * (i.e. have both different period AND different teacher).
 */
function splitConflicting(group: readonly IAnnotatedCourse[]): IAnnotatedCourse[][] {
  const subGroups: IAnnotatedCourse[][] = [];

  for (const course of group) {
    let placed = false;
    for (const sub of subGroups) {
      if (!sub.some((member) => shouldSplit(course, member))) {
        sub.push(course);
        placed = true;
        break;
      }
    }
    if (!placed) {
      subGroups.push([course]);
    }
  }

  return subGroups;
}

function buildMergedId(
  matchKey: string,
  subGroup: readonly IAnnotatedCourse[],
  wasSplit: boolean
): string {
  if (!wasSplit) return hashKey(matchKey);

  const teacher = firstDefined(subGroup, effectiveTeacher)?.toLowerCase() ?? '';
  const period = firstDefined(subGroup, effectivePeriod) ?? '';
  return hashKey(`${matchKey}|${teacher}|${period}`);
}

/**
 * Source hierarchy for grade precedence (authoritative → least):
 * 1. SIS systems (Skyward, Aeries) - Official grades of record
 * 2. LMS systems (Canvas, Google Classroom) - Working/projected grades
 */
const SOURCE_PRIORITY: Record<string, number> = {
  skyward: 10, // SIS - highest priority
  aeries: 10, // SIS - highest priority
  canvas: 5, // LMS - lower priority
  google_classroom: 5, // LMS - lower priority
  oneroster: 5, // Generic LMS - lower priority
};

function getSourcePriority(provider: string): number {
  return SOURCE_PRIORITY[provider] ?? 1;
}

function buildMergedCourse(
  subGroup: readonly IAnnotatedCourse[],
  matchKey: string,
  wasSplit: boolean
): IMergedCourse {
  const first = subGroup[0]!;
  const sources = subGroup.map((a) => a.source);

  // Find primary source: SIS (Skyward/Aeries) takes precedence over LMS
  // Within same priority tier, prefer sources with grades
  const primarySource =
    subGroup
      .filter((a) => a.source.grade != null)
      .sort((a, b) => {
        const priorityDiff =
          getSourcePriority(b.source.provider) - getSourcePriority(a.source.provider);
        if (priorityDiff !== 0) return priorityDiff;
        // Within same priority, prefer higher grade as tiebreaker
        return (b.source.grade ?? 0) - (a.source.grade ?? 0);
      })[0] ?? first;

  // Use primary source's grade as the authoritative grade
  const bestGrade = primarySource.source.grade;
  let bestLetterGrade = primarySource.source.letterGrade;

  // Fallback to any letter grade if primary doesn't have one
  if (bestLetterGrade == null) {
    bestLetterGrade = firstDefined(subGroup, (a) =>
      a.source.letterGrade != null ? a.source.letterGrade : undefined
    );
  }

  return {
    mergedId: buildMergedId(matchKey, subGroup, wasSplit),
    normalizedTitle: first.reconciled.normalizedTitle,
    subject: first.reconciled.subject,
    isAP: first.reconciled.isAP,
    isHonors: first.reconciled.isHonors,
    sources,
    bestGrade,
    bestLetterGrade,
    teacherName: firstDefined(subGroup, effectiveTeacher),
    period: firstDefined(subGroup, effectivePeriod),
    primarySourceId: primarySource.source.sourceId,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Merge courses from multiple sources into unified groups.
 *
 * Algorithm:
 * 1. Reconcile each title via `reconcileCourse()`.
 * 2. Group by match key: `normalizedTitle | subject.area | subject.subArea`.
 * 3. Within each group, split when both period and teacher differ
 *    (indicates genuinely different courses that happened to normalize the same).
 * 4. Build an {@link IMergedCourse} per resulting sub-group.
 */
export function mergeCourses(courses: readonly ISourceCourse[]): readonly IMergedCourse[] {
  if (courses.length === 0) return [];

  const annotated: IAnnotatedCourse[] = courses.map((source) => {
    const reconciled = reconcileCourse(source.title, source.teacherName);
    return { source, reconciled, matchKey: buildMatchKey(reconciled) };
  });

  const groups = new Map<string, IAnnotatedCourse[]>();
  for (const a of annotated) {
    const list = groups.get(a.matchKey) ?? [];
    list.push(a);
    groups.set(a.matchKey, list);
  }

  const result: IMergedCourse[] = [];
  for (const [matchKey, group] of groups) {
    const subGroups = splitConflicting(group);
    const wasSplit = subGroups.length > 1;
    for (const sub of subGroups) {
      result.push(buildMergedCourse(sub, matchKey, wasSplit));
    }
  }

  return result;
}

/**
 * Jaccard similarity over word tokens of two course titles (0–1).
 * Useful for fuzzy matching when exact normalization doesn't align.
 */
export function titleSimilarity(a: string, b: string): number {
  const tokenize = (s: string): Set<string> =>
    new Set(
      s
        .toLowerCase()
        .replace(/[^\w\s]/g, '')
        .split(/\s+/)
        .filter(Boolean)
    );

  const setA = tokenize(a);
  const setB = tokenize(b);

  if (setA.size === 0 && setB.size === 0) return 1;
  if (setA.size === 0 || setB.size === 0) return 0;

  let intersection = 0;
  for (const t of setA) {
    if (setB.has(t)) intersection++;
  }

  const union = new Set([...setA, ...setB]).size;
  return intersection / union;
}
