import { Alert } from '@scholaracle/contracts';
import { ITemplateResult } from '../../../StudentNotificationGenerator/templates';

/**
 * Template for generating positive/encouraging parent notifications.
 * Celebrates achievements and good performance with context.
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
      studentName: string;
      achievement: string;
      course: string;
      currentGrade?: number;
    };

    const { studentName, achievement, course, currentGrade } = relatedData;

    // REQUIRED: Use template literals (CODING_STANDARDS.md)
    let body = `${studentName} - Great Work: ${course}

Student: ${studentName}
Achievement: ${achievement}`;

    if (currentGrade !== undefined) {
      body += `\nCurrent grade: ${currentGrade}%`;
    }

    body += '\n\nKeep up the excellent work!';

    const subject = `${studentName} - Great Work: ${course}`;

    return {
      subject,
      body,
      actions: [],
    };
  }
}
