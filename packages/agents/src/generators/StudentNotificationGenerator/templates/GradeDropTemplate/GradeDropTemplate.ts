import { Alert } from '@scholaracle/contracts';
import { ITemplateResult } from '../MissingAssignmentTemplate';

/**
 * Template for generating student notifications about grade drops.
 * Direct messaging telling student what happened and what to review.
 * Scores stay out of copy unless showGrades is explicitly true.
 */
export class GradeDropTemplate {
  /**
   * Generate notification content from a grade drop alert.
   *
   * @param alert - The alert containing grade drop details
   * @returns Template result with subject, body, and actions
   */
  public generate(alert: Alert): ITemplateResult {
    const relatedData = alert.relatedData as {
      course: string;
      previousGrade: number;
      currentGrade: number;
      reason: string;
      showGrades?: boolean;
    };

    const { course, previousGrade, currentGrade, reason } = relatedData;
    const showGrades = relatedData.showGrades === true;
    const dropAmount = previousGrade - currentGrade;

    if (!showGrades) {
      return {
        subject: `${course} needs a closer look`,
        body: `${course} dropped. Open the last assignment and review the material.`,
        actions: [],
      };
    }

    const body = `${course} grade dropped from ${previousGrade}% to ${currentGrade}% (${dropAmount}% drop).

Reason: ${reason}

Review material and improve.`;

    const subject = `${course} Grade Drop: ${previousGrade}% → ${currentGrade}%`;

    return {
      subject,
      body,
      actions: [],
    };
  }
}
