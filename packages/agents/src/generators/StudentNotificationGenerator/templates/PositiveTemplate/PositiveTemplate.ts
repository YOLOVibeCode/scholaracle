import { Alert } from '@scholaracle/contracts';
import { ITemplateResult } from '../MissingAssignmentTemplate';

/**
 * Template for generating positive/encouraging student notifications.
 * Celebrates achievements and good performance.
 */
export class PositiveTemplate {
  /**
   * Generate notification content from a positive alert.
   *
   * @param alert - The alert containing positive achievement details
   * @returns Template result with subject, body, and actions
   */
  public generate(alert: Alert): ITemplateResult {
    const relatedData = alert.relatedData as {
      achievement: string;
      course: string;
    };

    const { achievement, course } = relatedData;

    // REQUIRED: Use template literals (CODING_STANDARDS.md)
    const body = `${course}: ${achievement}

Keep up the good work!`;

    const subject = `Great Work: ${course}`;

    return {
      subject,
      body,
      actions: [],
    };
  }
}
