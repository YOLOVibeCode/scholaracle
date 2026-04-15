import type { Db } from 'mongodb';
import type { IGradeBlock } from '@scholaracle/agents';

export function percentToLetter(percent: number): string {
  if (percent < 70) return 'F';
  if (percent < 80) return 'D';
  if (percent < 85) return 'C';
  if (percent < 93) return 'B';
  return 'A';
}

const SIS_PROVIDERS = new Set(['skyward', 'aeries', 'sis']);

export async function fetchGradeBlocksForUser(
  database: Db,
  userId: string,
  dashboardBaseUrl: string
): Promise<IGradeBlock[]> {
  if (typeof database?.collection !== 'function') return [];
  try {
    const snapshots = await database
      .collection('slc_grade_snapshots')
      .find({ userId, deletedAt: null })
      .toArray();
    if (snapshots.length === 0) return [];

    const courses = await database
      .collection('slc_courses')
      .find({ userId, deletedAt: null })
      .toArray();
    const courseNameByExtId = new Map<string, string>();
    for (const c of courses) {
      const rec = c as {
        externalId?: string;
        courseExternalId?: string;
        record?: { title?: string };
      };
      const extId = rec.externalId ?? rec.courseExternalId;
      const title = rec.record?.title;
      if (extId && title) courseNameByExtId.set(extId, title);
    }

    let studentId: string | null = null;
    const student = await database.collection('students').findOne({ userId });
    if (student && (student as { _id?: unknown })._id) {
      studentId = String((student as { _id: unknown })._id);
    }

    const baseUrl = dashboardBaseUrl.replace(/\/$/, '');

    const bestByTitle = new Map<
      string,
      { percent: number; courseName: string; isSis: boolean; courseExternalId: string }
    >();
    for (const s of snapshots) {
      const doc = s as {
        courseExternalId?: string;
        provider?: string;
        record?: { percentGrade?: number; sourceType?: string };
      };
      const courseExternalId = doc.courseExternalId;
      const percent = doc.record?.percentGrade;
      if (courseExternalId == null || percent == null) continue;

      const rawName = courseNameByExtId.get(courseExternalId) ?? courseExternalId;
      const normalizedKey = rawName
        .replace(/[^a-zA-Z0-9\s]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
      const sourceType = (doc.record?.sourceType as string) ?? doc.provider ?? '';
      const isSis = SIS_PROVIDERS.has(sourceType);
      const existing = bestByTitle.get(normalizedKey);

      if (!existing || (isSis && !existing.isSis)) {
        bestByTitle.set(normalizedKey, { percent, courseName: rawName, isSis, courseExternalId });
      }
    }

    const blocks: IGradeBlock[] = [];
    for (const [, { percent, courseName, courseExternalId }] of bestByTitle) {
      const courseUrl =
        baseUrl && studentId
          ? `${baseUrl}/dashboard/students/${studentId}/grades?course=${encodeURIComponent(courseExternalId)}`
          : baseUrl
            ? `${baseUrl}/dashboard`
            : '';
      blocks.push({
        courseName,
        percentGrade: percent,
        letterGrade: percentToLetter(percent),
        courseUrl,
      });
    }

    blocks.sort((a, b) => a.percentGrade - b.percentGrade);
    return blocks;
  } catch {
    return [];
  }
}
