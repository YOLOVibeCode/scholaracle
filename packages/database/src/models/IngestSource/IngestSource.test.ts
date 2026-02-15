import { IngestSource } from './IngestSource';
import type { ObjectId } from 'mongodb';

describe('IngestSource', () => {
  describe('constructor', () => {
    it('should create source with required fields', () => {
      // Arrange
      const data = {
        userId: 'user-123',
        sourceId: 'source-456',
        provider: 'canvas',
        adapterId: 'canvas-v2',
        displayName: 'My Canvas LMS',
      };

      // Act
      const source = new IngestSource(data);

      // Assert
      expect(source.userId).toBe('user-123');
      expect(source.sourceId).toBe('source-456');
      expect(source.provider).toBe('canvas');
      expect(source.adapterId).toBe('canvas-v2');
      expect(source.displayName).toBe('My Canvas LMS');
    });

    it('should set createdAt to current date', () => {
      // Arrange
      const before = new Date();
      const data = {
        userId: 'user-123',
        sourceId: 'source-456',
        provider: 'canvas',
        adapterId: 'canvas-v2',
        displayName: 'My Canvas LMS',
      };

      // Act
      const source = new IngestSource(data);
      const after = new Date();

      // Assert
      expect(source.createdAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(source.createdAt.getTime()).toBeLessThanOrEqual(after.getTime());
    });

    it('should set updatedAt to current date', () => {
      // Arrange
      const before = new Date();
      const data = {
        userId: 'user-123',
        sourceId: 'source-456',
        provider: 'canvas',
        adapterId: 'canvas-v2',
        displayName: 'My Canvas LMS',
      };

      // Act
      const source = new IngestSource(data);
      const after = new Date();

      // Assert
      expect(source.updatedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(source.updatedAt.getTime()).toBeLessThanOrEqual(after.getTime());
    });

    it('should use provided createdAt', () => {
      // Arrange
      const createdAt = new Date('2024-01-01');
      const data = {
        userId: 'user-123',
        sourceId: 'source-456',
        provider: 'canvas',
        adapterId: 'canvas-v2',
        displayName: 'My Canvas LMS',
        createdAt,
      };

      // Act
      const source = new IngestSource(data);

      // Assert
      expect(source.createdAt).toEqual(createdAt);
    });

    it('should use provided updatedAt', () => {
      // Arrange
      const updatedAt = new Date('2024-06-15');
      const data = {
        userId: 'user-123',
        sourceId: 'source-456',
        provider: 'canvas',
        adapterId: 'canvas-v2',
        displayName: 'My Canvas LMS',
        updatedAt,
      };

      // Act
      const source = new IngestSource(data);

      // Assert
      expect(source.updatedAt).toEqual(updatedAt);
    });

    it('should use provided optional portalBaseUrl', () => {
      // Arrange
      const data = {
        userId: 'user-123',
        sourceId: 'source-456',
        provider: 'canvas',
        adapterId: 'canvas-v2',
        displayName: 'My Canvas LMS',
        portalBaseUrl: 'https://canvas.example.com',
      };

      // Act
      const source = new IngestSource(data);

      // Assert
      expect(source.portalBaseUrl).toBe('https://canvas.example.com');
    });

    it('should accept ObjectId for userId', () => {
      // Arrange
      const mockUserId = { toString: () => 'user-obj-123' } as unknown as ObjectId;
      const data = {
        userId: mockUserId,
        sourceId: 'source-456',
        provider: 'canvas',
        adapterId: 'canvas-v2',
        displayName: 'My Canvas LMS',
      };

      // Act
      const source = new IngestSource(data);

      // Assert
      expect(source.userId).toBe(mockUserId);
    });

    it('should accept ObjectId for _id', () => {
      // Arrange
      const mockId = { toString: () => 'source-123' } as unknown as ObjectId;
      const data = {
        userId: 'user-123',
        sourceId: 'source-456',
        provider: 'canvas',
        adapterId: 'canvas-v2',
        displayName: 'My Canvas LMS',
      };

      // Act
      const source = new IngestSource(data, mockId);

      // Assert
      expect(source._id).toBe(mockId);
    });

    it('should default schedule to every_6h when omitted', () => {
      const data = {
        userId: 'user-123',
        sourceId: 'source-456',
        provider: 'canvas',
        adapterId: 'canvas-v2',
        displayName: 'My Canvas LMS',
      };
      const source = new IngestSource(data);
      expect(source.schedule).toBe('every_6h');
    });

    it('should use provided schedule', () => {
      const data = {
        userId: 'user-123',
        sourceId: 'source-456',
        provider: 'canvas',
        adapterId: 'canvas-v2',
        displayName: 'My Canvas LMS',
        schedule: 'hourly',
      };
      const source = new IngestSource(data);
      expect(source.schedule).toBe('hourly');
    });

    it('should default dataTypes to empty array when omitted', () => {
      const data = {
        userId: 'user-123',
        sourceId: 'source-456',
        provider: 'canvas',
        adapterId: 'canvas-v2',
        displayName: 'My Canvas LMS',
      };
      const source = new IngestSource(data);
      expect(source.dataTypes).toEqual([]);
    });

    it('should use provided dataTypes', () => {
      const data = {
        userId: 'user-123',
        sourceId: 'source-456',
        provider: 'canvas',
        adapterId: 'canvas-v2',
        displayName: 'My Canvas LMS',
        dataTypes: ['grades', 'assignments', 'calendar'],
      };
      const source = new IngestSource(data);
      expect(source.dataTypes).toEqual(['grades', 'assignments', 'calendar']);
    });

    it('should default enabled to true when omitted', () => {
      const data = {
        userId: 'user-123',
        sourceId: 'source-456',
        provider: 'canvas',
        adapterId: 'canvas-v2',
        displayName: 'My Canvas LMS',
      };
      const source = new IngestSource(data);
      expect(source.enabled).toBe(true);
    });

    it('should use provided enabled', () => {
      const data = {
        userId: 'user-123',
        sourceId: 'source-456',
        provider: 'canvas',
        adapterId: 'canvas-v2',
        displayName: 'My Canvas LMS',
        enabled: false,
      };
      const source = new IngestSource(data);
      expect(source.enabled).toBe(false);
    });
  });
});
