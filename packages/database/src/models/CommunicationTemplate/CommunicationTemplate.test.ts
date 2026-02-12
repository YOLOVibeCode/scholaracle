import { CommunicationTemplate } from './CommunicationTemplate';
import type { ObjectId } from 'mongodb';

describe('CommunicationTemplate', () => {
  describe('constructor', () => {
    it('should create template with required fields', () => {
      // Arrange
      const data = {
        name: 'Welcome Email',
        channel: 'email' as const,
        type: 'notification' as const,
        subject: 'Welcome!',
        content: 'Hello {{name}}, welcome aboard!',
      };

      // Act
      const template = new CommunicationTemplate(data);

      // Assert
      expect(template.name).toBe('Welcome Email');
      expect(template.channel).toBe('email');
      expect(template.type).toBe('notification');
      expect(template.subject).toBe('Welcome!');
      expect(template.content).toBe('Hello {{name}}, welcome aboard!');
    });

    it('should set isActive to true by default', () => {
      // Arrange
      const data = {
        name: 'Test Template',
        channel: 'email' as const,
        type: 'notification' as const,
        subject: 'Test',
        content: 'Test',
      };

      // Act
      const template = new CommunicationTemplate(data);

      // Assert
      expect(template.isActive).toBe(true);
    });

    it('should set createdAt to current date', () => {
      // Arrange
      const before = new Date();
      const data = {
        name: 'Test Template',
        channel: 'email' as const,
        type: 'notification' as const,
        subject: 'Test',
        content: 'Test',
      };

      // Act
      const template = new CommunicationTemplate(data);
      const after = new Date();

      // Assert
      expect(template.createdAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(template.createdAt.getTime()).toBeLessThanOrEqual(after.getTime());
    });

    it('should set updatedAt to current date', () => {
      // Arrange
      const before = new Date();
      const data = {
        name: 'Test Template',
        channel: 'email' as const,
        type: 'notification' as const,
        subject: 'Test',
        content: 'Test',
      };

      // Act
      const template = new CommunicationTemplate(data);
      const after = new Date();

      // Assert
      expect(template.updatedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(template.updatedAt.getTime()).toBeLessThanOrEqual(after.getTime());
    });

    it('should use provided isActive value', () => {
      // Arrange
      const data = {
        name: 'Test Template',
        channel: 'email' as const,
        type: 'notification' as const,
        subject: 'Test',
        content: 'Test',
        isActive: false,
      };

      // Act
      const template = new CommunicationTemplate(data);

      // Assert
      expect(template.isActive).toBe(false);
    });

    it('should use provided createdAt', () => {
      // Arrange
      const createdAt = new Date('2024-01-01');
      const data = {
        name: 'Test Template',
        channel: 'email' as const,
        type: 'notification' as const,
        subject: 'Test',
        content: 'Test',
        createdAt,
      };

      // Act
      const template = new CommunicationTemplate(data);

      // Assert
      expect(template.createdAt).toEqual(createdAt);
    });

    it('should use provided optional fields', () => {
      // Arrange
      const data = {
        name: 'Test Template',
        channel: 'email' as const,
        type: 'notification' as const,
        subject: 'Test',
        content: 'Test',
        createdByAdminId: 'admin-123',
        createdByAdminEmail: 'admin@example.com',
      };

      // Act
      const template = new CommunicationTemplate(data);

      // Assert
      expect(template.createdByAdminId).toBe('admin-123');
      expect(template.createdByAdminEmail).toBe('admin@example.com');
    });

    it('should accept ObjectId for _id', () => {
      // Arrange
      const mockId = { toString: () => 'template-123' } as unknown as ObjectId;
      const data = {
        name: 'Test Template',
        channel: 'email' as const,
        type: 'notification' as const,
        subject: 'Test',
        content: 'Test',
      };

      // Act
      const template = new CommunicationTemplate(data, mockId);

      // Assert
      expect(template._id).toBe(mockId);
    });
  });
});
