import { NotificationScheduler } from './NotificationScheduler';
import { MongoQueue } from '../../queue/MongoQueue';
import {
  Notification,
  NotificationPriority,
  AgentType,
  NotificationError,
  Alert,
  AlertType,
} from '@scholaracle/contracts';

describe('NotificationScheduler', () => {
  let notificationScheduler: NotificationScheduler;
  let mockMongoQueue: jest.Mocked<MongoQueue>;

  beforeEach(() => {
    mockMongoQueue = {
      add: jest.fn(),
    } as unknown as jest.Mocked<MongoQueue>;

    notificationScheduler = new NotificationScheduler(mockMongoQueue);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('schedule', () => {
    it('should schedule notification for immediate delivery', async () => {
      // Arrange
      const alert = new Alert({
        studentId: 'student-123',
        type: AlertType.MISSING_ASSIGNMENT,
        severity: 'high',
        relatedData: {},
      });

      const notification = new Notification({
        agentType: AgentType.STUDENT,
        studentId: 'student-123',
        userId: 'user-456',
        subject: 'Test',
        body: 'Test body',
        priority: NotificationPriority.HIGH,
        triggerType: 'test',
        scheduledFor: new Date(),
      });

      mockMongoQueue.add.mockResolvedValue('job-id-123');

      // Act
      await notificationScheduler.schedule(notification, alert);

      // Assert
      expect(mockMongoQueue.add).toHaveBeenCalledTimes(1);
      const callArgs = mockMongoQueue.add.mock.calls[0];
      expect(callArgs?.[0]).toBe('notify');
      expect(callArgs?.[1]).toBe('deliver-notification');
      const jobData = callArgs?.[2] as { alert?: unknown };
      expect(jobData?.alert).toBeDefined();
    });

    it('should schedule notification for future delivery', async () => {
      // Arrange
      const alert = new Alert({
        studentId: 'student-123',
        type: AlertType.MISSING_ASSIGNMENT,
        severity: 'high',
        relatedData: {},
      });

      const futureDate = new Date(Date.now() + 3600000); // 1 hour from now
      const notification = new Notification({
        agentType: AgentType.PARENT,
        studentId: 'student-123',
        userId: 'parent-456',
        subject: 'Test',
        body: 'Test body',
        priority: NotificationPriority.MEDIUM,
        triggerType: 'test',
        scheduledFor: futureDate,
      });

      mockMongoQueue.add.mockResolvedValue('job-id-123');

      // Act
      await notificationScheduler.schedule(notification, alert);

      // Assert
      expect(mockMongoQueue.add).toHaveBeenCalledTimes(1);
      const callArgs = mockMongoQueue.add.mock.calls[0];
      const options = callArgs?.[3] as { delay?: number; priority?: number };
      expect(options?.delay).toBeDefined();
      expect(options?.delay).toBeGreaterThan(0);
      expect(options?.delay).toBeLessThanOrEqual(3600000);
    });

    it('should use notification priority for job priority', async () => {
      // Arrange
      const alert = new Alert({
        studentId: 'student-123',
        type: AlertType.MISSING_ASSIGNMENT,
        severity: 'critical',
        relatedData: {},
      });

      const notification = new Notification({
        agentType: AgentType.STUDENT,
        studentId: 'student-123',
        userId: 'user-456',
        subject: 'Test',
        body: 'Test body',
        priority: NotificationPriority.CRITICAL,
        triggerType: 'test',
      });

      mockMongoQueue.add.mockResolvedValue('job-id-123');

      // Act
      await notificationScheduler.schedule(notification, alert);

      // Assert
      const callArgs = mockMongoQueue.add.mock.calls[0];
      const options = callArgs?.[3] as { priority?: number };
      expect(options?.priority).toBe(0); // CRITICAL = 0 (highest priority)
    });

    it('should map notification priorities to job priorities correctly', async () => {
      // Arrange
      const alert = new Alert({
        studentId: 'student-123',
        type: AlertType.MISSING_ASSIGNMENT,
        severity: 'high',
        relatedData: {},
      });

      const criticalNotification = new Notification({
        agentType: AgentType.STUDENT,
        studentId: 'student-123',
        userId: 'user-456',
        subject: 'Test',
        body: 'Test body',
        priority: NotificationPriority.CRITICAL,
        triggerType: 'test',
      });

      const highNotification = new Notification({
        agentType: AgentType.STUDENT,
        studentId: 'student-123',
        userId: 'user-456',
        subject: 'Test',
        body: 'Test body',
        priority: NotificationPriority.HIGH,
        triggerType: 'test',
      });

      const mediumNotification = new Notification({
        agentType: AgentType.STUDENT,
        studentId: 'student-123',
        userId: 'user-456',
        subject: 'Test',
        body: 'Test body',
        priority: NotificationPriority.MEDIUM,
        triggerType: 'test',
      });

      const lowNotification = new Notification({
        agentType: AgentType.STUDENT,
        studentId: 'student-123',
        userId: 'user-456',
        subject: 'Test',
        body: 'Test body',
        priority: NotificationPriority.LOW,
        triggerType: 'test',
      });

      mockMongoQueue.add.mockResolvedValue('job-id');

      // Act
      await notificationScheduler.schedule(criticalNotification, alert);
      await notificationScheduler.schedule(highNotification, alert);
      await notificationScheduler.schedule(mediumNotification, alert);
      await notificationScheduler.schedule(lowNotification, alert);

      // Assert
      expect(mockMongoQueue.add).toHaveBeenCalledTimes(4);
      const criticalOptions = mockMongoQueue.add.mock.calls[0]?.[3] as {
        priority?: number;
      };
      const highOptions = mockMongoQueue.add.mock.calls[1]?.[3] as {
        priority?: number;
      };
      const mediumOptions = mockMongoQueue.add.mock.calls[2]?.[3] as {
        priority?: number;
      };
      const lowOptions = mockMongoQueue.add.mock.calls[3]?.[3] as {
        priority?: number;
      };

      expect(criticalOptions?.priority).toBe(0);
      expect(highOptions?.priority).toBe(5);
      expect(mediumOptions?.priority).toBe(10);
      expect(lowOptions?.priority).toBe(15);
    });

    it('should throw NotificationError when scheduling fails', async () => {
      // Arrange
      const notification = new Notification({
        agentType: AgentType.STUDENT,
        studentId: 'student-123',
        userId: 'user-456',
        subject: 'Test',
        body: 'Test body',
        priority: NotificationPriority.HIGH,
        triggerType: 'test',
      });

      const alert = new Alert({
        studentId: 'student-123',
        type: AlertType.MISSING_ASSIGNMENT,
        severity: 'high',
        relatedData: {},
      });

      const queueError = new Error('Queue connection failed');
      mockMongoQueue.add.mockRejectedValue(queueError);

      // Act & Assert
      await expect(notificationScheduler.schedule(notification, alert)).rejects.toThrow(
        NotificationError
      );
      await expect(notificationScheduler.schedule(notification, alert)).rejects.toThrow(
        'Failed to schedule notification'
      );
    });
  });

  describe('cancel', () => {
    it('should cancel scheduled notification', async () => {
      // Arrange
      const notificationId = 'notif-123';
      mockMongoQueue.cancel = jest.fn().mockResolvedValue(true);

      // Act
      await notificationScheduler.cancel(notificationId);

      // Assert
      expect(mockMongoQueue.cancel).toHaveBeenCalledTimes(1);
      expect(mockMongoQueue.cancel).toHaveBeenCalledWith(notificationId);
    });

    it('should throw NotificationError when cancellation fails', async () => {
      // Arrange
      const notificationId = 'notif-123';
      const cancelError = new Error('Job not found');
      mockMongoQueue.cancel = jest.fn().mockRejectedValue(cancelError);

      // Act & Assert
      await expect(notificationScheduler.cancel(notificationId)).rejects.toThrow(NotificationError);
      await expect(notificationScheduler.cancel(notificationId)).rejects.toThrow(
        'Failed to cancel notification'
      );
    });

    it('should throw NotificationError when notification not found', async () => {
      // Arrange
      const notificationId = 'notif-123';
      mockMongoQueue.cancel = jest.fn().mockResolvedValue(false);

      // Act & Assert
      await expect(notificationScheduler.cancel(notificationId)).rejects.toThrow(NotificationError);
      await expect(notificationScheduler.cancel(notificationId)).rejects.toThrow(
        'Notification not found'
      );
    });
  });
});
