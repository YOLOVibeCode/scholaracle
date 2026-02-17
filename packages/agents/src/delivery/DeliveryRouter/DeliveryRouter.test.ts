import { DeliveryRouter } from './DeliveryRouter';
import { EmailDelivery } from '../EmailDelivery';
import { PushDelivery } from '../PushDelivery';
import { SMSDelivery } from '../SMSDelivery';
import {
  Notification,
  NotificationChannel,
  NotificationPriority,
  AgentType,
  DeliveryError,
} from '@scholaracle/contracts';

describe('DeliveryRouter', () => {
  let deliveryRouter: DeliveryRouter;
  let mockEmailDelivery: jest.Mocked<EmailDelivery>;
  let mockPushDelivery: jest.Mocked<PushDelivery>;
  let mockSmsDelivery: jest.Mocked<SMSDelivery>;

  beforeEach(() => {
    mockEmailDelivery = {
      supports: jest.fn(),
      deliver: jest.fn(),
    } as unknown as jest.Mocked<EmailDelivery>;

    mockPushDelivery = {
      supports: jest.fn(),
      deliver: jest.fn(),
    } as unknown as jest.Mocked<PushDelivery>;

    mockSmsDelivery = {
      supports: jest.fn(),
      deliver: jest.fn(),
    } as unknown as jest.Mocked<SMSDelivery>;

    deliveryRouter = new DeliveryRouter([mockEmailDelivery, mockPushDelivery, mockSmsDelivery]);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('route', () => {
    it('should route to email delivery service for EMAIL channel', async () => {
      // Arrange
      const notification = new Notification({
        agentType: AgentType.STUDENT,
        studentId: 'student-123',
        userId: 'user@example.com',
        subject: 'Test',
        body: 'Test body',
        priority: NotificationPriority.MEDIUM,
        triggerType: 'test',
      });

      mockEmailDelivery.supports.mockReturnValue(true);
      mockPushDelivery.supports.mockReturnValue(false);
      mockSmsDelivery.supports.mockReturnValue(false);

      const deliveryResult = {
        success: true,
        channel: NotificationChannel.EMAIL,
        messageId: 'email-123',
        deliveredAt: new Date(),
      };

      mockEmailDelivery.deliver.mockResolvedValue(deliveryResult);

      // Act
      const result = await deliveryRouter.route(notification, NotificationChannel.EMAIL);

      // Assert
      expect(result).toEqual(deliveryResult);
      expect(mockEmailDelivery.deliver).toHaveBeenCalledTimes(1);
      expect(mockEmailDelivery.deliver).toHaveBeenCalledWith(notification);
      expect(mockPushDelivery.deliver).not.toHaveBeenCalled();
      expect(mockSmsDelivery.deliver).not.toHaveBeenCalled();
    });

    it('should route to push delivery service for PUSH channel', async () => {
      // Arrange
      const notification = new Notification({
        agentType: AgentType.STUDENT,
        studentId: 'student-123',
        userId: 'fcm-token-123',
        subject: 'Test',
        body: 'Test body',
        priority: NotificationPriority.HIGH,
        triggerType: 'test',
      });

      mockEmailDelivery.supports.mockReturnValue(false);
      mockPushDelivery.supports.mockReturnValue(true);
      mockSmsDelivery.supports.mockReturnValue(false);

      const deliveryResult = {
        success: true,
        channel: NotificationChannel.PUSH,
        messageId: 'push-123',
        deliveredAt: new Date(),
      };

      mockPushDelivery.deliver.mockResolvedValue(deliveryResult);

      // Act
      const result = await deliveryRouter.route(notification, NotificationChannel.PUSH);

      // Assert
      expect(result).toEqual(deliveryResult);
      expect(mockPushDelivery.deliver).toHaveBeenCalledTimes(1);
      expect(mockPushDelivery.deliver).toHaveBeenCalledWith(notification);
      expect(mockEmailDelivery.deliver).not.toHaveBeenCalled();
      expect(mockSmsDelivery.deliver).not.toHaveBeenCalled();
    });

    it('should route to SMS delivery service for SMS channel', async () => {
      // Arrange
      const notification = new Notification({
        agentType: AgentType.PARENT,
        studentId: 'student-123',
        userId: '+15551234567',
        subject: 'Alert',
        body: 'Test body',
        priority: NotificationPriority.CRITICAL,
        triggerType: 'test',
      });

      mockEmailDelivery.supports.mockReturnValue(false);
      mockPushDelivery.supports.mockReturnValue(false);
      mockSmsDelivery.supports.mockReturnValue(true);

      const deliveryResult = {
        success: true,
        channel: NotificationChannel.SMS,
        messageId: 'sms-123',
        deliveredAt: new Date(),
      };

      mockSmsDelivery.deliver.mockResolvedValue(deliveryResult);

      // Act
      const result = await deliveryRouter.route(notification, NotificationChannel.SMS);

      // Assert
      expect(result).toEqual(deliveryResult);
      expect(mockSmsDelivery.deliver).toHaveBeenCalledTimes(1);
      expect(mockSmsDelivery.deliver).toHaveBeenCalledWith(notification);
      expect(mockEmailDelivery.deliver).not.toHaveBeenCalled();
      expect(mockPushDelivery.deliver).not.toHaveBeenCalled();
    });

    it('should return skipped result when no service supports the channel', async () => {
      // Arrange
      const notification = new Notification({
        agentType: AgentType.STUDENT,
        studentId: 'student-123',
        userId: 'user-456',
        subject: 'Test',
        body: 'Test body',
        priority: NotificationPriority.MEDIUM,
        triggerType: 'test',
      });

      mockEmailDelivery.supports.mockReturnValue(false);
      mockPushDelivery.supports.mockReturnValue(false);
      mockSmsDelivery.supports.mockReturnValue(false);

      // Act
      const result = await deliveryRouter.route(notification, NotificationChannel.IN_APP);

      // Assert
      expect(result.success).toBe(false);
      expect(result.channel).toBe(NotificationChannel.IN_APP);
      expect(result.error).toContain('No delivery service found for channel');
    });

    it('should propagate delivery errors from service', async () => {
      // Arrange
      const notification = new Notification({
        agentType: AgentType.STUDENT,
        studentId: 'student-123',
        userId: 'user@example.com',
        subject: 'Test',
        body: 'Test body',
        priority: NotificationPriority.MEDIUM,
        triggerType: 'test',
      });

      mockEmailDelivery.supports.mockReturnValue(true);
      mockPushDelivery.supports.mockReturnValue(false);
      mockSmsDelivery.supports.mockReturnValue(false);

      const deliveryError = new DeliveryError('SendGrid API failed', NotificationChannel.EMAIL, {
        statusCode: 500,
      });

      mockEmailDelivery.deliver.mockRejectedValue(deliveryError);

      // Act & Assert
      await expect(deliveryRouter.route(notification, NotificationChannel.EMAIL)).rejects.toThrow(
        DeliveryError
      );
      await expect(deliveryRouter.route(notification, NotificationChannel.EMAIL)).rejects.toThrow(
        'SendGrid API failed'
      );
    });

    it('should use first matching service when multiple support channel', async () => {
      // Arrange
      const notification = new Notification({
        agentType: AgentType.STUDENT,
        studentId: 'student-123',
        userId: 'user-456',
        subject: 'Test',
        body: 'Test body',
        priority: NotificationPriority.MEDIUM,
        triggerType: 'test',
      });

      mockEmailDelivery.supports.mockReturnValue(true);
      mockPushDelivery.supports.mockReturnValue(true);
      mockSmsDelivery.supports.mockReturnValue(false);

      const deliveryResult = {
        success: true,
        channel: NotificationChannel.EMAIL,
        messageId: 'email-123',
        deliveredAt: new Date(),
      };

      mockEmailDelivery.deliver.mockResolvedValue(deliveryResult);

      // Act
      const result = await deliveryRouter.route(notification, NotificationChannel.EMAIL);

      // Assert
      expect(result).toEqual(deliveryResult);
      expect(mockEmailDelivery.deliver).toHaveBeenCalledTimes(1);
      expect(mockPushDelivery.deliver).not.toHaveBeenCalled();
    });
  });
});
