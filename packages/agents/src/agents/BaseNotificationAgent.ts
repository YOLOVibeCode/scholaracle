import {
  Alert,
  AlertType,
  AgentType,
  Notification,
  NotificationPriority,
} from '@scholaracle/contracts';
import type { INotificationAgent } from '@scholaracle/interfaces';

/**
 * Abstract base for notification agents. Implements handles() via alert-type list; subclasses implement generate().
 */
export abstract class BaseNotificationAgent implements INotificationAgent {
  constructor(
    protected readonly _alertTypes: readonly AlertType[],
    protected readonly _agentType: AgentType
  ) {}

  public handles(alert: Alert): boolean {
    return this._alertTypes.includes(alert.type);
  }

  public abstract generate(alert: Alert): Notification;

  protected _mapSeverityToPriority(severity: string): NotificationPriority {
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
