import { AlertRepository } from './AlertRepository';
import type { Db, Collection } from 'mongodb';
import { ObjectId } from 'mongodb';

describe('AlertRepository', () => {
  let mockCollection: jest.Mocked<Collection>;
  let mockDb: jest.Mocked<Db>;
  let alertRepository: AlertRepository;

  beforeEach(() => {
    mockCollection = {
      insertOne: jest.fn(),
      findOne: jest.fn(),
      find: jest.fn(),
      findOneAndUpdate: jest.fn(),
      deleteOne: jest.fn(),
    } as unknown as jest.Mocked<Collection>;

    mockDb = {
      collection: jest.fn().mockReturnValue(mockCollection),
    } as unknown as jest.Mocked<Db>;

    alertRepository = new AlertRepository(mockDb);
  });

  describe('create', () => {
    it('should create alert successfully', async () => {
      // Arrange
      const alertData = {
        studentId: 'student-123',
        userId: 'user-123',
        type: 'MISSING_ASSIGNMENT',
        severity: 'warning',
        message: 'Assignment is missing',
      };

      const insertedId = new ObjectId();
      (mockCollection.insertOne as jest.Mock).mockResolvedValue({
        insertedId,
      });

      // Act
      const result = await alertRepository.create(alertData);

      // Assert
      expect(mockCollection.insertOne).toHaveBeenCalledWith(
        expect.objectContaining({
          studentId: alertData.studentId,
          userId: alertData.userId,
          type: alertData.type,
          severity: alertData.severity,
          message: alertData.message,
          acknowledged: false,
          createdAt: expect.any(Date),
        })
      );
      expect(result).toBeDefined();
      expect(result.studentId).toBe(alertData.studentId);
      expect(result.userId).toBe(alertData.userId);
    });

    it('should set createdAt when creating alert', async () => {
      // Arrange
      const alertData = {
        studentId: 'student-123',
        userId: 'user-123',
        type: 'MISSING_ASSIGNMENT',
        severity: 'warning',
        message: 'Test',
      };

      const before = new Date();
      const insertedId = new ObjectId();
      (mockCollection.insertOne as jest.Mock).mockResolvedValue({
        insertedId,
      });

      // Act
      await alertRepository.create(alertData);
      const after = new Date();

      // Assert
      const callArgs = (mockCollection.insertOne as jest.Mock).mock.calls[0]?.[0];
      expect(callArgs.createdAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(callArgs.createdAt.getTime()).toBeLessThanOrEqual(after.getTime());
    });
  });

  describe('findByUserId', () => {
    it('should find alerts by userId', async () => {
      // Arrange
      const userId = 'user-123';
      const mockAlerts = [
        {
          _id: new ObjectId(),
          studentId: 'student-123',
          userId,
          type: 'MISSING_ASSIGNMENT',
          severity: 'warning',
          message: 'Alert 1',
          acknowledged: false,
          createdAt: new Date(),
        },
        {
          _id: new ObjectId(),
          studentId: 'student-456',
          userId,
          type: 'GRADE_DROP',
          severity: 'critical',
          message: 'Alert 2',
          acknowledged: true,
          createdAt: new Date(),
        },
      ];

      const mockCursor = {
        toArray: jest.fn().mockResolvedValue(mockAlerts),
      };
      (mockCollection.find as jest.Mock).mockReturnValue(mockCursor);

      // Act
      const result = await alertRepository.findByUserId(userId);

      // Assert
      expect(mockCollection.find).toHaveBeenCalledWith({ userId });
      expect(result).toHaveLength(2);
      expect(result[0]?.studentId).toBe('student-123');
      expect(result[1]?.studentId).toBe('student-456');
    });

    it('should return empty array when no alerts exist', async () => {
      // Arrange
      const userId = 'user-123';
      const mockCursor = {
        toArray: jest.fn().mockResolvedValue([]),
      };
      (mockCollection.find as jest.Mock).mockReturnValue(mockCursor);

      // Act
      const result = await alertRepository.findByUserId(userId);

      // Assert
      expect(result).toEqual([]);
    });
  });

  describe('findById', () => {
    it('should find alert by id', async () => {
      // Arrange
      const alertId = new ObjectId().toString();
      const mockAlert = {
        _id: new ObjectId(alertId),
        studentId: 'student-123',
        userId: 'user-123',
        type: 'MISSING_ASSIGNMENT',
        severity: 'warning',
        message: 'Test',
        acknowledged: false,
        createdAt: new Date(),
      };

      (mockCollection.findOne as jest.Mock).mockResolvedValue(mockAlert);

      // Act
      const result = await alertRepository.findById(alertId);

      // Assert
      expect(mockCollection.findOne).toHaveBeenCalledWith({
        _id: expect.any(ObjectId),
      });
      expect(result).not.toBeNull();
      expect(result?.studentId).toBe('student-123');
    });

    it('should return null when alert not found', async () => {
      // Arrange
      const alertId = new ObjectId().toString();
      (mockCollection.findOne as jest.Mock).mockResolvedValue(null);

      // Act
      const result = await alertRepository.findById(alertId);

      // Assert
      expect(result).toBeNull();
    });
  });

  describe('acknowledge', () => {
    it('should acknowledge alert successfully', async () => {
      // Arrange
      const alertId = new ObjectId().toString();
      const mockAlert = {
        _id: new ObjectId(alertId),
        studentId: 'student-123',
        userId: 'user-123',
        type: 'MISSING_ASSIGNMENT',
        severity: 'warning',
        message: 'Test',
        acknowledged: true,
        acknowledgedAt: new Date(),
        createdAt: new Date(),
      };

      (mockCollection.findOneAndUpdate as jest.Mock).mockResolvedValue(mockAlert);

      // Act
      const result = await alertRepository.acknowledge(alertId);

      // Assert
      expect(mockCollection.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: expect.any(ObjectId) },
        {
          $set: {
            acknowledged: true,
            acknowledgedAt: expect.any(Date),
          },
        },
        { returnDocument: 'after' }
      );
      expect(result).toBe(true);
    });

    it('should return false when acknowledging non-existent alert', async () => {
      // Arrange
      const alertId = new ObjectId().toString();
      (mockCollection.findOneAndUpdate as jest.Mock).mockResolvedValue(null);

      // Act
      const result = await alertRepository.acknowledge(alertId);

      // Assert
      expect(result).toBe(false);
    });
  });

  describe('delete', () => {
    it('should delete alert successfully', async () => {
      // Arrange
      const alertId = new ObjectId().toString();
      (mockCollection.deleteOne as jest.Mock).mockResolvedValue({
        deletedCount: 1,
      });

      // Act
      const result = await alertRepository.delete(alertId);

      // Assert
      expect(mockCollection.deleteOne).toHaveBeenCalledWith({
        _id: expect.any(ObjectId),
      });
      expect(result).toBe(true);
    });

    it('should return false when alert not found', async () => {
      // Arrange
      const alertId = new ObjectId().toString();
      (mockCollection.deleteOne as jest.Mock).mockResolvedValue({
        deletedCount: 0,
      });

      // Act
      const result = await alertRepository.delete(alertId);

      // Assert
      expect(result).toBe(false);
    });
  });
});
