/**
 * Returns the start date (YYYY-MM-DD) of the current semester for assignment filtering.
 * Uses slc_academic_terms when available; otherwise Jan 1 or Aug 1 heuristic.
 */

import type { Db } from 'mongodb';

export async function getCurrentSemesterStart(
  database: Db,
  userId: string,
  referenceDate: Date = new Date()
): Promise<string> {
  const todayYmd = referenceDate.toISOString().slice(0, 10);
  const terms = await database
    .collection('slc_academic_terms')
    .find({ userId, deletedAt: null })
    .toArray();

  for (const t of terms) {
    const record = t['record'] as Record<string, unknown> | undefined;
    const start = record?.['startDate'] as string | undefined;
    const end = record?.['endDate'] as string | undefined;
    if (start && end && todayYmd >= start && todayYmd <= end) return start;
  }

  const year = referenceDate.getUTCFullYear();
  const month = referenceDate.getUTCMonth() + 1;
  if (month >= 8) return `${year}-08-01`;
  return `${year}-01-01`;
}
