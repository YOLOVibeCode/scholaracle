import { Alert } from '@scholaracle/contracts';
import { ITemplateResult } from '../../../StudentNotificationGenerator/templates';

/**
 * Template for generating parent notifications about grade drops.
 * Includes detailed analysis, contributing factors, and recommendations.
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
      studentName: string;
      course: string;
      previousGrade: number;
      currentGrade: number;
      change: number;
      timeframe: string;
      contributingFactors: string[];
    };

    const {
      studentName,
      course,
      previousGrade,
      currentGrade,
      change,
      timeframe,
      contributingFactors,
    } = relatedData;

    const previousLetter = this._getLetterGrade(previousGrade);
    const currentLetter = this._getLetterGrade(currentGrade);

    // REQUIRED: Use template literals (CODING_STANDARDS.md)
    const body = `GRADE DROP ALERT

Student: ${studentName}
Course: ${course}
Previous: ${previousGrade}% (${previousLetter})
Current: ${currentGrade}% (${currentLetter})
Change: ${change > 0 ? '+' : ''}${change}%
Timeframe: ${timeframe}

Contributing Factors:
${contributingFactors.map((factor) => `- ${factor}`).join('\n')}

Recommendation:
1. Review recent work with ${studentName}
2. Check understanding of current material
3. Consider additional support if pattern continues`;

    const subject = `${studentName} - ${course} Grade Drop: ${previousGrade}% → ${currentGrade}%`;

    return {
      subject,
      body,
      actions: [],
    };
  }

  private _getLetterGrade(percentage: number): string {
    if (percentage >= 90) return 'A';
    if (percentage >= 80) return 'B';
    if (percentage >= 70) return 'C';
    if (percentage >= 60) return 'D';
    return 'F';
  }
}
