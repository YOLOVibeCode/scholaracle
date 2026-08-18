/**
 * Deterministic join-gap enrichment + fail-open sanitizer.
 *
 * Transformers remain the source of truth. This layer may only fill *empty*
 * allowlisted FK/display fields using ids that already exist in the op set.
 * It never invents entities, never rewrites native ids, never drops ops.
 */

import type { ISlcDeltaOp } from '@scholaracle/contracts';
import type { IAIEnricher } from './types';

export const DEFAULT_ENRICHER_TIMEOUT_MS = 8000;

const ALLOWED_RECORD_FIELDS = ['courseExternalId', 'assignmentExternalId', 'courseName'] as const;
type AllowedRecordField = (typeof ALLOWED_RECORD_FIELDS)[number];

export interface IApplyEnrichersResult {
  readonly ops: ISlcDeltaOp[];
  readonly patchCount: number;
  readonly failed: boolean;
}

export interface IApplyEnrichersParams {
  readonly enrichers: readonly IAIEnricher[];
  readonly rawExtract: Record<string, unknown>;
  readonly ops: ISlcDeltaOp[];
  readonly timeoutMs?: number;
  readonly onWarning?: (message: string) => void;
}

function isEmpty(value: unknown): boolean {
  return (
    value === undefined || value === null || (typeof value === 'string' && value.trim() === '')
  );
}

function asNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeName(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function recordOf(op: ISlcDeltaOp): Record<string, unknown> {
  return op.record ?? {};
}

function uniqueMap(pairs: ReadonlyArray<readonly [string, string]>): Map<string, string> {
  const buckets = new Map<string, string[]>();
  for (const [key, value] of pairs) {
    if (!key) continue;
    const list = buckets.get(key) ?? [];
    if (!list.includes(value)) list.push(value);
    buckets.set(key, list);
  }
  const unique = new Map<string, string>();
  for (const [key, values] of buckets) {
    if (values.length === 1 && values[0]) unique.set(key, values[0]);
  }
  return unique;
}

function courseIdsIn(ops: readonly ISlcDeltaOp[]): Set<string> {
  const ids = new Set<string>();
  for (const item of ops) {
    if (item.op === 'upsert' && item.entity === 'course') ids.add(item.key.externalId);
  }
  return ids;
}

function assignmentIdsIn(ops: readonly ISlcDeltaOp[]): Set<string> {
  const ids = new Set<string>();
  for (const item of ops) {
    if (item.op === 'upsert' && item.entity === 'assignment') ids.add(item.key.externalId);
  }
  return ids;
}

function identityKey(op: ISlcDeltaOp): string {
  return `${op.op}|${op.entity}|${op.key.provider}|${op.key.adapterId}|${op.key.externalId}`;
}

/**
 * Defense in depth: take a candidate op list and keep only allowlisted fills
 * of previously empty fields, and only when FKs point at ids in `original`.
 */
export function sanitizeEnrichedOps(
  original: readonly ISlcDeltaOp[],
  candidate: readonly ISlcDeltaOp[],
  onWarning?: (message: string) => void
): ISlcDeltaOp[] {
  if (candidate.length !== original.length) {
    onWarning?.(`enricher changed op count (${original.length} → ${candidate.length}); discarded`);
    return original as ISlcDeltaOp[];
  }

  const courses = courseIdsIn(original);
  const assignments = assignmentIdsIn(original);
  const next: ISlcDeltaOp[] = [];

  for (let i = 0; i < original.length; i++) {
    const before = original[i]!;
    const after = candidate[i]!;
    if (identityKey(before) !== identityKey(after)) {
      next.push(before);
      continue;
    }

    const beforeRec = recordOf(before);
    const afterRec = recordOf(after);
    const patched: Record<string, unknown> = { ...beforeRec };
    let changed = false;

    for (const field of ALLOWED_RECORD_FIELDS) {
      if (!isEmpty(beforeRec[field])) continue;
      const proposed = asNonEmptyString(afterRec[field]);
      if (!proposed) continue;
      if (field === 'courseExternalId' && courses.size > 0 && !courses.has(proposed)) continue;
      if (field === 'assignmentExternalId' && assignments.size > 0 && !assignments.has(proposed)) {
        continue;
      }
      patched[field] = proposed;
      changed = true;
    }

    let nextKey = before.key;
    if (isEmpty(before.key.courseExternalId)) {
      const proposedKey =
        asNonEmptyString(after.key.courseExternalId) ??
        asNonEmptyString(patched['courseExternalId']);
      if (proposedKey && (courses.size === 0 || courses.has(proposedKey))) {
        nextKey = { ...before.key, courseExternalId: proposedKey };
        if (isEmpty(patched['courseExternalId'])) {
          patched['courseExternalId'] = proposedKey;
        }
        changed = true;
      }
    }

    if (!changed) {
      next.push(before);
      continue;
    }
    next.push({ ...before, key: nextKey, record: patched });
  }

  return next;
}

function countPatches(original: readonly ISlcDeltaOp[], next: readonly ISlcDeltaOp[]): number {
  let count = 0;
  for (let i = 0; i < original.length; i++) {
    const before = original[i];
    const after = next[i];
    if (!before || !after) continue;
    const beforeRec = recordOf(before);
    const afterRec = recordOf(after);
    for (const field of ALLOWED_RECORD_FIELDS) {
      if (asNonEmptyString(beforeRec[field]) !== asNonEmptyString(afterRec[field])) count += 1;
    }
    if (before.key.courseExternalId !== after.key.courseExternalId) count += 1;
  }
  return count;
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`enricher timed out after ${timeoutMs}ms`)),
          timeoutMs
        );
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

