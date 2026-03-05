import {
  Alert,
  AlertType,
  AgentType,
  NotificationChannel,
  NotificationPriority,
} from '@scholaracle/contracts';
import { ParentEmailNotificationAgent } from './ParentEmailNotificationAgent';

const ALL_ALERT_TYPES: AlertType[] = [
  AlertType.MISSING_ASSIGNMENT,
  AlertType.DEADLINE,
  AlertType.GRADE_DROP,
  AlertType.TEST,
  AlertType.WORKLOAD,
  AlertType.POSITIVE,
  AlertType.RECOMMENDATION,
];

describe('ParentEmailNotificationAgent', () => {
  let agent: ParentEmailNotificationAgent;

  beforeEach(() => {
    agent = new ParentEmailNotificationAgent();
  });

  describe('handles', () => {
    it('returns true for all 7 alert types', () => {
      for (const alertType of ALL_ALERT_TYPES) {
        const alert = new Alert({
          type: alertType,
          studentId: 'stu-1',
          severity: 'high',
          relatedData: {},
        });
        expect(agent.handles(alert)).toBe(true);
      }
    });
  });

  describe('generate', () => {
    it('returns a Notification with EMAIL channel only', () => {
      const alert = new Alert({
        type: AlertType.MISSING_ASSIGNMENT,
        studentId: 'student-123',
        severity: 'high',
        relatedData: {
          studentName: 'Ava Lewis',
          course: 'Math',
          assignment: 'Homework 5',
          daysAgo: 2,
          points: 25,
        },
      });
      const notification = agent.generate(alert);
      expect(notification.channels).toEqual([NotificationChannel.EMAIL]);
    });

    it('returns PARENT agentType', () => {
      const alert = new Alert({
        type: AlertType.MISSING_ASSIGNMENT,
        studentId: 'student-123',
        severity: 'high',
        relatedData: {
          studentName: 'Ava',
          course: 'Math',
          assignment: 'HW',
          daysAgo: 1,
          points: 10,
        },
      });
      const notification = agent.generate(alert);
      expect(notification.agentType).toBe(AgentType.PARENT);
    });

    it('matches parent template subject/body for missing assignment (includes student name)', () => {
      const alert = new Alert({
        type: AlertType.MISSING_ASSIGNMENT,
        studentId: 'student-123',
        severity: 'high',
        relatedData: {
          studentName: 'Ava Lewis',
          course: 'Math',
          assignment: 'Homework 5',
          daysAgo: 2,
          points: 25,
        },
      });
      const notification = agent.generate(alert);
      expect(notification.subject).toContain('Ava Lewis');
      expect(notification.subject).toContain('MISSING ASSIGNMENT');
      expect(notification.body).toContain('Ava Lewis');
      expect(notification.body).toContain('Math');
      expect(notification.body).toContain('Homework 5');
      expect(notification.priority).toBe(NotificationPriority.HIGH);
      expect(notification.triggerType).toBe(AlertType.MISSING_ASSIGNMENT);
    });
  });
});
