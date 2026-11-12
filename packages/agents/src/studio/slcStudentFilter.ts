import type { Student } from '@scholaracle/database';

/**
 * The owner-scoped `slc_assignments` filter for one student: tenant key plus
 * whichever of the Mongo id / portal id the documents carry. Shared by the
 * API studio routes and the weekly-review worker so both read the same rows.
 */
export function slcStudentFilter(student: Student): Record<string, unknown> {
  const ownerUserId = student.dataUserId();
  const studentDbId = student._id?.toString() ?? '';
  const studentExternalId = student.studentId ?? '';
  const or: Record<string, unknown>[] = [];
  if (studentDbId !== '') or.push({ studentId: studentDbId });
  if (studentExternalId !== '') or.push({ studentExternalId });
  return {
    userId: ownerUserId,
    deletedAt: null,
    ...(or.length > 0 ? { $or: or } : {}),
  };
}
