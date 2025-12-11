import { SMSDelivery } from './SMSDelivery';
import {
  Notification,
  NotificationChannel,
  NotificationPriority,
  AgentType,
} from '@scholaracle/contracts';
import { DeliveryError } from '@scholaracle/contracts';
import type { Twilio } from 'twilio';

describe('SMSDelivery', () => {
  let smsDelivery: SMSDelivery;
  let mockTwilio: {
    messages: {
      create: jest.Mock;
    };
  };

  const testConfig = {
    accountSid: 'test-account-sid',
    authToken: 'test-auth-token',
    fromNumber: '+15551234567',
  };

  beforeEach(() => {
    mockTwilio = {
      messages: {
        create: jest.fn(),
      },
    };

    smsDelivery = new SMSDelivery(testConfig, mockTwilio as unknown as Twilio);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('supports', () => {
    it('should return true for SMS channel', () => {
      // Act
      const result = smsDelivery.supports(NotificationChannel.SMS);

      // Assert
      expect(result).toBe(true);
    });

    it('should return false for non-SMS channels', () => {
      // Act & Assert
      expect(smsDelivery.supports(NotificationChannel.EMAIL)).toBe(false);
      expect(smsDelivery.supports(NotificationChannel.PUSH)).toBe(false);
      expect(smsDelivery.supports(NotificationChannel.IN_APP)).toBe(false);
    });
  });

  describe('deliver', () => {
    it('should deliver SMS notification successfully', async () => {
      // Arrange
      const notification = new Notification({
        agentType: AgentType.STUDENT,
        studentId: 'student-123',
        userId: '+15559876543',
        subject: 'MISSING ASSIGNMENT',
        body: 'Math: Homework 5\nDue: 2 days ago\nValue: 25 points\n\nSubmit immediately.',
        priority: NotificationPriority.HIGH,
        triggerType: 'missing_assignment',
      });

      const messageSid = 'SM1234567890abcdef';
      mockTwilio.messages.create.mockResolvedValue({
        sid: messageSid,
        status: 'queued',
        to: notification.userId,
        from: testConfig.fromNumber,
        body: notification.body,
      } as unknown as Awaited<ReturnType<typeof mockTwilio.messages.create>>);

      // Act
      const result = await smsDelivery.deliver(notification);

      // Assert
      expect(result.success).toBe(true);
      expect(result.channel).toBe(NotificationChannel.SMS);
      expect(result.messageId).toBe(messageSid);
      expect(mockTwilio.messages.create).toHaveBeenCalledTimes(1);
      const callArgs = mockTwilio.messages.create.mock.calls[0]?.[0] as {
        to?: string;
        from?: string;
        body?: string;
      };
      expect(callArgs?.to).toBe(notification.userId);
      expect(callArgs?.from).toBe(testConfig.fromNumber);
      expect(callArgs?.body).toBeDefined();
    });

    it('should format SMS body with subject prefix', async () => {
      // Arrange
      const notification = new Notification({
        agentType: AgentType.PARENT,
        studentId: 'student-123',
        userId: '+15559876543',
        subject: 'John Doe - Grade Drop Alert',
        body: 'Math grade dropped from 92% to 85%',
        priority: NotificationPriority.HIGH,
        triggerType: 'grade_drop',
      });

      mockTwilio.messages.create.mockResolvedValue({
        sid: 'SM123',
        status: 'queued',
      } as unknown as Awaited<ReturnType<typeof mockTwilio.messages.create>>);

      // Act
      await smsDelivery.deliver(notification);

      // Assert
      const callArgs = mockTwilio.messages.create.mock.calls[0]?.[0] as {
        body?: string;
      };
      if (callArgs?.body) {
        expect(callArgs.body).toContain(notification.subject);
        expect(callArgs.body).toContain(notification.body);
      }
    });

    it('should truncate body if exceeds SMS length limit', async () => {
      // Arrange
      const longBody = 'A'.repeat(2000);
      const notification = new Notification({
        agentType: AgentType.STUDENT,
        studentId: 'student-123',
        userId: '+15559876543',
        subject: 'Test',
        body: longBody,
        priority: NotificationPriority.MEDIUM,
        triggerType: 'test',
      });

      mockTwilio.messages.create.mockResolvedValue({
        sid: 'SM123',
        status: 'queued',
      } as unknown as Awaited<ReturnType<typeof mockTwilio.messages.create>>);

      // Act
      await smsDelivery.deliver(notification);

      // Assert
      const callArgs = mockTwilio.messages.create.mock.calls[0]?.[0] as {
        body?: string;
      };
      expect(callArgs?.body?.length).toBeLessThanOrEqual(1600);
    });

    it('should use userId as recipient phone number', async () => {
      // Arrange
      const notification = new Notification({
        agentType: AgentType.STUDENT,
        studentId: 'student-123',
        userId: '+15551234567',
        subject: 'Test',
        body: 'Test body',
        priority: NotificationPriority.MEDIUM,
        triggerType: 'test',
      });

      mockTwilio.messages.create.mockResolvedValue({
        sid: 'SM123',
        status: 'queued',
      } as unknown as Awaited<ReturnType<typeof mockTwilio.messages.create>>);

      // Act
      await smsDelivery.deliver(notification);

      // Assert
      const callArgs = mockTwilio.messages.create.mock.calls[0]?.[0] as {
        to?: string;
      };
      expect(callArgs?.to).toBe('+15551234567');
    });

    it('should throw DeliveryError when Twilio API fails', async () => {
      // Arrange
      const notification = new Notification({
        agentType: AgentType.STUDENT,
        studentId: 'student-123',
        userId: '+15551234567',
        subject: 'Test',
        body: 'Test body',
        priority: NotificationPriority.HIGH,
        triggerType: 'test',
      });

      const twilioError = new Error('Invalid phone number');
      mockTwilio.messages.create.mockRejectedValue(twilioError);

      // Act & Assert
      await expect(smsDelivery.deliver(notification)).rejects.toThrow(DeliveryError);
      await expect(smsDelivery.deliver(notification)).rejects.toThrow(
        expect.objectContaining({
          channel: NotificationChannel.SMS,
        })
      );
    });

    it('should handle Twilio error response format', async () => {
      // Arrange
      const notification = new Notification({
        agentType: AgentType.STUDENT,
        studentId: 'student-123',
        userId: '+15551234567',
        subject: 'Test',
        body: 'Test body',
        priority: NotificationPriority.HIGH,
        triggerType: 'test',
      });

      const twilioError = {
        code: 21211,
        message: "Invalid 'To' Phone Number",
        status: 400,
      };
      mockTwilio.messages.create.mockRejectedValue(twilioError);

      // Act & Assert
      await expect(smsDelivery.deliver(notification)).rejects.toThrow(DeliveryError);
    });

    it('should handle error without message property', async () => {
      // Arrange
      const notification = new Notification({
        agentType: AgentType.STUDENT,
        studentId: 'student-123',
        userId: '+15551234567',
        subject: 'Test',
        body: 'Test body',
        priority: NotificationPriority.HIGH,
        triggerType: 'test',
      });

      const errorWithoutMessage = { code: 500 };
      mockTwilio.messages.create.mockRejectedValue(errorWithoutMessage);

      // Act & Assert
      await expect(smsDelivery.deliver(notification)).rejects.toThrow(DeliveryError);
      await expect(smsDelivery.deliver(notification)).rejects.toThrow(
        'Unknown error occurred during SMS delivery'
      );
    });
  });
});
