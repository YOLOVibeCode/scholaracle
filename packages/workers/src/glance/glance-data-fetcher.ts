import type { Db } from 'mongodb';
import type { IGradeBlock } from '@scholaracle/agents';
import { fetchGradeBlocksForUser } from '../shared/grade-block-fetcher';

export interface IMissingAssignment {
  readonly title: string;
  readonly courseName: string;
  readonly dueAt: Date;
  readonly courseExternalId: string;
  readonly assignmentExternalId: string;
}

export interface IUpcomingDeadline {
  readonly title: string;
  readonly courseName: string;
  readonly dueAt: Date;
}

export interface IGlanceStudentData {
  readonly studentId: string;
  readonly studentName: string;
  readonly grades: IGradeBlock[];
  readonly missingAssignments: IMissingAssignment[];
  readonly upcomingDeadlines: IUpcomingDeadline[];
}

export async function fetchGlanceData(
  database: Db,
  userId: string,
  studentId: string,
  studentName: string,
  dashboardBaseUrl: string
): Promise<IGlanceStudentData> {
  const grades = await fetchGradeBlocksForUser(database, userId, dashboardBaseUrl);

  const courseNameByExtId = new Map<string, string>();
  try {
    const courses = await database
      .collection('slc_courses')
      .find({ userId, deletedAt: null })
      .toArray();
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
  } catch {
    // continue without course names
  }

  const now = new Date();
  const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  let missingAssignments: IMissingAssignment[] = [];
  let upcomingDeadlines: IUpcomingDeadline[] = [];

  try {
    const assignments = await database
      .collection('slc_assignments')
      .find({ userId, deletedAt: null })
      .toArray();

    for (const a of assignments) {
      const doc = a as {
        courseExternalId?: string;
        externalId?: string;
        record?: {
          title?: string;
          dueAt?: string | Date;
          status?: string;
          pointsEarned?: number | null;
        };
      };
      const title = doc.record?.title;
      const dueAtRaw = doc.record?.dueAt;
      const status = doc.record?.status;
      const courseExtId = doc.courseExternalId ?? '';
      const assignmentExtId = doc.externalId ?? '';
      if (!title) continue;

      const dueAt = dueAtRaw ? new Date(dueAtRaw) : null;
      const courseName = courseNameByExtId.get(courseExtId) ?? courseExtId;

      const isMissing =
        status === 'missing' ||
        (dueAt &&
          dueAt < now &&
          status !== 'submitted' &&
          status !== 'graded' &&
          status !== 'excused');

      if (isMissing && dueAt) {
        missingAssignments.push({
          title,
          courseName,
          dueAt,
          courseExternalId: courseExtId,
          assignmentExternalId: assignmentExtId,
        });
      }

      if (
        dueAt &&
        dueAt > now &&
        dueAt <= sevenDaysFromNow &&
        status !== 'submitted' &&
        status !== 'graded' &&
        status !== 'excused'
      ) {
        upcomingDeadlines.push({ title, courseName, dueAt });
      }
    }
  } catch {
    // continue with empty lists
  }

  missingAssignments.sort((a, b) => b.dueAt.getTime() - a.dueAt.getTime());
  upcomingDeadlines.sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime());

  missingAssignments = missingAssignments.slice(0, 15);
  upcomingDeadlines = upcomingDeadlines.slice(0, 10);

  return { studentId, studentName, grades, missingAssignments, upcomingDeadlines };
}
