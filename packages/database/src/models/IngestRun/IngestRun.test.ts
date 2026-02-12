import { IngestRun } from './IngestRun';
import type { ObjectId } from 'mongodb';

describe('IngestRun', () => {
  describe('constructor', () => {
    it('should create run with required fields', () => {
      // Arrange
      const startedAt = new Date('2024-06-01T12:00:00Z');
      const data = {
        userId: 'user-123',
        sourceId: 'source-456',
        runId: 'run-789',
        mode: 'delta' as const,
        startedAt,
      };

      // Act
      const run = new IngestRun(data);

      // Assert
      expect(run.userId).toBe('user-123');
      expect(run.sourceId).toBe('source-456');
      expect(run.runId).toBe('run-789');
      expect(run.mode).toBe('delta');
      expect(run.startedAt).toEqual(startedAt);
    });

    it('should set status to started by default', () => {
      // Arrange
      const data = {
        userId: 'user-123',
        sourceId: 'source-456',
        runId: 'run-789',
        mode: 'delta' as const,
        startedAt: new Date(),
      };

      // Act
      const run = new IngestRun(data);

      // Assert
      expect(run.status).toBe('started');
    });

    it('should set error to null by default', () => {
      // Arrange
      const data = {
        userId: 'user-123',
        sourceId: 'source-456',
        runId: 'run-789',
        mode: 'delta' as const,
        startedAt: new Date(),
      };

      // Act
      const run = new IngestRun(data);

      // Assert
      expect(run.error).toBeNull();
    });

    it('should use provided status', () => {
      // Arrange
      const data = {
        userId: 'user-123',
        sourceId: 'source-456',
        runId: 'run-789',
        mode: 'delta' as const,
        status: 'committed' as const,
        startedAt: new Date(),
      };

      // Act
      const run = new IngestRun(data);

      // Assert
      expect(run.status).toBe('committed');
    });

    it('should use provided error', () => {
      // Arrange
      const data = {
        userId: 'user-123',
        sourceId: 'source-456',
        runId: 'run-789',
        mode: 'delta' as const,
        status: 'failed' as const,
        startedAt: new Date(),
        error: 'Connection timeout',
      };

      // Act
      const run = new IngestRun(data);

      // Assert
      expect(run.error).toBe('Connection timeout');
    });

    it('should use provided cursor fields', () => {
      // Arrange
      const lastCursor = { type: 'opaque' as const, value: 'cursor-abc' };
      const newCursor = { type: 'opaque' as const, value: 'cursor-def' };
      const data = {
        userId: 'user-123',
        sourceId: 'source-456',
        runId: 'run-789',
        mode: 'delta' as const,
        startedAt: new Date(),
        lastCursor,
        newCursor,
      };

      // Act
      const run = new IngestRun(data);

      // Assert
      expect(run.lastCursor).toEqual(lastCursor);
      expect(run.newCursor).toEqual(newCursor);
    });

    it('should use provided optional date fields', () => {
      // Arrange
      const uploadedAt = new Date('2024-06-01T12:05:00Z');
      const committedAt = new Date('2024-06-01T12:10:00Z');
      const data = {
        userId: 'user-123',
        sourceId: 'source-456',
        runId: 'run-789',
        mode: 'delta' as const,
        startedAt: new Date('2024-06-01T12:00:00Z'),
        uploadedAt,
        committedAt,
      };

      // Act
      const run = new IngestRun(data);

      // Assert
      expect(run.uploadedAt).toEqual(uploadedAt);
      expect(run.committedAt).toEqual(committedAt);
    });

    it('should accept ObjectId for userId', () => {
      // Arrange
      const mockUserId = { toString: () => 'user-obj-123' } as unknown as ObjectId;
      const data = {
        userId: mockUserId,
        sourceId: 'source-456',
        runId: 'run-789',
        mode: 'delta' as const,
        startedAt: new Date(),
      };

      // Act
      const run = new IngestRun(data);

      // Assert
      expect(run.userId).toBe(mockUserId);
    });

    it('should accept ObjectId for _id', () => {
      // Arrange
      const mockId = { toString: () => 'run-123' } as unknown as ObjectId;
      const data = {
        userId: 'user-123',
        sourceId: 'source-456',
        runId: 'run-789',
        mode: 'delta' as const,
        startedAt: new Date(),
      };

      // Act
      const run = new IngestRun(data, mockId);

      // Assert
      expect(run._id).toBe(mockId);
    });
  });
});
