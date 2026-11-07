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

export function narrowStudentExtractForTransform(
  raw: Record<string, unknown>,
  studentNameHint?: string
): Record<string, unknown> {
  const hint = studentNameHint?.trim();
  if (!hint || !isMultiStudentExtract(raw)) return raw;

  const target = normalizeStudentName(hint);
  const matched = raw.students.find((s) => {
    const name = typeof s.name === 'string' ? s.name : '';
    return normalizeStudentName(name) === target;
  });
  if (!matched) {
    throw new SyncError(STUDENT_MISMATCH_MESSAGE, 'STUDENT_MISMATCH');
  }
  return { ...raw, students: [matched] };
}
