import { Alert } from '@scholaracle/contracts';

export interface ITemplateResult {
  readonly subject: string;
  readonly body: string;
  readonly actions: ITemplateAction[];
}

export interface ITemplateAction {
  readonly label: string;
  readonly type: 'link' | 'button';
  readonly url?: string;
  readonly action?: string;
}

/**
 * Template for generating student notifications about missing assignments.
 * Direct, clear messaging telling student what to do.
 */
export class MissingAssignmentTemplate {
  /**
   * Generate notification content from a missing assignment alert.
   *
   * @param alert - The alert containing assignment details
   * @returns Template result with subject, body, and actions
   */
  public generate(alert: Alert): ITemplateResult {
    const relatedData = alert.relatedData as {
      course: string;
      assignment: string;
      daysAgo: number;
      points: number;
      assignmentUrl?: string;
    };

    const { course, assignment, daysAgo, assignmentUrl } = relatedData;

    const body = `${course}: ${assignment} (due ${daysAgo} days ago). View details in your dashboard.`;

    const actions: ITemplateAction[] = [];

    if (assignmentUrl) {
      actions.push({
        label: 'Submit Now',
        type: 'link',
        url: assignmentUrl,
      });
    }

    return {
      subject: 'MISSING ASSIGNMENT',
      body,
      actions,
    };
  }
}
