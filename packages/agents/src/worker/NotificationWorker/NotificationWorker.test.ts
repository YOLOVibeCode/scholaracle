import { NotificationWorker } from './NotificationWorker';
import { MongoQueue, type IJob } from '../../queue/MongoQueue';
import { NotificationService } from '../../service/NotificationService';
import {
  Alert,
  Notification,
  NotificationPriority,
  AgentType,
  AlertType,
  NotificationChannel,
} from '@scholaracle/contracts';
import type { ObjectId } from 'mongodb';

describe('NotificationWorker', () => {
  let notificationWorker: NotificationWorker;
  let mockMongoQueue: jest.Mocked<MongoQueue>;
  let mockNotificationService: jest.Mocked<NotificationService>;

  beforeEach(() => {
    mockMongoQueue = {
      getNextJob: jest.fn(),
      add: jest.fn().mockResolvedValue('deliver-job-id'),
      complete: jest.fn(),
      fail: jest.fn(),
    } as unknown as jest.Mocked<MongoQueue>;

    mockNotificationService = {
      processAlert: jest.fn(),
      processAlertEnqueueDeliver: jest
        .fn()
        .mockResolvedValue({ notifications: [], deliveryJobIds: [] }),
      deliverOne: jest.fn().mockResolvedValue({
        success: true,
        channel: 'email',
        messageId: 'id',
        deliveredAt: new Date(),
      }),
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
      expect(mockMongoQueue.getNextJob).toHaveBeenCalledWith({ type: 'notify' });
      expect(mockMongoQueue.getNextJob).toHaveBeenCalledWith({ type: 'deliver' });
    });

    it('should only claim notify jobs via getNextJob type filter', async () => {
      mockMongoQueue.getNextJob.mockResolvedValue(null);

      notificationWorker.start();
      await new Promise((resolve) => setTimeout(resolve, 100));
      await notificationWorker.stop();

      expect(mockMongoQueue.getNextJob).toHaveBeenCalledWith({ type: 'notify' });
      expect(mockNotificationService.processAlertEnqueueDeliver).not.toHaveBeenCalled();
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

      mockNotificationService.processAlertEnqueueDeliver.mockResolvedValue({
        notifications: [],
        deliveryJobIds: ['d1', 'd2'],
      });

      // Act
      await notificationWorker.processJob(job);

      // Assert
      expect(mockNotificationService.processAlertEnqueueDeliver).toHaveBeenCalledTimes(1);
      expect(mockNotificationService.processAlertEnqueueDeliver).toHaveBeenCalledWith(
        expect.any(Alert),
        mockMongoQueue,
        undefined
      );
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
      mockNotificationService.processAlertEnqueueDeliver.mockRejectedValue(processingError);

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

    it('should process deliver job and call deliverOne then complete', async () => {
      const jobId = 'deliver-job-1';
      const notificationPayload = {
        agentType: AgentType.STUDENT,
        studentId: 'student-123',
        userId: 'user-456',
        subject: 'Test',
        body: 'Test body',
        priority: NotificationPriority.HIGH,
        triggerType: 'test' as const,
      };
      const job: IJob = {
        _id: { toString: (): string => jobId } as unknown as ObjectId,
        type: 'deliver',
        name: 'deliver-one',
        data: { notificationPayload, channel: NotificationChannel.EMAIL },
        scheduledFor: new Date(),
        priority: 5,
        status: 'processing',
        attempts: 0,
        maxAttempts: 5,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await notificationWorker.processJob(job);

      expect(mockNotificationService.deliverOne).toHaveBeenCalledTimes(1);
      expect(mockNotificationService.deliverOne).toHaveBeenCalledWith(
        notificationPayload,
        NotificationChannel.EMAIL
      );
      expect(mockMongoQueue.complete).toHaveBeenCalledWith(jobId);
      expect(mockMongoQueue.fail).not.toHaveBeenCalled();
    });

    it('should fall back to processAlert when processAlertEnqueueDeliver throws agent-based error', async () => {
      const jobId = 'job-legacy';
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
      mockNotificationService.processAlertEnqueueDeliver.mockRejectedValue(
        new Error('processAlertEnqueueDeliver requires agent-based NotificationService')
      );
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

      await notificationWorker.processJob(job);

      expect(mockNotificationService.processAlertEnqueueDeliver).toHaveBeenCalledTimes(1);
      expect(mockNotificationService.processAlert).toHaveBeenCalledTimes(1);
      expect(mockNotificationService.processAlert).toHaveBeenCalledWith(
        expect.any(Alert),
        undefined
      );
      expect(mockMongoQueue.complete).toHaveBeenCalledWith(jobId);
      expect(mockMongoQueue.fail).not.toHaveBeenCalled();
    });

    it('should fail deliver job when deliverOne throws', async () => {
      const jobId = 'deliver-job-2';
      const job: IJob = {
        _id: { toString: (): string => jobId } as unknown as ObjectId,
        type: 'deliver',
        name: 'deliver-one',
        data: {
          notificationPayload: {
            agentType: AgentType.STUDENT,
            studentId: 's1',
            userId: 'u1',
            subject: 'S',
            body: 'B',
            priority: NotificationPriority.HIGH,
            triggerType: 'test' as const,
          },
          channel: NotificationChannel.EMAIL,
        },
        scheduledFor: new Date(),
        priority: 5,
        status: 'processing',
        attempts: 0,
        maxAttempts: 5,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const err = new Error('SMTP failed');
      mockNotificationService.deliverOne.mockRejectedValue(err);

      await notificationWorker.processJob(job);

      expect(mockMongoQueue.fail).toHaveBeenCalledWith(jobId, err);
      expect(mockMongoQueue.complete).not.toHaveBeenCalled();
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

      let notifyCallCount = 0;
      mockMongoQueue.getNextJob.mockImplementation((opts?: { type?: string }) => {
        if (opts?.type === 'deliver') return Promise.resolve(null);
        notifyCallCount++;
        if (notifyCallCount === 1) return Promise.resolve(job1);
        if (notifyCallCount === 2) return Promise.resolve(job2);
        return Promise.resolve(null);
      });

      mockNotificationService.processAlertEnqueueDeliver.mockResolvedValue({
        notifications: [],
        deliveryJobIds: [],
      });

      // Act
      notificationWorker.start();

      // Wait for processing
      await new Promise((resolve) => setTimeout(resolve, 200));

      await notificationWorker.stop();

      // Assert
      expect(mockMongoQueue.getNextJob).toHaveBeenCalledWith({ type: 'notify' });
      expect(mockMongoQueue.getNextJob).toHaveBeenCalledWith({ type: 'deliver' });
      expect(mockNotificationService.processAlertEnqueueDeliver).toHaveBeenCalledTimes(2);
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
