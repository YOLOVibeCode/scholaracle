import { INotificationGenerator } from '@scholaracle/interfaces';
import {
  Notification,
  Alert,
  AlertType,
  AgentType,
  NotificationPriority,
  NotificationError,
} from '@scholaracle/contracts';
import {
  MissingAssignmentTemplate,
  DeadlineTemplate,
  GradeDropTemplate,
  TestTemplate,
  WorkloadTemplate,
  PositiveTemplate,
  type ITemplateResult,
  type ITemplateAction,
} from './templates';

/**
 * Generates parent-facing notifications from alerts.
 * Uses detailed, contextual messaging with grade impact analysis and action recommendations.
 */
export class ParentNotificationGenerator implements INotificationGenerator {
  private readonly _templates: Record<
    AlertType,
    | MissingAssignmentTemplate
    | DeadlineTemplate
    | GradeDropTemplate
    | TestTemplate
    | WorkloadTemplate
    | PositiveTemplate
  >;

  constructor() {
    this._templates = {
      [AlertType.MISSING_ASSIGNMENT]: new MissingAssignmentTemplate(),
      [AlertType.DEADLINE]: new DeadlineTemplate(),
      [AlertType.GRADE_DROP]: new GradeDropTemplate(),
      [AlertType.TEST]: new TestTemplate(),
      [AlertType.WORKLOAD]: new WorkloadTemplate(),
      [AlertType.POSITIVE]: new PositiveTemplate(),
    };
  }

  /**
   * Generate a notification from an alert.
   *
   * @param alert - The alert that triggered this notification
   * @returns A notification ready for delivery
   * @throws {NotificationError} If alert type is not supported
   */
  public generate(alert: Alert): Notification {
    const template = this._templates[alert.type];

    if (!template) {
      throw new NotificationError(
        `No template found for alert type: ${alert.type}`,
        'TEMPLATE_NOT_FOUND'
      );
    }

    const templateResult: ITemplateResult = template.generate(alert);
    const { subject, body, actions } = templateResult;

    // Note: userId should be parent's user ID, not student's
    // For now, using studentId as placeholder - will be updated when user system is implemented
    return new Notification({
      agentType: AgentType.PARENT,
      studentId: alert.studentId,
      userId: alert.studentId, // TODO: Replace with actual parent userId
      subject,
      body,
      priority: this._mapSeverityToPriority(alert.severity),
      triggerType: alert.type,
      triggerData: alert.relatedData,
      actions: actions.map((action: ITemplateAction) => ({
        label: action.label,
        type: action.type,
        url: action.url,
      })),
    });
  }

  private _mapSeverityToPriority(severity: string): NotificationPriority {
    switch (severity.toLowerCase()) {
      case 'critical':
        return NotificationPriority.CRITICAL;
      case 'high':
        return NotificationPriority.HIGH;
      case 'medium':
        return NotificationPriority.MEDIUM;
      case 'low':
        return NotificationPriority.LOW;
      default:
        return NotificationPriority.MEDIUM;
    }
  }
}
