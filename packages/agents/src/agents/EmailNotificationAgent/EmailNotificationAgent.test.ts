import {
  Alert,
  AlertType,
  AgentType,
  NotificationChannel,
  NotificationPriority,
} from '@scholaracle/contracts';
import { EmailNotificationAgent } from './EmailNotificationAgent';

const ALL_ALERT_TYPES: AlertType[] = [
  AlertType.MISSING_ASSIGNMENT,
  AlertType.DEADLINE,
  AlertType.GRADE_DROP,
  AlertType.TEST,
  AlertType.WORKLOAD,
  AlertType.POSITIVE,
  AlertType.RECOMMENDATION,
];

describe('EmailNotificationAgent', () => {
  let agent: EmailNotificationAgent;

  beforeEach(() => {
    agent = new EmailNotificationAgent();
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
          course: 'Math',
          assignment: 'Homework 5',
          daysAgo: 2,
          points: 25,
        },
      });
      const notification = agent.generate(alert);
      expect(notification.channels).toEqual([NotificationChannel.EMAIL]);
    });

    it('returns STUDENT agentType', () => {
      const alert = new Alert({
        type: AlertType.MISSING_ASSIGNMENT,
        studentId: 'student-123',
        severity: 'high',
        relatedData: { course: 'Math', assignment: 'HW', daysAgo: 1, points: 10 },
      });
      const notification = agent.generate(alert);
      expect(notification.agentType).toBe(AgentType.STUDENT);
    });

    it('matches existing student template subject/body for missing assignment', () => {
      const alert = new Alert({
        type: AlertType.MISSING_ASSIGNMENT,
        studentId: 'student-123',
        severity: 'high',
        relatedData: {
          course: 'Math',
          assignment: 'Homework 5',
          daysAgo: 2,
          points: 25,
        },
      });
      const notification = agent.generate(alert);
      expect(notification.subject).toBe('MISSING ASSIGNMENT');
      expect(notification.body).toContain('Math');
      expect(notification.body).toContain('Homework 5');
      expect(notification.priority).toBe(NotificationPriority.HIGH);
      expect(notification.triggerType).toBe(AlertType.MISSING_ASSIGNMENT);
    });
  });
});
