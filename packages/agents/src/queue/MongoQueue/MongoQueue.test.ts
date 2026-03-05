import { MongoQueue } from './MongoQueue';
import type { Db, Collection } from 'mongodb';

describe('MongoQueue', () => {
  let mongoQueue: MongoQueue;
  let mockDb: jest.Mocked<Db>;
  let mockCollection: jest.Mocked<Collection>;

  beforeEach(() => {
    mockCollection = {
      insertOne: jest.fn(),
      findOneAndUpdate: jest.fn(),
      updateOne: jest.fn(),
      findOne: jest.fn(),
      updateMany: jest.fn(),
      deleteOne: jest.fn(),
      deleteMany: jest.fn(),
      aggregate: jest.fn(),
      createIndex: jest.fn(),
    } as unknown as jest.Mocked<Collection>;

    mockDb = {
      collection: jest.fn().mockReturnValue(mockCollection),
    } as unknown as jest.Mocked<Db>;

    mongoQueue = new MongoQueue(mockDb);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('add', () => {
    it('should add a job to the queue', async () => {
      // Arrange
      const jobId = '507f1f77bcf86cd799439011';
      mockCollection.insertOne.mockResolvedValue({
        insertedId: { toString: () => jobId },
      } as unknown as Awaited<ReturnType<typeof mockCollection.insertOne>>);

      // Act
      const result = await mongoQueue.add('notify', 'deliver-notification', {
        notificationId: 'notif-123',
      });

      // Assert
      expect(result).toBe(jobId);
      expect(mockCollection.insertOne).toHaveBeenCalledTimes(1);
      const callArgs = mockCollection.insertOne.mock.calls[0]?.[0] as {
        type?: string;
        name?: string;
        data?: Record<string, unknown>;
        status?: string;
        priority?: number;
      };
      expect(callArgs?.type).toBe('notify');
      expect(callArgs?.name).toBe('deliver-notification');
      expect(callArgs?.data).toEqual({ notificationId: 'notif-123' });
      expect(callArgs?.status).toBe('pending');
      expect(callArgs?.priority).toBe(10);
    });

    it('should schedule job with delay', async () => {
      // Arrange
      const jobId = '507f1f77bcf86cd799439011';
      mockCollection.insertOne.mockResolvedValue({
        insertedId: { toString: () => jobId },
      } as unknown as Awaited<ReturnType<typeof mockCollection.insertOne>>);

      const delay = 5000; // 5 seconds

      // Act
      await mongoQueue.add('notify', 'deliver-notification', {}, { delay });

      // Assert
      const callArgs = mockCollection.insertOne.mock.calls[0]?.[0] as {
        scheduledFor?: Date;
      };
      expect(callArgs?.scheduledFor).toBeInstanceOf(Date);
      const scheduledTime = callArgs?.scheduledFor?.getTime() ?? 0;
      const expectedTime = Date.now() + delay;
      expect(scheduledTime).toBeGreaterThanOrEqual(expectedTime - 100);
      expect(scheduledTime).toBeLessThanOrEqual(expectedTime + 100);
    });

    it('should use custom priority when provided', async () => {
      // Arrange
      const jobId = '507f1f77bcf86cd799439011';
      mockCollection.insertOne.mockResolvedValue({
        insertedId: { toString: () => jobId },
      } as unknown as Awaited<ReturnType<typeof mockCollection.insertOne>>);

      // Act
      await mongoQueue.add('notify', 'deliver-notification', {}, { priority: 5 });

      // Assert
      const callArgs = mockCollection.insertOne.mock.calls[0]?.[0] as {
        priority?: number;
      };
      expect(callArgs?.priority).toBe(5);
    });

    it('should use custom maxAttempts when provided', async () => {
      // Arrange
      const jobId = '507f1f77bcf86cd799439011';
      mockCollection.insertOne.mockResolvedValue({
        insertedId: { toString: () => jobId },
      } as unknown as Awaited<ReturnType<typeof mockCollection.insertOne>>);

      // Act
      await mongoQueue.add('notify', 'deliver-notification', {}, { maxAttempts: 3 });

      // Assert
      const callArgs = mockCollection.insertOne.mock.calls[0]?.[0] as {
        maxAttempts?: number;
      };
      expect(callArgs?.maxAttempts).toBe(3);
    });
  });

  describe('getNextJob', () => {
    it('should return next pending job', async () => {
      // Arrange
      const job = {
        _id: { toString: (): string => '507f1f77bcf86cd799439011' },
        type: 'notify',
        name: 'deliver-notification',
        data: { notificationId: 'notif-123' },
        status: 'processing',
        priority: 5,
        scheduledFor: new Date(),
      };

      mockCollection.findOneAndUpdate.mockResolvedValue({
        value: job,
      } as unknown as Awaited<ReturnType<typeof mockCollection.findOneAndUpdate>>);

      // Act
      const result = await mongoQueue.getNextJob();

      // Assert
      expect(result).toEqual(job);
      expect(mockCollection.findOneAndUpdate).toHaveBeenCalledTimes(1);
    });

    it('should return null when no jobs available', async () => {
      // Arrange
      mockCollection.findOneAndUpdate.mockResolvedValue({
        value: null,
      } as unknown as Awaited<ReturnType<typeof mockCollection.findOneAndUpdate>>);

      // Act
      const result = await mongoQueue.getNextJob();

      // Assert
      expect(result).toBeNull();
    });

    it('should claim job atomically with correct status update', async () => {
      // Arrange
      const job = {
        _id: { toString: (): string => 'job-123' },
        status: 'processing',
      };

      mockCollection.findOneAndUpdate.mockResolvedValue({
        value: job,
      } as unknown as Awaited<ReturnType<typeof mockCollection.findOneAndUpdate>>);

      // Act
      await mongoQueue.getNextJob();

      // Assert
      const callArgs = mockCollection.findOneAndUpdate.mock.calls[0];
      const filter = callArgs?.[0] as { status?: string; scheduledFor?: unknown };
      const update = callArgs?.[1] as { $set?: Record<string, unknown> };

      expect(filter?.status).toBe('pending');
      expect(update?.$set?.['status']).toBe('processing');
      expect(update?.$set?.['lockedAt']).toBeDefined();
      expect(update?.$set?.['lockedBy']).toBeDefined();
    });

    it('should only return notify jobs when options.type is "notify"', async () => {
      const job = {
        _id: { toString: (): string => 'job-notify' },
        type: 'notify',
        name: 'deliver-notification',
        data: {},
        status: 'processing',
        priority: 10,
        scheduledFor: new Date(),
      };
      mockCollection.findOneAndUpdate.mockResolvedValue({
        value: job,
      } as unknown as Awaited<ReturnType<typeof mockCollection.findOneAndUpdate>>);

      const result = await mongoQueue.getNextJob({ type: 'notify' });

      expect(result).toEqual(job);
      const filter = mockCollection.findOneAndUpdate.mock.calls[0]?.[0] as {
        status?: string;
        type?: string;
      };
      expect(filter?.type).toBe('notify');
      expect(filter?.status).toBe('pending');
    });

    it('should only return sync jobs when options.type is "sync"', async () => {
      const job = {
        _id: { toString: (): string => 'job-sync' },
        type: 'sync',
        name: 'sync-student',
        data: {},
        status: 'processing',
        priority: 10,
        scheduledFor: new Date(),
      };
      mockCollection.findOneAndUpdate.mockResolvedValue({
        value: job,
      } as unknown as Awaited<ReturnType<typeof mockCollection.findOneAndUpdate>>);

      const result = await mongoQueue.getNextJob({ type: 'sync' });

      expect(result).toEqual(job);
      const filter = mockCollection.findOneAndUpdate.mock.calls[0]?.[0] as {
        status?: string;
        type?: string;
      };
      expect(filter?.type).toBe('sync');
    });
  });

  describe('complete', () => {
    it('should mark job as completed', async () => {
      // Arrange
      const jobId = '507f1f77bcf86cd799439011';

      // Act
      await mongoQueue.complete(jobId);

      // Assert
      expect(mockCollection.updateOne).toHaveBeenCalledTimes(1);
      const callArgs = mockCollection.updateOne.mock.calls[0];
      const filter = callArgs?.[0] as { _id?: unknown };
      const update = callArgs?.[1] as {
        $set?: Record<string, unknown>;
        $unset?: Record<string, string>;
      };

      expect(filter?._id).toBeDefined();
      expect(update?.$set?.['status']).toBe('completed');
      expect(update?.$set?.['completedAt']).toBeDefined();
      expect(update?.$unset?.['lockedAt']).toBe('');
      expect(update?.$unset?.['lockedBy']).toBe('');
    });
  });

  describe('fail', () => {
    it('should mark job as failed when max attempts reached', async () => {
      // Arrange
      const jobId = '507f1f77bcf86cd799439011';
      const job = {
        _id: { toString: (): string => jobId },
        attempts: 4,
        maxAttempts: 5,
      };

      mockCollection.findOne.mockResolvedValue(job as unknown);

      const error = new Error('Delivery failed');

      // Act
      await mongoQueue.fail(jobId, error);

      // Assert
      expect(mockCollection.updateOne).toHaveBeenCalledTimes(1);
      const callArgs = mockCollection.updateOne.mock.calls[0];
      const update = callArgs?.[1] as { $set?: Record<string, unknown> };

      expect(update?.$set?.['status']).toBe('failed');
      expect(update?.$set?.['attempts']).toBe(5);
      expect(update?.$set?.['lastError']).toBe('Delivery failed');
    });

    it('should retry job with exponential backoff when attempts remain', async () => {
      // Arrange
      const jobId = '507f1f77bcf86cd799439011';
      const job = {
        _id: { toString: (): string => jobId },
        attempts: 1,
        maxAttempts: 5,
      };

      mockCollection.findOne.mockResolvedValue(job as unknown);

      const error = new Error('Temporary failure');

      // Act
      await mongoQueue.fail(jobId, error);

      // Assert
      expect(mockCollection.updateOne).toHaveBeenCalledTimes(1);
      const callArgs = mockCollection.updateOne.mock.calls[0];
      const update = callArgs?.[1] as { $set?: Record<string, unknown> };

      expect(update?.$set?.['status']).toBe('pending');
      expect(update?.$set?.['attempts']).toBe(2);
      expect(update?.$set?.['scheduledFor']).toBeDefined();
    });
  });

  describe('resetStalledJobs', () => {
    it('should reset stalled jobs', async () => {
      // Arrange
      mockCollection.updateMany.mockResolvedValue({
        modifiedCount: 3,
      } as unknown as Awaited<ReturnType<typeof mockCollection.updateMany>>);

      // Act
      const result = await mongoQueue.resetStalledJobs();

      // Assert
      expect(result).toBe(3);
      expect(mockCollection.updateMany).toHaveBeenCalledTimes(1);
    });
  });

  describe('getStats', () => {
    it('should return queue statistics', async () => {
      // Arrange
      const stats = [
        { _id: 'pending', count: 10 },
        { _id: 'processing', count: 2 },
        { _id: 'completed', count: 100 },
        { _id: 'failed', count: 5 },
      ];

      mockCollection.aggregate.mockReturnValue({
        toArray: jest.fn().mockResolvedValue(stats),
      } as unknown as ReturnType<typeof mockCollection.aggregate>);

      // Act
      const result = await mongoQueue.getStats();

      // Assert
      expect(result.pending).toBe(10);
      expect(result.processing).toBe(2);
      expect(result.completed).toBe(100);
      expect(result.failed).toBe(5);
    });
  });

  describe('cancel', () => {
    it('should cancel pending job by notification ID', async () => {
      // Arrange
      const notificationId = 'notif-123';
      mockCollection.deleteOne.mockResolvedValue({
        deletedCount: 1,
      } as unknown as Awaited<ReturnType<typeof mockCollection.deleteOne>>);

      // Act
      const result = await mongoQueue.cancel(notificationId);

      // Assert
      expect(result).toBe(true);
      expect(mockCollection.deleteOne).toHaveBeenCalledTimes(1);
      const callArgs = mockCollection.deleteOne.mock.calls[0];
      const filter = callArgs?.[0] as {
        status?: string;
        'data.notificationId'?: string;
      };
      expect(filter?.status).toBe('pending');
      expect(filter?.['data.notificationId']).toBe(notificationId);
    });

    it('should return false when job not found', async () => {
      // Arrange
      const notificationId = 'notif-123';
      mockCollection.deleteOne.mockResolvedValue({
        deletedCount: 0,
      } as unknown as Awaited<ReturnType<typeof mockCollection.deleteOne>>);

      // Act
      const result = await mongoQueue.cancel(notificationId);

      // Assert
      expect(result).toBe(false);
    });
  });

  describe('cleanup', () => {
    it('should delete old completed jobs', async () => {
      // Arrange
      mockCollection.deleteMany.mockResolvedValue({
        deletedCount: 50,
      } as unknown as Awaited<ReturnType<typeof mockCollection.deleteMany>>);

      // Act
      const result = await mongoQueue.cleanup(24);

      // Assert
      expect(result).toBe(50);
      expect(mockCollection.deleteMany).toHaveBeenCalledTimes(1);
    });
  });
});
