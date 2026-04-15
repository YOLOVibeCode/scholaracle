import { Alert } from '@scholaracle/contracts';
import { ITemplateResult, ITemplateAction } from '../../../StudentNotificationGenerator/templates';

/**
 * Template for generating parent notifications about missing assignments.
 * Includes student name, course, assignment title, and how overdue it is.
 */
export class MissingAssignmentTemplate {
  public generate(alert: Alert): ITemplateResult {
    const rd = alert.relatedData as Record<string, unknown>;

    const studentName = (rd['studentName'] as string) ?? 'Your student';
    const course = (rd['course'] as string) ?? (rd['courseExternalId'] as string) ?? 'a course';
    const assignment = (rd['assignment'] as string) ?? (rd['title'] as string) ?? 'an assignment';
    const daysAgo =
      typeof rd['daysAgo'] === 'number' ? rd['daysAgo'] : this._calcDaysAgo(rd['dueAt'] as string);

    const overduePart = daysAgo > 0 ? ` — ${daysAgo} day${daysAgo === 1 ? '' : 's'} overdue` : '';
    const body = `${studentName} has a missing assignment in ${course}: "${assignment}"${overduePart}.`;
    const subject = `${studentName} — Missing: ${assignment} (${course})`;

    const actions: ITemplateAction[] = [];
    if (rd['assignmentUrl']) {
      actions.push({ label: 'View Assignment', type: 'link', url: rd['assignmentUrl'] as string });
    }

    return { subject, body, actions };
  }

  private _calcDaysAgo(dueAt?: string): number {
    if (!dueAt) return 0;
    return Math.max(0, Math.round((Date.now() - new Date(dueAt).getTime()) / 86_400_000));
  }
}
