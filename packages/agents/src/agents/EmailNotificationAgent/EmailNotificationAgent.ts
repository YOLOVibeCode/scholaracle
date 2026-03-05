import {
  Alert,
  AlertType,
  AgentType,
  Notification,
  NotificationChannel,
  NotificationError,
} from '@scholaracle/contracts';
import { BaseNotificationAgent } from '../BaseNotificationAgent';
import {
  MissingAssignmentTemplate,
  DeadlineTemplate,
  GradeDropTemplate,
  TestTemplate,
  WorkloadTemplate,
  PositiveTemplate,
  RecommendationTemplate,
  ITemplateResult,
} from '../../generators/StudentNotificationGenerator/templates';

/**
 * Email-only notification agent. Handles all 7 alert types using student templates; forces EMAIL channel.
 */
export class EmailNotificationAgent extends BaseNotificationAgent {
  private readonly _templates: Record<
    AlertType,
    | MissingAssignmentTemplate
    | DeadlineTemplate
    | GradeDropTemplate
    | TestTemplate
    | WorkloadTemplate
    | PositiveTemplate
    | RecommendationTemplate
  >;

  constructor() {
    super(
      [
        AlertType.MISSING_ASSIGNMENT,
        AlertType.DEADLINE,
        AlertType.GRADE_DROP,
        AlertType.TEST,
        AlertType.WORKLOAD,
        AlertType.POSITIVE,
        AlertType.RECOMMENDATION,
      ],
      AgentType.STUDENT
    );
    this._templates = {
      [AlertType.MISSING_ASSIGNMENT]: new MissingAssignmentTemplate(),
      [AlertType.DEADLINE]: new DeadlineTemplate(),
      [AlertType.GRADE_DROP]: new GradeDropTemplate(),
      [AlertType.TEST]: new TestTemplate(),
      [AlertType.WORKLOAD]: new WorkloadTemplate(),
      [AlertType.POSITIVE]: new PositiveTemplate(),
      [AlertType.RECOMMENDATION]: new RecommendationTemplate(),
    };
  }

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
    return new Notification({
      agentType: this._agentType,
      studentId: alert.studentId,
      userId: alert.studentId,
      subject,
      body,
      priority: this.mapSeverityToPriority(alert.severity),
      triggerType: alert.type,
      triggerData: alert.relatedData,
      channels: [NotificationChannel.EMAIL],
      actions: actions.map((action) => ({
        label: action.label,
        type: action.type,
        url: action.url,
      })),
    });
  }
}
