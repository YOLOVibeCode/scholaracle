import { CommunicationLog } from './CommunicationLog';
import type { ObjectId } from 'mongodb';

describe('CommunicationLog', () => {
  describe('constructor', () => {
    it('should create log with required fields', () => {
      // Arrange
      const data = {
        userId: 'user-123',
        channel: 'email' as const,
        type: 'notification' as const,
        content: 'Your order has shipped',
        status: 'sent' as const,
        triggeredBy: 'system' as const,
      };

      // Act
      const log = new CommunicationLog(data);

      // Assert
      expect(log.userId).toBe('user-123');
      expect(log.channel).toBe('email');
      expect(log.type).toBe('notification');
      expect(log.content).toBe('Your order has shipped');
      expect(log.status).toBe('sent');
      expect(log.triggeredBy).toBe('system');
    });

    it('should set providerResponse to empty object by default', () => {
      // Arrange
      const data = {
        userId: 'user-123',
        channel: 'email' as const,
        type: 'notification' as const,
        content: 'Test',
        status: 'sent' as const,
        triggeredBy: 'system' as const,
      };

      // Act
      const log = new CommunicationLog(data);

      // Assert
      expect(log.providerResponse).toEqual({});
    });

    it('should set createdAt to current date', () => {
      // Arrange
      const before = new Date();
      const data = {
        userId: 'user-123',
        channel: 'email' as const,
        type: 'notification' as const,
        content: 'Test',
        status: 'sent' as const,
        triggeredBy: 'system' as const,
      };

      // Act
      const log = new CommunicationLog(data);
      const after = new Date();

      // Assert
      expect(log.createdAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(log.createdAt.getTime()).toBeLessThanOrEqual(after.getTime());
    });

    it('should use provided createdAt', () => {
      // Arrange
      const createdAt = new Date('2024-01-01');
      const data = {
        userId: 'user-123',
        channel: 'email' as const,
        type: 'notification' as const,
        content: 'Test',
        status: 'sent' as const,
        triggeredBy: 'system' as const,
        createdAt,
      };

      // Act
      const log = new CommunicationLog(data);

      // Assert
      expect(log.createdAt).toEqual(createdAt);
    });

    it('should use provided providerResponse', () => {
      // Arrange
      const providerResponse = { messageId: 'msg-456', provider: 'sendgrid' };
      const data = {
        userId: 'user-123',
        channel: 'email' as const,
        type: 'notification' as const,
        content: 'Test',
        status: 'sent' as const,
        triggeredBy: 'system' as const,
        providerResponse,
      };

      // Act
      const log = new CommunicationLog(data);

      // Assert
      expect(log.providerResponse).toEqual(providerResponse);
    });

    it('should use provided optional fields', () => {
      // Arrange
      const data = {
        userId: 'user-123',
        channel: 'email' as const,
        type: 'support' as const,
        content: 'Test',
        status: 'delivered' as const,
        triggeredBy: 'admin' as const,
        subject: 'Important Update',
        templateId: 'tmpl-123',
        templateName: 'Update Template',
        recipientEmail: 'user@example.com',
        recipientPhone: '+1234567890',
        sentAt: new Date('2024-01-01T10:00:00Z'),
        deliveredAt: new Date('2024-01-01T10:01:00Z'),
        openedAt: new Date('2024-01-01T11:00:00Z'),
        clickedAt: new Date('2024-01-01T11:05:00Z'),
        adminUserId: 'admin-123',
        relatedEntityType: 'order',
        relatedEntityId: 'order-456',
        providerId: 'provider-789',
      };

      // Act
      const log = new CommunicationLog(data);

      // Assert
      expect(log.subject).toBe('Important Update');
      expect(log.templateId).toBe('tmpl-123');
      expect(log.templateName).toBe('Update Template');
      expect(log.recipientEmail).toBe('user@example.com');
      expect(log.recipientPhone).toBe('+1234567890');
      expect(log.sentAt).toEqual(new Date('2024-01-01T10:00:00Z'));
      expect(log.deliveredAt).toEqual(new Date('2024-01-01T10:01:00Z'));
      expect(log.openedAt).toEqual(new Date('2024-01-01T11:00:00Z'));
      expect(log.clickedAt).toEqual(new Date('2024-01-01T11:05:00Z'));
      expect(log.adminUserId).toBe('admin-123');
      expect(log.relatedEntityType).toBe('order');
      expect(log.relatedEntityId).toBe('order-456');
      expect(log.providerId).toBe('provider-789');
    });

    it('should use provided failure fields', () => {
      // Arrange
      const data = {
        userId: 'user-123',
        channel: 'email' as const,
        type: 'notification' as const,
        content: 'Test',
        status: 'failed' as const,
        triggeredBy: 'system' as const,
        failedAt: new Date('2024-01-01T10:00:00Z'),
        failureReason: 'Invalid email address',
      };

      // Act
      const log = new CommunicationLog(data);

      // Assert
      expect(log.failedAt).toEqual(new Date('2024-01-01T10:00:00Z'));
      expect(log.failureReason).toBe('Invalid email address');
    });

    it('should accept ObjectId for _id', () => {
      // Arrange
      const mockId = { toString: () => 'log-123' } as unknown as ObjectId;
      const data = {
        userId: 'user-123',
        channel: 'email' as const,
        type: 'notification' as const,
        content: 'Test',
        status: 'sent' as const,
        triggeredBy: 'system' as const,
      };

      // Act
      const log = new CommunicationLog(data, mockId);

      // Assert
      expect(log._id).toBe(mockId);
    });
  });

  describe('wasDelivered', () => {
    it('should return true for delivered status', () => {
      const log = new CommunicationLog({
        userId: 'user-123',
        channel: 'email',
        type: 'notification',
        content: 'Test',
        status: 'delivered',
        triggeredBy: 'system',
      });
      expect(log.wasDelivered()).toBe(true);
    });

    it('should return true for opened status', () => {
      const log = new CommunicationLog({
        userId: 'user-123',
        channel: 'email',
        type: 'notification',
        content: 'Test',
        status: 'opened',
        triggeredBy: 'system',
      });
      expect(log.wasDelivered()).toBe(true);
    });

    it('should return true for clicked status', () => {
      const log = new CommunicationLog({
        userId: 'user-123',
        channel: 'email',
        type: 'notification',
        content: 'Test',
        status: 'clicked',
        triggeredBy: 'system',
      });
      expect(log.wasDelivered()).toBe(true);
    });

    it('should return false for pending status', () => {
      const log = new CommunicationLog({
        userId: 'user-123',
        channel: 'email',
        type: 'notification',
        content: 'Test',
        status: 'pending',
        triggeredBy: 'system',
      });
      expect(log.wasDelivered()).toBe(false);
    });

    it('should return false for failed status', () => {
      const log = new CommunicationLog({
        userId: 'user-123',
        channel: 'email',
        type: 'notification',
        content: 'Test',
        status: 'failed',
        triggeredBy: 'system',
      });
      expect(log.wasDelivered()).toBe(false);
    });
  });

  describe('hasFailed', () => {
    it('should return true for failed status', () => {
      const log = new CommunicationLog({
        userId: 'user-123',
        channel: 'email',
        type: 'notification',
        content: 'Test',
        status: 'failed',
        triggeredBy: 'system',
      });
      expect(log.hasFailed()).toBe(true);
    });

    it('should return true for bounced status', () => {
      const log = new CommunicationLog({
        userId: 'user-123',
        channel: 'email',
        type: 'notification',
        content: 'Test',
        status: 'bounced',
        triggeredBy: 'system',
      });
      expect(log.hasFailed()).toBe(true);
    });

    it('should return false for sent status', () => {
      const log = new CommunicationLog({
        userId: 'user-123',
        channel: 'email',
        type: 'notification',
        content: 'Test',
        status: 'sent',
        triggeredBy: 'system',
      });
      expect(log.hasFailed()).toBe(false);
    });
  });

  describe('wasOpened', () => {
    it('should return true for opened status', () => {
      const log = new CommunicationLog({
        userId: 'user-123',
        channel: 'email',
        type: 'notification',
        content: 'Test',
        status: 'opened',
        triggeredBy: 'system',
      });
      expect(log.wasOpened()).toBe(true);
    });

    it('should return true for clicked status', () => {
      const log = new CommunicationLog({
        userId: 'user-123',
        channel: 'email',
        type: 'notification',
        content: 'Test',
        status: 'clicked',
        triggeredBy: 'system',
      });
      expect(log.wasOpened()).toBe(true);
    });

    it('should return false for delivered status', () => {
      const log = new CommunicationLog({
        userId: 'user-123',
        channel: 'email',
        type: 'notification',
        content: 'Test',
        status: 'delivered',
        triggeredBy: 'system',
      });
      expect(log.wasOpened()).toBe(false);
    });
  });

  describe('getChannelDisplayName', () => {
    it('should return "Email" for email channel', () => {
      const log = new CommunicationLog({
        userId: 'user-123',
        channel: 'email',
        type: 'notification',
        content: 'Test',
        status: 'sent',
        triggeredBy: 'system',
      });
      expect(log.getChannelDisplayName()).toBe('Email');
    });

    it('should return "SMS" for sms channel', () => {
      const log = new CommunicationLog({
        userId: 'user-123',
        channel: 'sms',
        type: 'notification',
        content: 'Test',
        status: 'sent',
        triggeredBy: 'system',
      });
      expect(log.getChannelDisplayName()).toBe('SMS');
    });

    it('should return "Push Notification" for push channel', () => {
      const log = new CommunicationLog({
        userId: 'user-123',
        channel: 'push',
        type: 'notification',
        content: 'Test',
        status: 'sent',
        triggeredBy: 'system',
      });
      expect(log.getChannelDisplayName()).toBe('Push Notification');
    });

    it('should return "In-App" for in_app channel', () => {
      const log = new CommunicationLog({
        userId: 'user-123',
        channel: 'in_app',
        type: 'notification',
        content: 'Test',
        status: 'sent',
        triggeredBy: 'system',
      });
      expect(log.getChannelDisplayName()).toBe('In-App');
    });

    it('should return "Phone Call" for phone channel', () => {
      const log = new CommunicationLog({
        userId: 'user-123',
        channel: 'phone',
        type: 'notification',
        content: 'Test',
        status: 'sent',
        triggeredBy: 'system',
      });
      expect(log.getChannelDisplayName()).toBe('Phone Call');
    });

    it('should return "Support Ticket" for support_ticket channel', () => {
      const log = new CommunicationLog({
        userId: 'user-123',
        channel: 'support_ticket',
        type: 'notification',
        content: 'Test',
        status: 'sent',
        triggeredBy: 'system',
      });
      expect(log.getChannelDisplayName()).toBe('Support Ticket');
    });
  });
});
