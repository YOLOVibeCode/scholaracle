import { Alert } from '@scholaracle/contracts';
import { ITemplateResult, ITemplateAction } from '../MissingAssignmentTemplate';

/**
 * Template for generating student notifications about upcoming assignment deadlines.
 * Direct, clear messaging telling student what's due and when.
 */
export class DeadlineTemplate {
  /**
   * Generate notification content from a deadline alert.
   *
   * @param alert - The alert containing deadline details
   * @returns Template result with subject, body, and actions
   */
  public generate(alert: Alert): ITemplateResult {
    const relatedData = alert.relatedData as {
      course: string;
      assignment: string;
      dueDate: string;
      points: number;
      assignmentUrl?: string;
    };

    const { course, assignment, dueDate, assignmentUrl } = relatedData;

    const dueDateObj = new Date(dueDate);
    const formattedDate = this._formatDate(dueDateObj);

    const body = `${course}: ${assignment} (due ${formattedDate}). View details in your dashboard.`;

    const actions: ITemplateAction[] = [];

    if (assignmentUrl) {
      actions.push({
        label: 'View Assignment',
        type: 'link',
        url: assignmentUrl,
      });
    }

    const subject = `Assignment Due ${formattedDate}`;

    return {
      subject,
      body,
      actions,
    };
  }

  private _formatDate(date: Date): string {
    const options: Intl.DateTimeFormatOptions = {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    };
    return date.toLocaleDateString('en-US', options);
  }
}
