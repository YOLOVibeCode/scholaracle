import { PushDelivery } from './PushDelivery';
import {
  Notification,
  NotificationChannel,
  NotificationPriority,
  AgentType,
} from '@scholaracle/contracts';
import { DeliveryError } from '@scholaracle/contracts';
import type { messaging } from 'firebase-admin';

describe('PushDelivery', () => {
  let pushDelivery: PushDelivery;
  let mockFCM: jest.Mocked<messaging.Messaging>;

  const testConfig = {
    projectId: 'test-project',
  };

  beforeEach(() => {
    mockFCM = {
      send: jest.fn(),
      sendEach: jest.fn(),
      sendMulticast: jest.fn(),
    } as unknown as jest.Mocked<messaging.Messaging>;

    pushDelivery = new PushDelivery(testConfig, mockFCM);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('supports', () => {
    it('should return true for push channel', () => {
      // Act
      const result = pushDelivery.supports(NotificationChannel.PUSH);

      // Assert
      expect(result).toBe(true);
    });

    it('should return false for non-push channels', () => {
      // Act & Assert
      expect(pushDelivery.supports(NotificationChannel.EMAIL)).toBe(false);
      expect(pushDelivery.supports(NotificationChannel.SMS)).toBe(false);
      expect(pushDelivery.supports(NotificationChannel.IN_APP)).toBe(false);
    });
  });

  describe('deliver', () => {
    it('should deliver push notification successfully', async () => {
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

      const messageId = 'fcm-message-id-123';
      mockFCM.send.mockResolvedValue(messageId);

      // Act
      const result = await pushDelivery.deliver(notification);

      // Assert
      expect(result.success).toBe(true);
      expect(result.channel).toBe(NotificationChannel.PUSH);
      expect(result.messageId).toBe(messageId);
      expect(mockFCM.send).toHaveBeenCalledTimes(1);
    });

    it('should include notification title and body in FCM message', async () => {
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

      mockFCM.send.mockResolvedValue('message-id');

      // Act
      await pushDelivery.deliver(notification);

      // Assert
      const callArgs = mockFCM.send.mock.calls[0]?.[0] as {
        notification?: { title?: string; body?: string };
        token?: string;
      };
      expect(callArgs?.notification?.title).toBe(notification.subject);
      expect(callArgs?.notification?.body).toBe(notification.body);
    });

    it('should use userId as FCM token', async () => {
      // Arrange
      const notification = new Notification({
        agentType: AgentType.STUDENT,
        studentId: 'student-123',
        userId: 'fcm-token-abc123',
        subject: 'Test',
        body: 'Test body',
        priority: NotificationPriority.MEDIUM,
        triggerType: 'test',
      });

      mockFCM.send.mockResolvedValue('message-id');

      // Act
      await pushDelivery.deliver(notification);

      // Assert
      const callArgs = mockFCM.send.mock.calls[0]?.[0] as { token?: string };
      expect(callArgs?.token).toBe('fcm-token-abc123');
    });

    it('should set high priority for HIGH and CRITICAL notifications', async () => {
      // Arrange
      const highNotification = new Notification({
        agentType: AgentType.STUDENT,
        studentId: 'student-123',
        userId: 'user-456',
        subject: 'High Priority',
        body: 'Test',
        priority: NotificationPriority.HIGH,
        triggerType: 'test',
      });

      mockFCM.send.mockResolvedValue('message-id');

      // Act
      await pushDelivery.deliver(highNotification);

      // Assert
      const callArgs = mockFCM.send.mock.calls[0]?.[0] as {
        android?: { priority?: string };
        apns?: { headers?: Record<string, string> };
      };
      expect(callArgs?.android?.priority).toBe('high');
      expect(callArgs?.apns?.headers?.['apns-priority']).toBe('10');
    });

    it('should throw DeliveryError when FCM send fails', async () => {
      // Arrange
      const notification = new Notification({
        agentType: AgentType.STUDENT,
        studentId: 'student-123',
        userId: 'invalid-token',
        subject: 'Test',
        body: 'Test body',
        priority: NotificationPriority.HIGH,
        triggerType: 'test',
      });

      const fcmError = new Error('Invalid registration token');
      mockFCM.send.mockRejectedValue(fcmError);

      // Act & Assert
      await expect(pushDelivery.deliver(notification)).rejects.toThrow(DeliveryError);
      await expect(pushDelivery.deliver(notification)).rejects.toThrow(
        expect.objectContaining({
          channel: NotificationChannel.PUSH,
        })
      );
    });

    it('should include notification data payload', async () => {
      // Arrange
      const notification = new Notification({
        agentType: AgentType.STUDENT,
        studentId: 'student-123',
        userId: 'user-456',
        subject: 'Test',
        body: 'Test body',
        priority: NotificationPriority.HIGH,
        triggerType: 'missing_assignment',
        triggerData: { course: 'Math', assignment: 'Homework 5' },
      });

      mockFCM.send.mockResolvedValue('message-id');

      // Act
      await pushDelivery.deliver(notification);

      // Assert
      const callArgs = mockFCM.send.mock.calls[0]?.[0] as {
        data?: Record<string, string>;
      };
      expect(callArgs?.data).toBeDefined();
      expect(callArgs?.data?.['notificationId']).toBe(notification.id);
      expect(callArgs?.data?.['triggerType']).toBe('missing_assignment');
    });

    it('should handle error that is not an Error instance', async () => {
      // Arrange
      const notification = new Notification({
        agentType: AgentType.STUDENT,
        studentId: 'student-123',
        userId: 'invalid-token',
        subject: 'Test',
        body: 'Test body',
        priority: NotificationPriority.HIGH,
        triggerType: 'test',
      });

      const nonErrorObject = { code: 500, message: 'Server error' };
      mockFCM.send.mockRejectedValue(nonErrorObject);

      // Act & Assert
      await expect(pushDelivery.deliver(notification)).rejects.toThrow(DeliveryError);
      await expect(pushDelivery.deliver(notification)).rejects.toThrow(
        'Unknown error occurred during push delivery'
      );
    });
  });
});
