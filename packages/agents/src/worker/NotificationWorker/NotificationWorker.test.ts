import { NotificationWorker } from './NotificationWorker';
import { MongoQueue, type IJob } from '../../queue/MongoQueue';
import { NotificationService } from '../../service/NotificationService';
import { Notification, NotificationPriority, AgentType, AlertType } from '@scholaracle/contracts';
import type { ObjectId } from 'mongodb';

describe('NotificationWorker', () => {
  let notificationWorker: NotificationWorker;
  let mockMongoQueue: jest.Mocked<MongoQueue>;
  let mockNotificationService: jest.Mocked<NotificationService>;

  beforeEach(() => {
    mockMongoQueue = {
      getNextJob: jest.fn(),
      complete: jest.fn(),
      fail: jest.fn(),
    } as unknown as jest.Mocked<MongoQueue>;

    mockNotificationService = {
      processAlert: jest.fn(),
    } as unknown as jest.Mocked<NotificationService>;

    notificationWorker = new NotificationWorker(mockMongoQueue, mockNotificationService);
  });

  afterEach(async () => {
    await notificationWorker.stop();
    jest.clearAllMocks();
  });

  describe('start', () => {
    it('should start processing jobs', async () => {
      // Arrange
      mockMongoQueue.getNextJob.mockResolvedValue(null);

      // Act
      notificationWorker.start();

      // Wait a bit for processing loop
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Assert
      expect(mockMongoQueue.getNextJob).toHaveBeenCalled();
    });
  });

  describe('stop', () => {
    it('should stop processing jobs', async () => {
      // Arrange
      notificationWorker.start();

      // Act
      await notificationWorker.stop();

      // Assert
      // Worker should stop processing
      const callCountBefore = mockMongoQueue.getNextJob.mock.calls.length;

      await new Promise((resolve) => setTimeout(resolve, 100));

      const callCountAfter = mockMongoQueue.getNextJob.mock.calls.length;

      expect(callCountAfter).toBe(callCountBefore);
    });
  });

  describe('processJob', () => {
    it('should process notification job successfully', async () => {
      // Arrange
      const jobId = 'job-123';
      const job: IJob = {
        _id: { toString: (): string => jobId } as unknown as ObjectId,
        type: 'notify',
        name: 'deliver-notification',
        data: {
          alert: {
            studentId: 'student-123',
            type: AlertType.MISSING_ASSIGNMENT,
            severity: 'high',
            relatedData: {},
          },
        },
        scheduledFor: new Date(),
        priority: 5,
        status: 'processing',
        attempts: 0,
        maxAttempts: 5,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockNotificationService.processAlert.mockResolvedValue({
        studentNotification: new Notification({
          agentType: AgentType.STUDENT,
          studentId: 'student-123',
          userId: 'user-456',
          subject: 'Test',
          body: 'Test body',
          priority: NotificationPriority.HIGH,
          triggerType: 'test',
        }),
        parentNotification: new Notification({
          agentType: AgentType.PARENT,
          studentId: 'student-123',
          userId: 'parent-456',
          subject: 'Test',
          body: 'Test body',
          priority: NotificationPriority.HIGH,
          triggerType: 'test',
        }),
        deliveryResults: [],
      });

      // Act
      await notificationWorker.processJob(job);

      // Assert
      expect(mockNotificationService.processAlert).toHaveBeenCalledTimes(1);
      expect(mockMongoQueue.complete).toHaveBeenCalledWith(jobId);
      expect(mockMongoQueue.fail).not.toHaveBeenCalled();
    });

    it('should mark job as failed when processing fails', async () => {
      // Arrange
      const jobId = 'job-123';
      const job: IJob = {
        _id: { toString: (): string => jobId } as unknown as ObjectId,
        type: 'notify',
        name: 'deliver-notification',
        data: {
          alert: {
            studentId: 'student-123',
            type: AlertType.MISSING_ASSIGNMENT,
            severity: 'high',
            relatedData: {},
          },
        },
        scheduledFor: new Date(),
        priority: 5,
        status: 'processing',
        attempts: 0,
        maxAttempts: 5,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const processingError = new Error('Delivery failed');
      mockNotificationService.processAlert.mockRejectedValue(processingError);

      // Act
      await notificationWorker.processJob(job);

      // Assert
      expect(mockMongoQueue.fail).toHaveBeenCalledWith(jobId, processingError);
      expect(mockMongoQueue.complete).not.toHaveBeenCalled();
    });

    it('should handle jobs with missing alert data gracefully', async () => {
      // Arrange
      const jobId = 'job-123';
      const job: IJob = {
        _id: { toString: (): string => jobId } as unknown as ObjectId,
        type: 'notify',
        name: 'deliver-notification',
        data: {},
        scheduledFor: new Date(),
        priority: 5,
        status: 'processing',
        attempts: 0,
        maxAttempts: 5,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // Act
      await notificationWorker.processJob(job);

      // Assert
      expect(mockMongoQueue.fail).toHaveBeenCalled();
    });
  });

  describe('processing loop', () => {
    it('should process multiple jobs sequentially', async () => {
      // Arrange
      const job1: IJob = {
        _id: { toString: (): string => 'job-1' } as unknown as ObjectId,
        type: 'notify',
        name: 'deliver-notification',
        data: {
          alert: {
            studentId: 'student-123',
            type: AlertType.MISSING_ASSIGNMENT,
            severity: 'high',
            relatedData: {},
          },
        },
        scheduledFor: new Date(),
        priority: 5,
        status: 'processing',
        attempts: 0,
        maxAttempts: 5,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const job2: IJob = {
        _id: { toString: (): string => 'job-2' } as unknown as ObjectId,
        type: 'notify',
        name: 'deliver-notification',
        data: {
          alert: {
            studentId: 'student-123',
            type: AlertType.MISSING_ASSIGNMENT,
            severity: 'high',
            relatedData: {},
          },
        },
        scheduledFor: new Date(),
        priority: 5,
        status: 'processing',
        attempts: 0,
        maxAttempts: 5,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockMongoQueue.getNextJob
        .mockResolvedValueOnce(job1)
        .mockResolvedValueOnce(job2)
        .mockResolvedValue(null);

      mockNotificationService.processAlert.mockResolvedValue({
        studentNotification: new Notification({
          agentType: AgentType.STUDENT,
          studentId: 'student-123',
          userId: 'user-456',
          subject: 'Test',
          body: 'Test body',
          priority: NotificationPriority.HIGH,
          triggerType: 'test',
        }),
        parentNotification: new Notification({
          agentType: AgentType.PARENT,
          studentId: 'student-123',
          userId: 'parent-456',
          subject: 'Test',
          body: 'Test body',
          priority: NotificationPriority.HIGH,
          triggerType: 'test',
        }),
        deliveryResults: [],
      });

      // Act
      notificationWorker.start();

      // Wait for processing
      await new Promise((resolve) => setTimeout(resolve, 200));

      await notificationWorker.stop();

      // Assert
      expect(mockMongoQueue.getNextJob).toHaveBeenCalledTimes(3);
      expect(mockNotificationService.processAlert).toHaveBeenCalledTimes(2);
    });

    it('should wait when no jobs available', async () => {
      // Arrange
      mockMongoQueue.getNextJob.mockResolvedValue(null);

      // Act
      notificationWorker.start();

      await new Promise((resolve) => setTimeout(resolve, 150));

      await notificationWorker.stop();

      // Assert
      expect(mockMongoQueue.getNextJob).toHaveBeenCalled();
    });
  });
});
