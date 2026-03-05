import { Alert } from '@scholaracle/contracts';
import { ITemplateResult, ITemplateAction } from '../../../StudentNotificationGenerator/templates';

/**
 * Template for generating parent notifications about missing assignments.
 * Includes student name, grade impact analysis, and action recommendations.
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
      studentName: string;
      course: string;
      assignment: string;
      daysAgo: number;
      points: number;
      gradeImpact: number;
      currentGrade: number;
      assignmentUrl?: string;
    };

    const { studentName, course, assignment, daysAgo, assignmentUrl } = relatedData;

    // Concise, link-first: detail lives in dashboard (plan section 8).
    const body = `${studentName} has a missing assignment in ${course}: ${assignment} (due ${daysAgo} days ago). View details in your dashboard.`;

    const actions: ITemplateAction[] = [];

    if (assignmentUrl) {
      actions.push({
        label: 'View Assignment',
        type: 'link',
        url: assignmentUrl,
      });
    }

    const subject = `${studentName} - MISSING ASSIGNMENT: ${course}`;

    return {
      subject,
      body,
      actions,
    };
  }
}
