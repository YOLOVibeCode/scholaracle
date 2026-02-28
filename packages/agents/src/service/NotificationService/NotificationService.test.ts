import { NotificationService } from './NotificationService';
import { StudentNotificationGenerator } from '../../generators/StudentNotificationGenerator';
import { ParentNotificationGenerator } from '../../generators/ParentNotificationGenerator';
import { DeliveryRouter } from '../../delivery/DeliveryRouter';
import {
  Alert,
  AlertType,
  Notification,
  NotificationChannel,
  NotificationPriority,
  AgentType,
  DeliveryResult,
  DeliveryError,
} from '@scholaracle/contracts';

describe('NotificationService', () => {
  let notificationService: NotificationService;
  let mockStudentGenerator: jest.Mocked<StudentNotificationGenerator>;
  let mockParentGenerator: jest.Mocked<ParentNotificationGenerator>;
  let mockDeliveryRouter: jest.Mocked<DeliveryRouter>;

  beforeEach(() => {
    mockStudentGenerator = {
      generate: jest.fn(),
    } as unknown as jest.Mocked<StudentNotificationGenerator>;

    mockParentGenerator = {
      generate: jest.fn(),
    } as unknown as jest.Mocked<ParentNotificationGenerator>;

    mockDeliveryRouter = {
      route: jest.fn(),
    } as unknown as jest.Mocked<DeliveryRouter>;

    notificationService = new NotificationService(
      mockStudentGenerator,
      mockParentGenerator,
      mockDeliveryRouter
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('processAlert', () => {
    it('should generate and deliver notifications for both student and parent', async () => {
      // Arrange
      const alert = new Alert({
        studentId: 'student-123',
        type: AlertType.MISSING_ASSIGNMENT,
        severity: 'high',
        relatedData: {
          course: 'Math',
          assignment: 'Homework 5',
        },
      });

      const studentNotification = new Notification({
        agentType: AgentType.STUDENT,
        studentId: 'student-123',
        userId: 'student-123',
        subject: 'MISSING ASSIGNMENT',
        body: 'Math: Homework 5',
        priority: NotificationPriority.HIGH,
        triggerType: 'missing_assignment',
        channels: [NotificationChannel.EMAIL],
      });

      const parentNotification = new Notification({
        agentType: AgentType.PARENT,
        studentId: 'student-123',
        userId: 'parent-456',
        subject: 'John Doe - Missing Assignment Alert',
        body: 'Math: Homework 5',
        priority: NotificationPriority.HIGH,
        triggerType: 'missing_assignment',
        channels: [NotificationChannel.EMAIL],
      });

      mockStudentGenerator.generate.mockReturnValue(studentNotification);
      mockParentGenerator.generate.mockReturnValue(parentNotification);

      const deliveryResult: DeliveryResult = {
        success: true,
        channel: NotificationChannel.EMAIL,
        messageId: 'email-123',
        deliveredAt: new Date(),
      };

      mockDeliveryRouter.route.mockResolvedValue(deliveryResult);

      // Act
      const result = await notificationService.processAlert(alert);

      // Assert
      expect(result.studentNotification).toEqual(studentNotification);
      expect(result.parentNotification).toEqual(parentNotification);
      expect(result.deliveryResults).toHaveLength(2);
      expect(mockStudentGenerator.generate).toHaveBeenCalledWith(alert);
      expect(mockParentGenerator.generate).toHaveBeenCalledWith(alert);
      expect(mockDeliveryRouter.route).toHaveBeenCalledTimes(2);
    });

    it('should deliver to all channels specified in notification', async () => {
      // Arrange
      const alert = new Alert({
        studentId: 'student-123',
        type: AlertType.MISSING_ASSIGNMENT,
        severity: 'critical',
        relatedData: {},
      });

      const studentNotification = new Notification({
        agentType: AgentType.STUDENT,
        studentId: 'student-123',
        userId: 'student-123',
        subject: 'Test',
        body: 'Test body',
        priority: NotificationPriority.CRITICAL,
        triggerType: 'missing_assignment',
        channels: [NotificationChannel.EMAIL, NotificationChannel.SMS],
      });

      const parentNotification = new Notification({
        agentType: AgentType.PARENT,
        studentId: 'student-123',
        userId: 'parent-456',
        subject: 'Test',
        body: 'Test body',
        priority: NotificationPriority.CRITICAL,
        triggerType: 'missing_assignment',
        channels: [NotificationChannel.EMAIL, NotificationChannel.SMS],
      });

      mockStudentGenerator.generate.mockReturnValue(studentNotification);
      mockParentGenerator.generate.mockReturnValue(parentNotification);

      const emailResult: DeliveryResult = {
        success: true,
        channel: NotificationChannel.EMAIL,
        messageId: 'email-123',
        deliveredAt: new Date(),
      };

      const smsResult: DeliveryResult = {
        success: true,
        channel: NotificationChannel.SMS,
        messageId: 'sms-123',
        deliveredAt: new Date(),
      };

      mockDeliveryRouter.route
        .mockResolvedValueOnce(emailResult)
        .mockResolvedValueOnce(emailResult)
        .mockResolvedValueOnce(smsResult)
        .mockResolvedValueOnce(smsResult);

      // Act
      await notificationService.processAlert(alert);

      // Assert
      expect(mockDeliveryRouter.route).toHaveBeenCalledTimes(4);
      expect(mockDeliveryRouter.route).toHaveBeenCalledWith(
        studentNotification,
        NotificationChannel.EMAIL
      );
      expect(mockDeliveryRouter.route).toHaveBeenCalledWith(
        studentNotification,
        NotificationChannel.SMS
      );
    });

    it('should continue delivering to other channels if one fails', async () => {
      // Arrange
      const alert = new Alert({
        studentId: 'student-123',
        type: AlertType.MISSING_ASSIGNMENT,
        severity: 'high',
        relatedData: {},
      });

      const studentNotification = new Notification({
        agentType: AgentType.STUDENT,
        studentId: 'student-123',
        userId: 'student-123',
        subject: 'Test',
        body: 'Test body',
        priority: NotificationPriority.HIGH,
        triggerType: 'missing_assignment',
        channels: [NotificationChannel.EMAIL, NotificationChannel.SMS],
      });

      const parentNotification = new Notification({
        agentType: AgentType.PARENT,
        studentId: 'student-123',
        userId: 'parent-456',
        subject: 'Test',
        body: 'Test body',
        priority: NotificationPriority.HIGH,
        triggerType: 'missing_assignment',
        channels: [NotificationChannel.EMAIL, NotificationChannel.SMS],
      });

      mockStudentGenerator.generate.mockReturnValue(studentNotification);
      mockParentGenerator.generate.mockReturnValue(parentNotification);

      const emailError = new DeliveryError('Email delivery failed', NotificationChannel.EMAIL, {});

      const smsResult: DeliveryResult = {
        success: true,
        channel: NotificationChannel.SMS,
        messageId: 'sms-123',
        deliveredAt: new Date(),
      };

      mockDeliveryRouter.route
        .mockRejectedValueOnce(emailError)
        .mockResolvedValueOnce(smsResult)
        .mockResolvedValueOnce(smsResult);

      // Act & Assert
      await expect(notificationService.processAlert(alert)).rejects.toThrow(DeliveryError);

      // Should still attempt SMS delivery
      expect(mockDeliveryRouter.route).toHaveBeenCalledTimes(1);
    });

    it('should mark notifications as sent after successful delivery', async () => {
      // Arrange
      const alert = new Alert({
        studentId: 'student-123',
        type: AlertType.MISSING_ASSIGNMENT,
        severity: 'high',
        relatedData: {},
      });

      const studentNotification = new Notification({
        agentType: AgentType.STUDENT,
        studentId: 'student-123',
        userId: 'student-123',
        subject: 'Test',
        body: 'Test body',
        priority: NotificationPriority.HIGH,
        triggerType: 'missing_assignment',
        channels: [NotificationChannel.EMAIL],
      });

      const parentNotification = new Notification({
        agentType: AgentType.PARENT,
        studentId: 'student-123',
        userId: 'parent-456',
        subject: 'Test',
        body: 'Test body',
        priority: NotificationPriority.HIGH,
        triggerType: 'missing_assignment',
        channels: [NotificationChannel.EMAIL],
      });

      mockStudentGenerator.generate.mockReturnValue(studentNotification);
      mockParentGenerator.generate.mockReturnValue(parentNotification);

      const deliveryResult: DeliveryResult = {
        success: true,
        channel: NotificationChannel.EMAIL,
        messageId: 'email-123',
        deliveredAt: new Date(),
      };

      mockDeliveryRouter.route.mockResolvedValue(deliveryResult);

      // Act
      await notificationService.processAlert(alert);

      // Assert
      expect(studentNotification.sentAt).toBeDefined();
      expect(parentNotification.sentAt).toBeDefined();
    });

    it('should deliver to multiple resolved recipients and skip channels they do not have', async () => {
      const alert = new Alert({
        studentId: 'student-123',
        type: AlertType.MISSING_ASSIGNMENT,
        severity: 'high',
        relatedData: {},
      });

      const parentNotification = new Notification({
        agentType: AgentType.PARENT,
        studentId: 'student-123',
        userId: 'parent-456',
        subject: 'Alert',
        body: 'Body',
        priority: NotificationPriority.HIGH,
        triggerType: 'missing_assignment',
        channels: [NotificationChannel.EMAIL, NotificationChannel.SMS],
      });

      mockStudentGenerator.generate.mockReturnValue(
        new Notification({
          agentType: AgentType.STUDENT,
          studentId: 'student-123',
          userId: 'student-123',
          subject: 'Test',
          body: 'Test',
          priority: NotificationPriority.HIGH,
          triggerType: 'missing_assignment',
          channels: [],
        })
      );
      mockParentGenerator.generate.mockReturnValue(parentNotification);

      const resolvedRecipients = [
        { parentEmail: 'owner@example.com', parentPhone: '+15551111111' },
        { parentEmail: 'contact2@example.com' },
        { parentPhone: '+15552222222' },
      ];

      const deliveryResult: DeliveryResult = {
        success: true,
        channel: NotificationChannel.EMAIL,
        messageId: 'id',
        deliveredAt: new Date(),
      };
      mockDeliveryRouter.route.mockResolvedValue(deliveryResult);

      await notificationService.processAlert(alert, resolvedRecipients);

      // Student: 0 channels. Parent: 3 recipients × (email + sms where present)
      // owner: email + sms = 2, contact2: email = 1, contact3: sms = 1 → total 4 parent deliveries
      expect(mockDeliveryRouter.route).toHaveBeenCalledTimes(4);
      const emailCalls = (mockDeliveryRouter.route as jest.Mock).mock.calls.filter(
        (c: [Notification, string]) => c[1] === NotificationChannel.EMAIL
      );
      const smsCalls = (mockDeliveryRouter.route as jest.Mock).mock.calls.filter(
        (c: [Notification, string]) => c[1] === NotificationChannel.SMS
      );
      expect(emailCalls).toHaveLength(2);
      expect(smsCalls).toHaveLength(2);
      const userIds = (mockDeliveryRouter.route as jest.Mock).mock.calls.map(
        (c: [Notification, string]) => c[0].userId
      );
      expect(userIds).toContain('owner@example.com');
      expect(userIds).toContain('contact2@example.com');
      expect(userIds).toContain('+15551111111');
      expect(userIds).toContain('+15552222222');
    });
  });
});
