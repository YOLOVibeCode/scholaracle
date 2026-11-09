import type { Student, UserRepository } from '@scholaracle/database';

/**
 * The user who shared `student` with `userId`: the inviter recorded on their accepted row, or
 * the owner for rows written before `invitedByUserId` existed. Null for the owner and for
 * anyone without an accepted row.
 */
export function inviterIdFor(student: Student, userId: string): string | null {
  if (student.isOwner(userId)) return null;
  const row = student.sharedWith.find((sp) => sp.status === 'accepted' && sp.userId === userId);
  if (!row) return null;
  return row.invitedByUserId ?? student.userId.toString();
}

/** Display names for a set of user ids, one lookup per distinct id; unknown ids are left out. */
export async function inviterNameMap(
  users: UserRepository,
  ids: readonly string[]
): Promise<Map<string, string>> {
  const unique = [...new Set(ids)];
  const found = await Promise.all(unique.map((id) => users.findById(id).catch(() => null)));
  return new Map(found.flatMap((u) => (u?._id ? [[u._id.toString(), u.name] as const] : [])));
}