export async function applyEnrichersFailOpen(
  params: IApplyEnrichersParams
): Promise<IApplyEnrichersResult> {
  const timeoutMs = params.timeoutMs ?? DEFAULT_ENRICHER_TIMEOUT_MS;
  let ops = params.ops;
  let failed = false;

  for (const enricher of params.enrichers) {
    try {
      const candidate = await withTimeout(enricher.enrich(params.rawExtract, ops), timeoutMs);
      if (!Array.isArray(candidate)) {
        failed = true;
        params.onWarning?.('enricher returned a non-array; discarded');
        continue;
      }
      ops = sanitizeEnrichedOps(ops, candidate, params.onWarning);
    } catch (err: unknown) {
      failed = true;
      const message = err instanceof Error ? err.message : String(err);
      params.onWarning?.(message);
    }
  }

  return { ops, patchCount: countPatches(params.ops, ops), failed };
}

interface ICourseIndexEntry {
  readonly externalId: string;
  readonly title: string;
  readonly period: string;
}

interface IAssignmentIndexEntry {
  readonly externalId: string;
  readonly title: string;
  readonly courseExternalId?: string;
}

function patchOp(
  item: ISlcDeltaOp,
  recordPatch: Partial<Record<AllowedRecordField, string>>
): ISlcDeltaOp {
  const rec = { ...recordOf(item) };
  for (const [field, value] of Object.entries(recordPatch) as Array<[AllowedRecordField, string]>) {
    if (!isEmpty(rec[field])) continue;
    rec[field] = value;
  }
  const courseId = asNonEmptyString(rec['courseExternalId']);
  const nextKey =
    isEmpty(item.key.courseExternalId) && courseId
      ? { ...item.key, courseExternalId: courseId }
      : item.key;
  return { ...item, key: nextKey, record: rec };
}

function matchAssignmentId(
  haystack: string,
  assignments: readonly IAssignmentIndexEntry[],
  preferCourseId?: string
): string | undefined {
  const hay = normalizeName(haystack);
  if (hay.length < 4) return undefined;

  const collect = (pool: readonly IAssignmentIndexEntry[]): string[] => {
    const hits: string[] = [];
    for (const assignment of pool) {
      const title = normalizeName(assignment.title);
      if (title.length < 4) continue;
      if (hay === title || hay.includes(title)) hits.push(assignment.externalId);
    }
    return [...new Set(hits)];
  };

  if (preferCourseId) {
    const scoped = collect(assignments.filter((a) => a.courseExternalId === preferCourseId));
    if (scoped.length === 1) return scoped[0];
  }
  const global = collect(assignments);
  return global.length === 1 ? global[0] : undefined;
}

