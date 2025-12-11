import { Alert } from '@scholaracle/contracts';
import { ITemplateResult } from '../../../StudentNotificationGenerator/templates';

/**
 * Template for generating parent notifications about upcoming tests.
 * Includes student name, current grade, test weight, and monitoring recommendations.
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
      studentName: string;
      course: string;
      testName: string;
      testDate: string;
      weight: number;
      currentGrade: number;
    };

    const { studentName, course, testName, testDate, weight, currentGrade } = relatedData;

    const testDateObj = new Date(testDate);
    const formattedDate = this._formatDate(testDateObj);

    // REQUIRED: Use template literals (CODING_STANDARDS.md)
    const body = `${studentName} - Upcoming Test

Student: ${studentName}
Course: ${course}
Test: ${testName}
Date: ${formattedDate}
Weight: ${weight}% of semester grade
Current grade in course: ${currentGrade}%

Action: Monitor ${studentName}'s preparation and ensure adequate study time.`;

    const subject = `${studentName} - Test: ${testName} - ${course}`;

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
