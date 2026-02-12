import { AdminNote } from './AdminNote';
import type { ObjectId } from 'mongodb';

describe('AdminNote', () => {
  describe('constructor', () => {
    it('should create admin note with required fields', () => {
      // Arrange
      const data = {
        userId: 'user-123',
        adminUserId: 'admin-456',
        content: 'Customer requested a billing adjustment',
        category: 'billing' as const,
      };

      // Act
      const note = new AdminNote(data);

      // Assert
      expect(note.userId).toBe('user-123');
      expect(note.adminUserId).toBe('admin-456');
      expect(note.content).toBe('Customer requested a billing adjustment');
      expect(note.category).toBe('billing');
    });

    it('should set isInternal to true by default', () => {
      // Arrange
      const data = {
        userId: 'user-123',
        adminUserId: 'admin-456',
        content: 'Test note',
        category: 'general' as const,
      };

      // Act
      const note = new AdminNote(data);

      // Assert
      expect(note.isInternal).toBe(true);
    });

    it('should set isPinned to false by default', () => {
      // Arrange
      const data = {
        userId: 'user-123',
        adminUserId: 'admin-456',
        content: 'Test note',
        category: 'general' as const,
      };

      // Act
      const note = new AdminNote(data);

      // Assert
      expect(note.isPinned).toBe(false);
    });

    it('should set createdAt to current date', () => {
      // Arrange
      const before = new Date();
      const data = {
        userId: 'user-123',
        adminUserId: 'admin-456',
        content: 'Test note',
        category: 'general' as const,
      };

      // Act
      const note = new AdminNote(data);
      const after = new Date();

      // Assert
      expect(note.createdAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(note.createdAt.getTime()).toBeLessThanOrEqual(after.getTime());
    });

    it('should set updatedAt to current date', () => {
      // Arrange
      const before = new Date();
      const data = {
        userId: 'user-123',
        adminUserId: 'admin-456',
        content: 'Test note',
        category: 'general' as const,
      };

      // Act
      const note = new AdminNote(data);
      const after = new Date();

      // Assert
      expect(note.updatedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(note.updatedAt.getTime()).toBeLessThanOrEqual(after.getTime());
    });

    it('should use provided isInternal value', () => {
      // Arrange
      const data = {
        userId: 'user-123',
        adminUserId: 'admin-456',
        content: 'Test note',
        category: 'support' as const,
        isInternal: false,
      };

      // Act
      const note = new AdminNote(data);

      // Assert
      expect(note.isInternal).toBe(false);
    });

    it('should use provided isPinned value', () => {
      // Arrange
      const data = {
        userId: 'user-123',
        adminUserId: 'admin-456',
        content: 'Test note',
        category: 'technical' as const,
        isPinned: true,
      };

      // Act
      const note = new AdminNote(data);

      // Assert
      expect(note.isPinned).toBe(true);
    });

    it('should use provided createdAt and updatedAt', () => {
      // Arrange
      const createdAt = new Date('2024-01-01');
      const updatedAt = new Date('2024-06-01');
      const data = {
        userId: 'user-123',
        adminUserId: 'admin-456',
        content: 'Test note',
        category: 'compliance' as const,
        createdAt,
        updatedAt,
      };

      // Act
      const note = new AdminNote(data);

      // Assert
      expect(note.createdAt).toEqual(createdAt);
      expect(note.updatedAt).toEqual(updatedAt);
    });

    it('should use provided adminName', () => {
      // Arrange
      const data = {
        userId: 'user-123',
        adminUserId: 'admin-456',
        adminName: 'John Admin',
        content: 'Test note',
        category: 'general' as const,
      };

      // Act
      const note = new AdminNote(data);

      // Assert
      expect(note.adminName).toBe('John Admin');
    });

    it('should leave adminName undefined when not provided', () => {
      // Arrange
      const data = {
        userId: 'user-123',
        adminUserId: 'admin-456',
        content: 'Test note',
        category: 'general' as const,
      };

      // Act
      const note = new AdminNote(data);

      // Assert
      expect(note.adminName).toBeUndefined();
    });

    it('should accept ObjectId for _id', () => {
      // Arrange
      const mockId = { toString: () => 'note-123' } as unknown as ObjectId;
      const data = {
        userId: 'user-123',
        adminUserId: 'admin-456',
        content: 'Test note',
        category: 'general' as const,
      };

      // Act
      const note = new AdminNote(data, mockId);

      // Assert
      expect(note._id).toBe(mockId);
    });
  });
});
