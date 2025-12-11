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

    const {
      studentName,
      course,
      assignment,
      daysAgo,
      points,
      gradeImpact,
      currentGrade,
      assignmentUrl,
    } = relatedData;

    const projectedGrade = Math.max(0, currentGrade - gradeImpact);

    // REQUIRED: Use template literals (CODING_STANDARDS.md)
    const body = `MISSING ASSIGNMENT - ACTION REQUIRED

Student: ${studentName}
Course: ${course}
Assignment: ${assignment}
Due: ${daysAgo} days ago
Value: ${points} points (${gradeImpact}% of semester grade)

Grade Impact:
Current grade: ${currentGrade}%
Projected grade if not submitted: ${projectedGrade}%

Action: Ensure ${studentName} submits this assignment today.`;

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
