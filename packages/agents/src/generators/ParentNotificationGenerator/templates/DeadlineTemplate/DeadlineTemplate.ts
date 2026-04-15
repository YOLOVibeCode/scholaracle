import { Alert } from '@scholaracle/contracts';
import { ITemplateResult, ITemplateAction } from '../../../StudentNotificationGenerator/templates';

/**
 * Template for generating parent notifications about upcoming assignment deadlines.
 * Includes student name, course, assignment title, and due date.
 */
export class DeadlineTemplate {
  public generate(alert: Alert): ITemplateResult {
    const rd = alert.relatedData as Record<string, unknown>;

    const studentName = (rd['studentName'] as string) ?? 'Your student';
    const course = (rd['course'] as string) ?? (rd['courseExternalId'] as string) ?? 'a course';
    const assignment = (rd['assignment'] as string) ?? (rd['title'] as string) ?? 'an assignment';
    const dueAt = (rd['dueDate'] as string) ?? (rd['dueAt'] as string);
    const formattedDate = (rd['formattedDueDate'] as string) ?? this._formatDate(dueAt);

    const body = `${studentName} has an assignment due in ${course}: "${assignment}" (${formattedDate}).`;
    const subject = `${studentName} — Due ${formattedDate}: ${assignment}`;
    const actions = this._buildActions(rd['assignmentUrl'] as string | undefined);

    return { subject, body, actions };
  }

  private _buildActions(assignmentUrl?: string): ITemplateAction[] {
    const actions: ITemplateAction[] = [];
    if (assignmentUrl) {
      actions.push({ label: 'View Assignment', type: 'link', url: assignmentUrl });
    }
    return actions;
  }

  private _formatDate(dueAt?: string): string {
    if (!dueAt) return 'soon';
    try {
      return new Date(dueAt).toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      });
    } catch {
      return 'soon';
    }
  }
}
