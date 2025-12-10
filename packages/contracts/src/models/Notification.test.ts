import { Notification } from './Notification';
import { NotificationPriority } from '../enums/NotificationPriority';
import { NotificationChannel } from '../enums/NotificationChannel';
import { AgentType } from '../enums/AgentType';

describe('Notification', () => {
  const validData = {
    agentType: AgentType.STUDENT,
    studentId: 'student-123',
    userId: 'user-456',
    subject: 'Test Subject',
    body: 'Test body content',
    priority: NotificationPriority.HIGH,
    triggerType: 'missing_assignment',
  };

  describe('constructor', () => {
    it('should create notification with all required fields', () => {
      // Act
      const notification = new Notification(validData);

      // Assert
      expect(notification.agentType).toBe(AgentType.STUDENT);
      expect(notification.studentId).toBe('student-123');
      expect(notification.userId).toBe('user-456');
      expect(notification.subject).toBe('Test Subject');
      expect(notification.body).toBe('Test body content');
      expect(notification.priority).toBe(NotificationPriority.HIGH);
      expect(notification.triggerType).toBe('missing_assignment');
      expect(notification.id).toBeDefined();
      expect(notification.createdAt).toBeInstanceOf(Date);
      expect(notification.scheduledFor).toBeInstanceOf(Date);
    });

    it('should generate unique ID for each notification', () => {
      // Act
      const notification1 = new Notification(validData);
      const notification2 = new Notification(validData);

      // Assert
      expect(notification1.id).not.toBe(notification2.id);
    });

    it('should set createdAt timestamp', () => {
      // Arrange
      const beforeCreation = new Date();

      // Act
      const notification = new Notification(validData);
      const afterCreation = new Date();

      // Assert
      expect(notification.createdAt.getTime()).toBeGreaterThanOrEqual(beforeCreation.getTime());
      expect(notification.createdAt.getTime()).toBeLessThanOrEqual(afterCreation.getTime());
    });

    it('should set default channels based on priority', () => {
      // Act
      const criticalNotification = new Notification({
        ...validData,
        priority: NotificationPriority.CRITICAL,
      });
      const highNotification = new Notification({
        ...validData,
        priority: NotificationPriority.HIGH,
      });
      const mediumNotification = new Notification({
        ...validData,
        priority: NotificationPriority.MEDIUM,
      });
      const lowNotification = new Notification({
        ...validData,
        priority: NotificationPriority.LOW,
      });

      // Assert
      expect(criticalNotification.channels).toEqual([
        NotificationChannel.PUSH,
        NotificationChannel.EMAIL,
        NotificationChannel.SMS,
      ]);
      expect(highNotification.channels).toEqual([
        NotificationChannel.PUSH,
        NotificationChannel.EMAIL,
      ]);
      expect(mediumNotification.channels).toEqual([
        NotificationChannel.EMAIL,
        NotificationChannel.IN_APP,
      ]);
      expect(lowNotification.channels).toEqual([NotificationChannel.IN_APP]);
    });

    it('should use provided channels when specified', () => {
      // Arrange
      const customChannels = [NotificationChannel.EMAIL, NotificationChannel.SMS];

      // Act
      const notification = new Notification({
        ...validData,
        channels: customChannels,
      });

      // Assert
      expect(notification.channels).toEqual(customChannels);
    });

    it('should set scheduledFor to current time by default', () => {
      // Arrange
      const beforeCreation = new Date();

      // Act
      const notification = new Notification(validData);
      const afterCreation = new Date();

      // Assert
      expect(notification.scheduledFor.getTime()).toBeGreaterThanOrEqual(beforeCreation.getTime());
      expect(notification.scheduledFor.getTime()).toBeLessThanOrEqual(afterCreation.getTime());
    });

    it('should use provided scheduledFor when specified', () => {
      // Arrange
      const futureDate = new Date('2025-01-01T00:00:00Z');

      // Act
      const notification = new Notification({
        ...validData,
        scheduledFor: futureDate,
      });

      // Assert
      expect(notification.scheduledFor).toEqual(futureDate);
    });

    it('should set default empty actions array', () => {
      // Act
      const notification = new Notification(validData);

      // Assert
      expect(notification.actions).toEqual([]);
    });

    it('should use provided actions when specified', () => {
      // Arrange
      const actions = [
        { label: 'View Assignment', type: 'link' as const, url: 'https://example.com' },
      ];

      // Act
      const notification = new Notification({
        ...validData,
        actions,
      });

      // Assert
      expect(notification.actions).toEqual(actions);
    });

    it('should throw error when agentType is missing', () => {
      // Act & Assert
      expect(() => {
        new Notification({
          ...validData,
          agentType: undefined as unknown as AgentType,
        });
      }).toThrow('Missing required field: agentType');
    });

    it('should throw error when studentId is missing', () => {
      // Act & Assert
      expect(() => {
        new Notification({
          ...validData,
          studentId: undefined as unknown as string,
        });
      }).toThrow('Missing required field: studentId');
    });

    it('should throw error when userId is missing', () => {
      // Act & Assert
      expect(() => {
        new Notification({
          ...validData,
          userId: undefined as unknown as string,
        });
      }).toThrow('Missing required field: userId');
    });

    it('should throw error when subject is missing', () => {
      // Act & Assert
      expect(() => {
        new Notification({
          ...validData,
          subject: undefined as unknown as string,
        });
      }).toThrow('Missing required field: subject');
    });

    it('should throw error when body is missing', () => {
      // Act & Assert
      expect(() => {
        new Notification({
          ...validData,
          body: undefined as unknown as string,
        });
      }).toThrow('Missing required field: body');
    });

    it('should throw error when priority is missing', () => {
      // Act & Assert
      expect(() => {
        new Notification({
          ...validData,
          priority: undefined as unknown as NotificationPriority,
        });
      }).toThrow('Missing required field: priority');
    });

    it('should throw error when triggerType is missing', () => {
      // Act & Assert
      expect(() => {
        new Notification({
          ...validData,
          triggerType: undefined as unknown as string,
        });
      }).toThrow('Missing required field: triggerType');
    });
  });

  describe('markSent', () => {
    it('should set sentAt timestamp', () => {
      // Arrange
      const notification = new Notification(validData);
      expect(notification.sentAt).toBeUndefined();

      // Act
      notification.markSent();

      // Assert
      expect(notification.sentAt).toBeInstanceOf(Date);
      expect(notification.sentAt?.getTime()).toBeGreaterThan(0);
    });

    it('should update sentAt timestamp on subsequent calls', async () => {
      // Arrange
      const notification = new Notification(validData);
      notification.markSent();
      const firstSentAt = notification.sentAt;

      // Wait a bit
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Act
      notification.markSent();

      // Assert
      expect(notification.sentAt?.getTime()).toBeGreaterThan(firstSentAt?.getTime() ?? 0);
    });
  });

  describe('markDelivered', () => {
    it('should set deliveredAt timestamp', () => {
      // Arrange
      const notification = new Notification(validData);
      expect(notification.deliveredAt).toBeUndefined();

      // Act
      notification.markDelivered();

      // Assert
      expect(notification.deliveredAt).toBeInstanceOf(Date);
    });
  });

  describe('markOpened', () => {
    it('should set openedAt timestamp', () => {
      // Arrange
      const notification = new Notification(validData);
      expect(notification.openedAt).toBeUndefined();

      // Act
      notification.markOpened();

      // Assert
      expect(notification.openedAt).toBeInstanceOf(Date);
    });
  });

  describe('markActionTaken', () => {
    it('should set actionTakenAt timestamp', () => {
      // Arrange
      const notification = new Notification(validData);
      expect(notification.actionTakenAt).toBeUndefined();

      // Act
      notification.markActionTaken();

      // Assert
      expect(notification.actionTakenAt).toBeInstanceOf(Date);
    });
  });
});
