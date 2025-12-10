import { Alert } from '@scholaracle/contracts';
import { ITemplateResult } from '../MissingAssignmentTemplate';

/**
 * Template for generating student notifications about high workload.
 * Direct messaging telling student to plan ahead.
 */
export class WorkloadTemplate {
  /**
   * Generate notification content from a workload alert.
   *
   * @param alert - The alert containing workload details
   * @returns Template result with subject, body, and actions
   */
  public generate(alert: Alert): ITemplateResult {
    const relatedData = alert.relatedData as {
      assignmentCount: number;
      isDueThisWeek: boolean;
    };

    const { assignmentCount, isDueThisWeek } = relatedData;

    const timeFrame = isDueThisWeek ? 'this week' : 'upcoming';

    // REQUIRED: Use template literals (CODING_STANDARDS.md)
    const body = `You have ${assignmentCount} assignments due ${timeFrame}.

Plan your time and stay on track.`;

    const subject = `${assignmentCount} Assignments Due ${timeFrame === 'this week' ? 'This Week' : 'Soon'}`;

    return {
      subject,
      body,
      actions: [],
    };
  }
}
