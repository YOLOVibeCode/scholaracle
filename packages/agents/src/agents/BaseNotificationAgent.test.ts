import {
  Alert,
  AlertType,
  Notification,
  NotificationChannel,
  NotificationPriority,
  AgentType,
} from '@scholaracle/contracts';
import type { INotificationAgent } from '@scholaracle/interfaces';
import { BaseNotificationAgent } from './BaseNotificationAgent';

/** Minimal concrete agent for testing BaseNotificationAgent behavior. */
class TestAgent extends BaseNotificationAgent {
  public constructor(alertTypes: readonly AlertType[]) {
    super(alertTypes, AgentType.STUDENT);
  }

  public generate(alert: Alert): Notification {
    return new Notification({
      agentType: this._agentType,
      studentId: alert.studentId,
      userId: alert.studentId,
      subject: 'Test',
      body: 'Test body',
      priority: this.mapSeverityToPriority(alert.severity),
      triggerType: alert.type,
      triggerData: alert.relatedData,
      channels: [NotificationChannel.EMAIL],
    });
  }
}

describe('BaseNotificationAgent', () => {
  describe('handles', () => {
    it('returns true when alert type is in the agent alert types', () => {
      const agent: INotificationAgent = new TestAgent([
        AlertType.MISSING_ASSIGNMENT,
        AlertType.DEADLINE,
      ]);
      const alert = new Alert({
        type: AlertType.MISSING_ASSIGNMENT,
        studentId: 'stu-1',
        severity: 'high',
        relatedData: {},
      });
      expect(agent.handles(alert)).toBe(true);
    });

    it('returns true for each configured alert type', () => {
      const agent: INotificationAgent = new TestAgent([AlertType.GRADE_DROP, AlertType.POSITIVE]);
      expect(
        agent.handles(
          new Alert({
            type: AlertType.GRADE_DROP,
            studentId: 's',
            severity: 'medium',
            relatedData: {},
          })
        )
      ).toBe(true);
      expect(
        agent.handles(
          new Alert({
            type: AlertType.POSITIVE,
            studentId: 's',
            severity: 'low',
            relatedData: {},
          })
        )
      ).toBe(true);
    });

    it('returns false when alert type is not in the agent alert types', () => {
      const agent: INotificationAgent = new TestAgent([AlertType.DEADLINE]);
      const alert = new Alert({
        type: AlertType.MISSING_ASSIGNMENT,
        studentId: 'stu-1',
        severity: 'high',
        relatedData: {},
      });
      expect(agent.handles(alert)).toBe(false);
    });
  });

  describe('generate', () => {
    it('returns a Notification with correct agentType and priority mapping', () => {
      const agent = new TestAgent([AlertType.DEADLINE]);
      const alert = new Alert({
        type: AlertType.DEADLINE,
        studentId: 'stu-1',
        severity: 'critical',
        relatedData: { course: 'Math' },
      });
      const notification = agent.generate(alert);
      expect(notification).toBeInstanceOf(Notification);
      expect(notification.agentType).toBe(AgentType.STUDENT);
      expect(notification.studentId).toBe('stu-1');
      expect(notification.userId).toBe('stu-1');
      expect(notification.priority).toBe(NotificationPriority.CRITICAL);
      expect(notification.channels).toEqual([NotificationChannel.EMAIL]);
    });

    it('maps severity to priority correctly', () => {
      const agent = new TestAgent([AlertType.TEST]);
      const severities: Array<{ severity: string; expected: NotificationPriority }> = [
        { severity: 'critical', expected: NotificationPriority.CRITICAL },
        { severity: 'high', expected: NotificationPriority.HIGH },
        { severity: 'medium', expected: NotificationPriority.MEDIUM },
        { severity: 'low', expected: NotificationPriority.LOW },
        { severity: 'unknown', expected: NotificationPriority.MEDIUM },
      ];
      for (const { severity, expected } of severities) {
        const alert = new Alert({
          type: AlertType.TEST,
          studentId: 's',
          severity,
          relatedData: {},
        });
        const notification = agent.generate(alert);
        expect(notification.priority).toBe(expected);
      }
    });
  });
});
