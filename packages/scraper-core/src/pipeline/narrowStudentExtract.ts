import { SyncError, STUDENT_MISMATCH_MESSAGE } from './types';

function normalizeStudentName(name: string): string {
  return name.replace(/\s+/g, ' ').trim().toLowerCase();
}

function isMultiStudentExtract(raw: Record<string, unknown>): raw is Record<string, unknown> & {
  readonly students: readonly { readonly name?: string }[];
} {
  const students = raw['students'];
  return Array.isArray(students) && students.length > 0 && typeof students[0] === 'object';
}

/**
 * Parents often enter a shorter name in the app ("Casey", "Chris") than the
 * portal shows ("Casey Vega"). Match exactly first; otherwise accept the one
 * student whose name has, for every word of the hint, a word starting with it.
 * No match or more than one candidate returns undefined (the caller fails safe).
 */
export function findStudentByHint<T extends { name?: unknown }>(
  students: readonly T[],
  hint: string
): T | undefined {
  const target = normalizeStudentName(hint);
  if (!target) return undefined;
  const nameOf = (s: T): string => (typeof s.name === 'string' ? normalizeStudentName(s.name) : '');
  const exact = students.filter((s) => nameOf(s) === target);
  if (exact.length === 1) return exact[0];
  if (exact.length > 1) return undefined;
  const hintWords = target.split(' ');
  const partial = students.filter((s) => {
    const words = nameOf(s).split(' ').filter(Boolean);
    return hintWords.every((h) => words.some((w) => w.startsWith(h)));
  });
  return partial.length === 1 ? partial[0] : undefined;
}

export function narrowStudentExtractForTransform(
  raw: Record<string, unknown>,
  studentNameHint?: string
): Record<string, unknown> {
  const hint = studentNameHint?.trim();
  if (!hint || !isMultiStudentExtract(raw)) return raw;

  const matched = findStudentByHint(raw.students, hint);
  if (!matched) {
    throw new SyncError(STUDENT_MISMATCH_MESSAGE, 'STUDENT_MISMATCH');
  }
  return { ...raw, students: [matched] };
}
