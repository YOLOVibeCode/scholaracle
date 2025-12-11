import { Alert } from '@scholaracle/contracts';
import { ITemplateResult } from '../../../StudentNotificationGenerator/templates';

interface IAssignmentInfo {
  course: string;
  dueDate: string;
  assignment?: string;
}

/**
 * Template for generating parent notifications about high workload.
 * Includes student name, assignment breakdown, and monitoring recommendations.
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
      studentName: string;
      assignmentCount: number;
      isDueThisWeek: boolean;
      assignments?: IAssignmentInfo[];
    };

    const { studentName, assignmentCount, isDueThisWeek, assignments } = relatedData;

    const timeFrame = isDueThisWeek ? 'this week' : 'upcoming';

    // REQUIRED: Use template literals (CODING_STANDARDS.md)
    let body = `${studentName} - ${assignmentCount} Assignments Due ${timeFrame === 'this week' ? 'This Week' : 'Soon'}

Student: ${studentName}
Total assignments: ${assignmentCount}
Timeframe: ${timeFrame === 'this week' ? 'This week' : 'Upcoming'}`;

    if (assignments && assignments.length > 0) {
      body += '\n\nAssignments:';
      assignments.forEach((assignment) => {
        const assignmentName = assignment.assignment
          ? `${assignment.assignment} (${assignment.course})`
          : assignment.course;
        body += `\n- ${assignmentName} - Due: ${assignment.dueDate}`;
      });
    }

    body += `\n\nAction: Monitor ${studentName}'s completion progress and ensure adequate time management.`;

    const subject = `${studentName} - ${assignmentCount} Assignments Due ${timeFrame === 'this week' ? 'This Week' : 'Soon'}`;

    return {
      subject,
      body,
      actions: [],
    };
  }
}
