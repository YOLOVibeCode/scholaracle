import { Alert } from '@scholaracle/contracts';
import { ITemplateResult, ITemplateAction } from '../../../StudentNotificationGenerator/templates';

/**
 * Template for generating parent notifications about upcoming assignment deadlines.
 * Includes student name, current grade, grade weight, and action recommendations.
 */
export class DeadlineTemplate {
  /**
   * Generate notification content from a deadline alert.
   *
   * @param alert - The alert containing deadline details
   * @returns Template result with subject, body, and actions
   */
  public generate(alert: Alert): ITemplateResult {
    const relatedData = alert.relatedData as {
      studentName: string;
      course: string;
      assignment: string;
      dueDate: string;
      points: number;
      gradeWeight: number;
      currentGrade: number;
      assignmentUrl?: string;
    };

    const {
      studentName,
      course,
      assignment,
      dueDate,
      points,
      gradeWeight,
      currentGrade,
      assignmentUrl,
    } = relatedData;

    const formattedDate = this._formatDate(new Date(dueDate));
    const body = this._buildBody(
      studentName,
      course,
      assignment,
      formattedDate,
      points,
      gradeWeight,
      currentGrade
    );
    const actions = this._buildActions(assignmentUrl);
    const subject = `${studentName} - Assignment Due ${formattedDate}`;

    return {
      subject,
      body,
      actions,
    };
  }

  private _buildBody(
    studentName: string,
    course: string,
    assignment: string,
    formattedDate: string,
    points: number,
    gradeWeight: number,
    currentGrade: number
  ): string {
    // REQUIRED: Use template literals (CODING_STANDARDS.md)
    return `${studentName} - Assignment Due ${formattedDate}

Student: ${studentName}
Course: ${course}
Assignment: ${assignment}
Due: ${formattedDate}
Value: ${points} points (${gradeWeight}% of semester grade)

Current grade in course: ${currentGrade}%

Action: Ensure ${studentName} completes assignment before deadline.`;
  }

  private _buildActions(assignmentUrl?: string): ITemplateAction[] {
    const actions: ITemplateAction[] = [];

    if (assignmentUrl) {
      actions.push({
        label: 'View Assignment',
        type: 'link',
        url: assignmentUrl,
      });
      actions.push({
        label: 'View Grade',
        type: 'link',
        url: assignmentUrl.replace('/assignments/', '/grades/'),
      });
    }

    return actions;
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
