import { Alert } from '@scholaracle/contracts';
import { ITemplateResult, ITemplateAction } from '../MissingAssignmentTemplate';

/**
 * Template for generating student notifications about upcoming assignment deadlines.
 * Direct, clear messaging telling student what's due and when.
 */
export class DeadlineTemplate {
  public generate(alert: Alert): ITemplateResult {
    const rd = alert.relatedData as Record<string, unknown>;

    const course = (rd['course'] as string) ?? (rd['courseExternalId'] as string) ?? 'a course';
    const assignment = (rd['assignment'] as string) ?? (rd['title'] as string) ?? 'an assignment';
    const dueAt = (rd['dueDate'] as string) ?? (rd['dueAt'] as string);
    const formattedDate = (rd['formattedDueDate'] as string) ?? this._formatDate(dueAt);

    const body = `${course}: "${assignment}" is due ${formattedDate}. Don't forget to submit!`;
    const subject = `Due ${formattedDate}: ${assignment} (${course})`;

    const actions: ITemplateAction[] = [];
    if (rd['assignmentUrl']) {
      actions.push({ label: 'View Assignment', type: 'link', url: rd['assignmentUrl'] as string });
    }

    return { subject, body, actions };
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
