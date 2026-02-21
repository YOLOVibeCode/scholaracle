import type { Db } from 'mongodb';

const TERMS_COLLECTION = 'slc_academic_terms';

/**
 * Resolve a term and all its descendants (e.g. semester → its grading periods).
 * Uses parentTermExternalId from slc_academic_terms so we understand year → semesters → grading periods.
 */
export async function resolveTermIdsIncludingDescendants(
  database: Db,
  userId: string,
  provider: string,
  adapterId: string,
  rootTermExternalId: string
): Promise<string[]> {
  const cursor = database.collection(TERMS_COLLECTION).find({
    userId,
    provider,
    adapterId,
    deletedAt: null,
  });
  const docs = await cursor.toArray();
  const byExternalId = new Map<string, string | undefined>();
  for (const d of docs) {
    const doc = d as unknown as { externalId: string; record?: { parentTermExternalId?: string } };
    const eid = doc.externalId;
    const parent = doc.record?.parentTermExternalId;
    byExternalId.set(eid, parent);
  }
  const result = new Set<string>([rootTermExternalId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const [eid, parent] of byExternalId) {
      if (parent != null && result.has(parent) && !result.has(eid)) {
        result.add(eid);
        changed = true;
      }
    }
  }
  return [...result];
}
