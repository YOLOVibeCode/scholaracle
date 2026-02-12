import { Alert } from '@scholaracle/contracts';
import type { ITemplateResult, ITemplateAction } from '../MissingAssignmentTemplate';

/**
 * Template for generating student notifications about AI-powered recommendations.
 * Provides actionable study and time management advice.
 */
export class RecommendationTemplate {
  public generate(alert: Alert): ITemplateResult {
    const relatedData = alert.relatedData as {
      recommendationType: string;
      title: string;
      description: string;
      relatedCourses?: string[];
      dashboardUrl?: string;
    };

    const { recommendationType, title, description, relatedCourses, dashboardUrl } = relatedData;

    const courseInfo = relatedCourses?.length ? `\nCourses: ${relatedCourses.join(', ')}` : '';

    const body = `${title}${courseInfo}

${description}

${this._getActionHint(recommendationType)}`;

    const actions: ITemplateAction[] = [];
    if (dashboardUrl) {
      actions.push({
        label: 'View Dashboard',
        type: 'link',
        url: dashboardUrl,
      });
    }

    return {
      subject: `Recommendation: ${title}`,
      body,
      actions,
    };
  }

  private _getActionHint(type: string): string {
    switch (type) {
      case 'study_habit':
        return 'Try setting a regular study schedule.';
      case 'time_management':
        return 'Consider using a planner to track due dates.';
      case 'grade_improvement':
        return 'Review recent material and reach out for help.';
      case 'positive_reinforcement':
        return 'Keep up the great work!';
      default:
        return '';
    }
  }
}
