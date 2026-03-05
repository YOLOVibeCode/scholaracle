import { Alert } from '@scholaracle/contracts';
import { ITemplateResult, ITemplateAction } from '../../../StudentNotificationGenerator/templates';

/**
 * Template for generating parent notifications about upcoming assignment deadlines.
 * Includes student name, current grade, grade weight, and action recommendations.
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
      studentName: string;
      course: string;
      assignment: string;
      dueDate: string;
      points: number;
      gradeWeight: number;
      currentGrade: number;
      assignmentUrl?: string;
    };

    const { studentName, course, assignment, dueDate, assignmentUrl } = relatedData;

    const formattedDate = this._formatDate(new Date(dueDate));
    const body = `${studentName} has an assignment due in ${course}: ${assignment} (${formattedDate}). View details in your dashboard.`;
    const actions = this._buildActions(assignmentUrl);
    const subject = `${studentName} - Assignment Due ${formattedDate}`;

    return {
      subject,
      body,
      actions,
    };
  }

  private _buildActions(assignmentUrl?: string): ITemplateAction[] {
    const actions: ITemplateAction[] = [];

    if (assignmentUrl) {
      actions.push({
        label: 'View Assignment',
        type: 'link',
        url: assignmentUrl,
      });
      actions.push({
        label: 'View Grade',
        type: 'link',
        url: assignmentUrl.replace('/assignments/', '/grades/'),
      });
    }

    return actions;
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
