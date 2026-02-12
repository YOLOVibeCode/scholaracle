import { CommunicationBatch } from './CommunicationBatch';
import type { ObjectId } from 'mongodb';

describe('CommunicationBatch', () => {
  describe('constructor', () => {
    it('should create batch with required fields', () => {
      // Arrange
      const data = {
        status: 'pending' as const,
        criteria: { role: 'student', emails: ['a@b.com'] },
        channel: 'email' as const,
        type: 'notification' as const,
        subject: 'Welcome',
        content: 'Hello everyone',
        totalRecipients: 50,
      };

      // Act
      const batch = new CommunicationBatch(data);

      // Assert
      expect(batch.status).toBe('pending');
      expect(batch.criteria).toEqual({ role: 'student', emails: ['a@b.com'] });
      expect(batch.channel).toBe('email');
      expect(batch.type).toBe('notification');
      expect(batch.subject).toBe('Welcome');
      expect(batch.content).toBe('Hello everyone');
      expect(batch.totalRecipients).toBe(50);
    });

    it('should set sentCount to 0 by default', () => {
      // Arrange
      const data = {
        status: 'pending' as const,
        criteria: {},
        channel: 'email' as const,
        type: 'notification' as const,
        subject: 'Test',
        content: 'Test',
        totalRecipients: 10,
      };

      // Act
      const batch = new CommunicationBatch(data);

      // Assert
      expect(batch.sentCount).toBe(0);
    });

    it('should set failedCount to 0 by default', () => {
      // Arrange
      const data = {
        status: 'pending' as const,
        criteria: {},
        channel: 'email' as const,
        type: 'notification' as const,
        subject: 'Test',
        content: 'Test',
        totalRecipients: 10,
      };

      // Act
      const batch = new CommunicationBatch(data);

      // Assert
      expect(batch.failedCount).toBe(0);
    });

    it('should set createdAt to current date', () => {
      // Arrange
      const before = new Date();
      const data = {
        status: 'pending' as const,
        criteria: {},
        channel: 'email' as const,
        type: 'notification' as const,
        subject: 'Test',
        content: 'Test',
        totalRecipients: 10,
      };

      // Act
      const batch = new CommunicationBatch(data);
      const after = new Date();

      // Assert
      expect(batch.createdAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(batch.createdAt.getTime()).toBeLessThanOrEqual(after.getTime());
    });

    it('should set updatedAt to current date', () => {
      // Arrange
      const before = new Date();
      const data = {
        status: 'pending' as const,
        criteria: {},
        channel: 'email' as const,
        type: 'notification' as const,
        subject: 'Test',
        content: 'Test',
        totalRecipients: 10,
      };

      // Act
      const batch = new CommunicationBatch(data);
      const after = new Date();

      // Assert
      expect(batch.updatedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(batch.updatedAt.getTime()).toBeLessThanOrEqual(after.getTime());
    });

    it('should use provided createdAt', () => {
      // Arrange
      const createdAt = new Date('2024-01-01');
      const data = {
        status: 'pending' as const,
        criteria: {},
        channel: 'email' as const,
        type: 'notification' as const,
        subject: 'Test',
        content: 'Test',
        totalRecipients: 10,
        createdAt,
      };

      // Act
      const batch = new CommunicationBatch(data);

      // Assert
      expect(batch.createdAt).toEqual(createdAt);
    });

    it('should use provided sentCount and failedCount', () => {
      // Arrange
      const data = {
        status: 'completed' as const,
        criteria: {},
        channel: 'email' as const,
        type: 'notification' as const,
        subject: 'Test',
        content: 'Test',
        totalRecipients: 100,
        sentCount: 95,
        failedCount: 5,
      };

      // Act
      const batch = new CommunicationBatch(data);

      // Assert
      expect(batch.sentCount).toBe(95);
      expect(batch.failedCount).toBe(5);
    });

    it('should use provided optional fields', () => {
      // Arrange
      const data = {
        status: 'completed' as const,
        criteria: {},
        channel: 'email' as const,
        type: 'notification' as const,
        subject: 'Test',
        content: 'Test',
        totalRecipients: 10,
        templateId: 'tmpl-123',
        templateName: 'Welcome Template',
        createdByAdminId: 'admin-123',
        createdByAdminEmail: 'admin@example.com',
        startedAt: new Date('2024-01-01T10:00:00Z'),
        completedAt: new Date('2024-01-01T10:05:00Z'),
      };

      // Act
      const batch = new CommunicationBatch(data);

      // Assert
      expect(batch.templateId).toBe('tmpl-123');
      expect(batch.templateName).toBe('Welcome Template');
      expect(batch.createdByAdminId).toBe('admin-123');
      expect(batch.createdByAdminEmail).toBe('admin@example.com');
      expect(batch.startedAt).toEqual(new Date('2024-01-01T10:00:00Z'));
      expect(batch.completedAt).toEqual(new Date('2024-01-01T10:05:00Z'));
    });

    it('should accept ObjectId for _id', () => {
      // Arrange
      const mockId = { toString: () => 'batch-123' } as unknown as ObjectId;
      const data = {
        status: 'pending' as const,
        criteria: {},
        channel: 'email' as const,
        type: 'notification' as const,
        subject: 'Test',
        content: 'Test',
        totalRecipients: 10,
      };

      // Act
      const batch = new CommunicationBatch(data, mockId);

      // Assert
      expect(batch._id).toBe(mockId);
    });
  });
});