/**
 * Deterministic, no-LLM enricher. Safe to run on every client by default.
 */
export class JoinGapEnricher implements IAIEnricher {
  async enrich(_rawExtract: Record<string, unknown>, ops: ISlcDeltaOp[]): Promise<ISlcDeltaOp[]> {
    const courses: ICourseIndexEntry[] = [];
    const assignments: IAssignmentIndexEntry[] = [];

    for (const item of ops) {
      if (item.op !== 'upsert') continue;
      const rec = recordOf(item);
      if (item.entity === 'course') {
        courses.push({
          externalId: item.key.externalId,
          title: asNonEmptyString(rec['title']) ?? '',
          period: asNonEmptyString(rec['period']) ?? '',
        });
      }
      if (item.entity === 'assignment') {
        assignments.push({
          externalId: item.key.externalId,
          title: asNonEmptyString(rec['title']) ?? '',
          courseExternalId:
            asNonEmptyString(item.key.courseExternalId) ??
            asNonEmptyString(rec['courseExternalId']),
        });
      }
    }

    const byPeriod = uniqueMap(courses.map((c) => [c.period, c.externalId] as const));
    const byTitle = uniqueMap(
      courses
        .filter((c) => normalizeName(c.title).length >= 4)
        .map((c) => [normalizeName(c.title), c.externalId] as const)
    );
    const titleById = new Map(courses.map((c) => [c.externalId, c.title] as const));

    const resolveCourseId = (period?: string, courseName?: string): string | undefined => {
      if (period) {
        const byP = byPeriod.get(period);
        if (byP) return byP;
      }
      if (courseName) {
        const normalized = normalizeName(courseName);
        if (normalized.length >= 4) return byTitle.get(normalized);
      }
      return undefined;
    };

    return ops.map((item) => {
      if (item.op !== 'upsert') return item;
      const rec = recordOf(item);

      if (item.entity === 'attendanceEvent') {
        const period = asNonEmptyString(rec['periodName']) ?? asNonEmptyString(rec['period']);
        const courseName = asNonEmptyString(rec['courseName']);
        const courseId = resolveCourseId(period, courseName);
        if (!courseId) return item;
        const patch: Partial<Record<AllowedRecordField, string>> = { courseExternalId: courseId };
        const title = titleById.get(courseId);
        if (title && isEmpty(rec['courseName'])) patch.courseName = title;
        return patchOp(item, patch);
      }

      if (item.entity === 'assignment' || item.entity === 'gradeSnapshot') {
        const courseName = asNonEmptyString(rec['courseName']);
        const courseId = resolveCourseId(undefined, courseName);
        if (!courseId) return item;
        return patchOp(item, { courseExternalId: courseId });
      }

      if (item.entity === 'message') {
        const haystack = `${asNonEmptyString(rec['subject']) ?? ''} ${asNonEmptyString(rec['body']) ?? ''}`;
        const assignmentId = matchAssignmentId(haystack, assignments);
        if (!assignmentId) return item;
        return patchOp(item, { assignmentExternalId: assignmentId });
      }

      if (item.entity === 'courseMaterial') {
        const haystack = asNonEmptyString(rec['title']) ?? asNonEmptyString(rec['fileName']) ?? '';
        const preferCourse =
          asNonEmptyString(item.key.courseExternalId) ?? asNonEmptyString(rec['courseExternalId']);
        const assignmentId = matchAssignmentId(haystack, assignments, preferCourse);
        if (!assignmentId) return item;
        return patchOp(item, { assignmentExternalId: assignmentId });
      }

      return item;
    });
  }
}
