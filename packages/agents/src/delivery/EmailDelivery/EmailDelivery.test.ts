import { EmailDelivery } from './EmailDelivery';
import {
  Notification,
  NotificationChannel,
  NotificationPriority,
  AgentType,
} from '@scholaracle/contracts';
import { DeliveryError } from '@scholaracle/contracts';
import type { MailService } from '@sendgrid/mail';

describe('EmailDelivery', () => {
  let emailDelivery: EmailDelivery;
  let mockSendGrid: jest.Mocked<MailService>;

  const testConfig = {
    apiKey: 'test-api-key',
    fromEmail: 'notifications@scholaracle.com',
    fromName: 'Scholaracle',
  };

  beforeEach(() => {
    mockSendGrid = {
      setApiKey: jest.fn(),
      send: jest.fn(),
    } as unknown as jest.Mocked<MailService>;

    emailDelivery = new EmailDelivery(testConfig, mockSendGrid);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('supports', () => {
    it('should return true for email channel', () => {
      // Act
      const result = emailDelivery.supports(NotificationChannel.EMAIL);

      // Assert
      expect(result).toBe(true);
    });

    it('should return false for non-email channels', () => {
      // Act & Assert
      expect(emailDelivery.supports(NotificationChannel.PUSH)).toBe(false);
      expect(emailDelivery.supports(NotificationChannel.SMS)).toBe(false);
      expect(emailDelivery.supports(NotificationChannel.IN_APP)).toBe(false);
    });
  });

  describe('deliver', () => {
    it('should deliver email notification successfully', async () => {
      // Arrange
      const notification = new Notification({
        agentType: AgentType.STUDENT,
        studentId: 'student-123',
        userId: 'user-456',
        subject: 'Test Subject',
        body: 'Test body content',
        priority: NotificationPriority.HIGH,
        triggerType: 'missing_assignment',
      });

      mockSendGrid.send.mockResolvedValue([
        {
          statusCode: 202,
          body: {},
          headers: {},
        },
        {},
      ]);

      // Act
      const result = await emailDelivery.deliver(notification);

      // Assert
      expect(result.success).toBe(true);
      expect(result.channel).toBe(NotificationChannel.EMAIL);
      expect(mockSendGrid.send).toHaveBeenCalledTimes(1);
      expect(mockSendGrid.send).toHaveBeenCalledWith({
        to: 'user-456',
        from: {
          email: testConfig.fromEmail,
          name: testConfig.fromName,
        },
        subject: notification.subject,
        text: notification.body,
        html: expect.stringContaining(notification.body),
      });
    });

    it('should include messageId when SendGrid returns one', async () => {
      // Arrange
      const notification = new Notification({
        agentType: AgentType.STUDENT,
        studentId: 'student-123',
        userId: 'user-456',
        subject: 'Test Subject',
        body: 'Test body',
        priority: NotificationPriority.HIGH,
        triggerType: 'test',
      });

      const messageId = 'sg-message-id-123';
      mockSendGrid.send.mockResolvedValue([
        {
          statusCode: 202,
          body: { message_id: messageId },
          headers: {},
        },
        {},
      ]);

      // Act
      const result = await emailDelivery.deliver(notification);

      // Assert
      expect(result.messageId).toBe(messageId);
    });

    it('should throw DeliveryError when SendGrid API fails', async () => {
      // Arrange
      const notification = new Notification({
        agentType: AgentType.STUDENT,
        studentId: 'student-123',
        userId: 'user-456',
        subject: 'Test Subject',
        body: 'Test body',
        priority: NotificationPriority.HIGH,
        triggerType: 'test',
      });

      const apiError = {
        response: {
          status: 400,
          body: {
            errors: [{ message: 'Invalid email address' }],
          },
        },
      };

      mockSendGrid.send.mockRejectedValue(apiError);

      // Act & Assert
      await expect(emailDelivery.deliver(notification)).rejects.toThrow(DeliveryError);
      await expect(emailDelivery.deliver(notification)).rejects.toThrow(
        expect.objectContaining({
          channel: NotificationChannel.EMAIL,
        })
      );
    });

    it('should throw DeliveryError when SendGrid returns non-202 status', async () => {
      // Arrange
      const notification = new Notification({
        agentType: AgentType.STUDENT,
        studentId: 'student-123',
        userId: 'user-456',
        subject: 'Test Subject',
        body: 'Test body',
        priority: NotificationPriority.HIGH,
        triggerType: 'test',
      });

      mockSendGrid.send.mockResolvedValue([
        {
          statusCode: 500,
          body: { error: 'Internal server error' },
          headers: {},
        },
        {},
      ]);

      // Act & Assert
      await expect(emailDelivery.deliver(notification)).rejects.toThrow(DeliveryError);
    });

    it('should format HTML email body correctly', async () => {
      // Arrange
      const notification = new Notification({
        agentType: AgentType.PARENT,
        studentId: 'student-123',
        userId: 'parent-456',
        subject: 'Grade Drop Alert',
        body: 'John Doe - Math grade dropped from 92% to 85%',
        priority: NotificationPriority.HIGH,
        triggerType: 'grade_drop',
      });

      mockSendGrid.send.mockResolvedValue([
        {
          statusCode: 202,
          body: {},
          headers: {},
        },
        {},
      ]);

      // Act
      await emailDelivery.deliver(notification);

      // Assert
      const callArgs = mockSendGrid.send.mock.calls[0]?.[0] as {
        html?: string;
        to?: string;
      };
      expect(callArgs?.html).toBeDefined();
      expect(callArgs?.html).toContain('John Doe');
      expect(callArgs?.html).toContain('92%');
      expect(callArgs?.html).toContain('85%');
    });

    it('should use userId as recipient email', async () => {
      // Arrange
      const notification = new Notification({
        agentType: AgentType.STUDENT,
        studentId: 'student-123',
        userId: 'student@example.com',
        subject: 'Test',
        body: 'Test body',
        priority: NotificationPriority.MEDIUM,
        triggerType: 'test',
      });

      mockSendGrid.send.mockResolvedValue([
        {
          statusCode: 202,
          body: {},
          headers: {},
        },
        {},
      ]);

      // Act
      await emailDelivery.deliver(notification);

      // Assert
      const callArgs = mockSendGrid.send.mock.calls[0]?.[0] as {
        to?: string;
      };
      expect(callArgs?.to).toBe('student@example.com');
    });

    it('should handle error without response object', async () => {
      // Arrange
      const notification = new Notification({
        agentType: AgentType.STUDENT,
        studentId: 'student-123',
        userId: 'user-456',
        subject: 'Test',
        body: 'Test body',
        priority: NotificationPriority.HIGH,
        triggerType: 'test',
      });

      const errorWithoutResponse = new Error('Network error');
      mockSendGrid.send.mockRejectedValue(errorWithoutResponse);

      // Act & Assert
      await expect(emailDelivery.deliver(notification)).rejects.toThrow(DeliveryError);
      await expect(emailDelivery.deliver(notification)).rejects.toThrow('Network error');
    });

    it('should handle error with response object missing status or body', async () => {
      // Arrange
      const notification = new Notification({
        agentType: AgentType.STUDENT,
        studentId: 'student-123',
        userId: 'user-456',
        subject: 'Test',
        body: 'Test body',
        priority: NotificationPriority.HIGH,
        triggerType: 'test',
      });

      const errorWithPartialResponse = {
        response: {
          // Missing status and body properties
        },
      };
      mockSendGrid.send.mockRejectedValue(errorWithPartialResponse);

      // Act & Assert
      await expect(emailDelivery.deliver(notification)).rejects.toThrow(DeliveryError);
    });
  });
});
