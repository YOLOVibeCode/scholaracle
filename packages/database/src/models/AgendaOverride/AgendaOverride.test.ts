import { AgendaOverride } from './AgendaOverride';
import type { ObjectId } from 'mongodb';

describe('AgendaOverride', () => {
  describe('constructor', () => {
    it('should create agenda override with required fields', () => {
      // Arrange
      const snoozedUntil = new Date('2024-06-01');
      const data = {
        userId: 'user-123',
        itemType: 'assignment' as const,
        itemKey: 'series-abc-20240601',
        scope: 'occurrence' as const,
        snoozedUntil,
      };

      // Act
      const override = new AgendaOverride(data);

      // Assert
      expect(override.userId).toBe('user-123');
      expect(override.itemType).toBe('assignment');
      expect(override.itemKey).toBe('series-abc-20240601');
      expect(override.scope).toBe('occurrence');
      expect(override.snoozedUntil).toEqual(snoozedUntil);
    });

    it('should set createdAt to current date', () => {
      // Arrange
      const before = new Date();
      const data = {
        userId: 'user-123',
        itemType: 'assignment' as const,
        itemKey: 'series-abc-20240601',
        scope: 'occurrence' as const,
        snoozedUntil: new Date('2024-06-01'),
      };

      // Act
      const override = new AgendaOverride(data);
      const after = new Date();

      // Assert
      expect(override.createdAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(override.createdAt.getTime()).toBeLessThanOrEqual(after.getTime());
    });

    it('should set updatedAt to current date', () => {
      // Arrange
      const before = new Date();
      const data = {
        userId: 'user-123',
        itemType: 'event_occurrence' as const,
        itemKey: 'event-xyz-20240601',
        scope: 'series' as const,
        snoozedUntil: new Date('2024-06-01'),
      };

      // Act
      const override = new AgendaOverride(data);
      const after = new Date();

      // Assert
      expect(override.updatedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(override.updatedAt.getTime()).toBeLessThanOrEqual(after.getTime());
    });

    it('should use provided createdAt and updatedAt', () => {
      // Arrange
      const createdAt = new Date('2024-01-01');
      const updatedAt = new Date('2024-03-15');
      const data = {
        userId: 'user-123',
        itemType: 'assignment' as const,
        itemKey: 'series-abc-20240601',
        scope: 'occurrence' as const,
        snoozedUntil: new Date('2024-06-01'),
        createdAt,
        updatedAt,
      };

      // Act
      const override = new AgendaOverride(data);

      // Assert
      expect(override.createdAt).toEqual(createdAt);
      expect(override.updatedAt).toEqual(updatedAt);
    });

    it('should accept ObjectId for userId', () => {
      // Arrange
      const mockUserId = { toString: () => 'user-obj-123' } as unknown as ObjectId;
      const data = {
        userId: mockUserId,
        itemType: 'assignment' as const,
        itemKey: 'series-abc-20240601',
        scope: 'occurrence' as const,
        snoozedUntil: new Date('2024-06-01'),
      };

      // Act
      const override = new AgendaOverride(data);

      // Assert
      expect(override.userId).toBe(mockUserId);
    });

    it('should accept ObjectId for _id', () => {
      // Arrange
      const mockId = { toString: () => 'override-123' } as unknown as ObjectId;
      const data = {
        userId: 'user-123',
        itemType: 'assignment' as const,
        itemKey: 'series-abc-20240601',
        scope: 'occurrence' as const,
        snoozedUntil: new Date('2024-06-01'),
      };

      // Act
      const override = new AgendaOverride(data, mockId);

      // Assert
      expect(override._id).toBe(mockId);
    });

    it('should support event_occurrence item type', () => {
      // Arrange
      const data = {
        userId: 'user-123',
        itemType: 'event_occurrence' as const,
        itemKey: 'event-xyz-20240601',
        scope: 'series' as const,
        snoozedUntil: new Date('2024-06-01'),
      };

      // Act
      const override = new AgendaOverride(data);

      // Assert
      expect(override.itemType).toBe('event_occurrence');
      expect(override.scope).toBe('series');
    });
  });
});
