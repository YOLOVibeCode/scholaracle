import { Alert } from '@scholaracle/contracts';
import { ITemplateResult } from '../MissingAssignmentTemplate';

/**
 * Template for generating student notifications about upcoming tests.
 * Direct messaging telling student when test is and what to study.
 */
export class TestTemplate {
  /**
   * Generate notification content from a test alert.
   *
   * @param alert - The alert containing test details
   * @returns Template result with subject, body, and actions
   */
  public generate(alert: Alert): ITemplateResult {
    const relatedData = alert.relatedData as {
      course: string;
      testName: string;
      testDate: string;
      weight: number;
    };

    const { course, testName, testDate, weight } = relatedData;

    const testDateObj = new Date(testDate);
    const formattedDate = this._formatDate(testDateObj);

    // REQUIRED: Use template literals (CODING_STANDARDS.md)
    const body = `${course}: ${testName}
Date: ${formattedDate}
Weight: ${weight}% of grade

Study and prepare.`;

    const subject = `Test: ${testName} - ${course}`;

    return {
      subject,
      body,
      actions: [],
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
