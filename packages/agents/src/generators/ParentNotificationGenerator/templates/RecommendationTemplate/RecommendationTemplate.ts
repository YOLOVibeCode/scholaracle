import { Alert } from '@scholaracle/contracts';
import type { ITemplateResult, ITemplateAction } from '..';

/**
 * Template for generating parent notifications about AI-powered recommendations.
 * Provides contextual guidance for parents to support their child's academics.
 */
export class RecommendationTemplate {
  public generate(alert: Alert): ITemplateResult {
    const relatedData = alert.relatedData as {
      studentName: string;
      recommendationType: string;
      title: string;
      description: string;
      relatedCourses?: string[];
      dashboardUrl?: string;
    };

    const { studentName, recommendationType, title, description, relatedCourses, dashboardUrl } =
      relatedData;

    const courseInfo = relatedCourses?.length
      ? `\nRelated courses: ${relatedCourses.join(', ')}`
      : '';

    const body = `${studentName}: ${title}${courseInfo}

${description}

${this._getParentGuidance(recommendationType)}`;

    const actions: ITemplateAction[] = [];
    if (dashboardUrl) {
      actions.push({
        label: 'View Dashboard',
        type: 'link',
        url: dashboardUrl,
      });
    }

    return {
      subject: `${studentName} - Recommendation: ${title}`,
      body,
      actions,
    };
  }

  private _getParentGuidance(type: string): string {
    switch (type) {
      case 'study_habit':
        return 'Consider discussing a study routine together.';
      case 'time_management':
        return 'You may want to check in about upcoming assignments.';
      case 'grade_improvement':
        return 'Consider reaching out to the teacher to discuss options.';
      case 'positive_reinforcement':
        return 'Your child is doing a great job — consider acknowledging their effort!';
      default:
        return '';
    }
  }
}
