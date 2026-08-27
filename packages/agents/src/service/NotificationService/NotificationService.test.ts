import type { INotificationAgent } from '@scholaracle/interfaces';
import { NotificationService } from './NotificationService';
import { StudentNotificationGenerator } from '../../generators/StudentNotificationGenerator';
import { ParentNotificationGenerator } from '../../generators/ParentNotificationGenerator';
import { DeliveryRouter } from '../../delivery/DeliveryRouter';
import { MongoQueue } from '../../queue/MongoQueue';
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

    it('does not deliver parent channels for deadline alerts', async () => {
      const alert = new Alert({
        studentId: 'student-123',
        type: AlertType.DEADLINE,
        severity: 'medium',
        relatedData: {},
      });
      const studentNotification = new Notification({
        agentType: AgentType.STUDENT,
        studentId: 'student-123',
        userId: 'student-123',
        subject: 'Due soon',
        body: 'Open the worksheet',
        priority: NotificationPriority.MEDIUM,
        triggerType: 'deadline',
        channels: [NotificationChannel.EMAIL],
      });
      const parentNotification = new Notification({
        agentType: AgentType.PARENT,
        studentId: 'student-123',
        userId: 'parent-456',
        subject: 'Chore',
        body: 'Due tomorrow',
        priority: NotificationPriority.MEDIUM,
        triggerType: 'deadline',
        channels: [NotificationChannel.EMAIL],
      });
      mockStudentGenerator.generate.mockReturnValue(studentNotification);
      mockParentGenerator.generate.mockReturnValue(parentNotification);
      mockDeliveryRouter.route.mockResolvedValue({
        success: true,
        channel: NotificationChannel.EMAIL,
        messageId: 'email-123',
        deliveredAt: new Date(),
      });
      await notificationService.processAlert(alert);
      expect(mockDeliveryRouter.route).toHaveBeenCalledTimes(1);
      expect(mockDeliveryRouter.route).toHaveBeenCalledWith(
        studentNotification,
        NotificationChannel.EMAIL
      );
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

  describe('constructor (agent array) and processAlert', () => {
    it('constructs with INotificationAgent[] and DeliveryRouter', () => {
      const mockAgent: INotificationAgent = {
        handles: jest.fn().mockReturnValue(false),
        generate: jest.fn(),
      };
      const mockRouter = { route: jest.fn() } as unknown as DeliveryRouter;
      const svc = new NotificationService([mockAgent], mockRouter);
      expect(svc).toBeDefined();
    });

    it('calls agent.handles() for each agent and skips agents that return false', async () => {
      const alert = new Alert({
        type: AlertType.MISSING_ASSIGNMENT,
        studentId: 'stu-1',
        severity: 'high',
        relatedData: {},
      });
      const handlingAgent: INotificationAgent = {
        handles: jest.fn().mockReturnValue(true),
        generate: jest.fn().mockReturnValue(
          new Notification({
            agentType: AgentType.STUDENT,
            studentId: 'stu-1',
            userId: 'stu-1',
            subject: 'Test',
            body: 'Body',
            priority: NotificationPriority.HIGH,
            triggerType: alert.type,
            channels: [NotificationChannel.EMAIL],
          })
        ),
      };
      const nonHandlingAgent: INotificationAgent = {
        handles: jest.fn().mockReturnValue(false),
        generate: jest.fn(),
      };
      const mockRouter = {
        route: jest.fn().mockResolvedValue({
          success: true,
          channel: NotificationChannel.EMAIL,
          messageId: 'id',
          deliveredAt: new Date(),
        }),
      } as unknown as DeliveryRouter;
      const svc = new NotificationService([nonHandlingAgent, handlingAgent], mockRouter);
      await svc.processAlert(alert);
      expect(nonHandlingAgent.handles).toHaveBeenCalledWith(alert);
      expect(handlingAgent.handles).toHaveBeenCalledWith(alert);
      expect(nonHandlingAgent.generate).not.toHaveBeenCalled();
      expect(handlingAgent.generate).toHaveBeenCalledWith(alert);
      expect(mockRouter.route).toHaveBeenCalledTimes(1);
    });

    it('calls generate() and routes notification for each agent that handles the alert', async () => {
      const alert = new Alert({
        type: AlertType.DEADLINE,
        studentId: 'stu-1',
        severity: 'high',
        relatedData: {},
      });
      const notif1 = new Notification({
        agentType: AgentType.STUDENT,
        studentId: 'stu-1',
        userId: 'stu-1',
        subject: 'Sub1',
        body: 'Body1',
        priority: NotificationPriority.HIGH,
        triggerType: alert.type,
        channels: [NotificationChannel.EMAIL],
      });
      const notif2 = new Notification({
        agentType: AgentType.STUDENT,
        studentId: 'stu-1',
        userId: 'stu-1',
        subject: 'Sub2',
        body: 'Body2',
        priority: NotificationPriority.HIGH,
        triggerType: alert.type,
        channels: [NotificationChannel.EMAIL],
      });
      const agent1: INotificationAgent = {
        handles: jest.fn().mockReturnValue(true),
        generate: jest.fn().mockReturnValue(notif1),
      };
      const agent2: INotificationAgent = {
        handles: jest.fn().mockReturnValue(true),
        generate: jest.fn().mockReturnValue(notif2),
      };
      const mockRouter = {
        route: jest.fn().mockResolvedValue({
          success: true,
          channel: NotificationChannel.EMAIL,
          messageId: 'id',
          deliveredAt: new Date(),
        }),
      } as unknown as DeliveryRouter;
      const svc = new NotificationService([agent1, agent2], mockRouter);
      const result = await svc.processAlert(alert);
      expect(agent1.generate).toHaveBeenCalledWith(alert);
      expect(agent2.generate).toHaveBeenCalledWith(alert);
      expect(mockRouter.route).toHaveBeenCalledTimes(2);
      expect(notif1.sentAt).toBeDefined();
      expect(notif2.sentAt).toBeDefined();
      expect(result.deliveryResults).toHaveLength(2);
    });

    it('multiple agents can handle the same alert', async () => {
      const alert = new Alert({
        type: AlertType.GRADE_DROP,
        studentId: 'stu-1',
        severity: 'high',
        relatedData: {},
      });
      const notifA = new Notification({
        agentType: AgentType.STUDENT,
        studentId: 'stu-1',
        userId: 'stu-1',
        subject: 'A',
        body: 'A',
        priority: NotificationPriority.HIGH,
        triggerType: alert.type,
        channels: [NotificationChannel.EMAIL],
      });
      const notifB = new Notification({
        agentType: AgentType.PARENT,
        studentId: 'stu-1',
        userId: 'parent-1',
        subject: 'B',
        body: 'B',
        priority: NotificationPriority.HIGH,
        triggerType: alert.type,
        channels: [NotificationChannel.EMAIL],
      });
      const agentA: INotificationAgent = {
        handles: jest.fn().mockReturnValue(true),
        generate: jest.fn().mockReturnValue(notifA),
      };
      const agentB: INotificationAgent = {
        handles: jest.fn().mockReturnValue(true),
        generate: jest.fn().mockReturnValue(notifB),
      };
      const mockRouter = {
        route: jest.fn().mockResolvedValue({
          success: true,
          channel: NotificationChannel.EMAIL,
          messageId: 'id',
          deliveredAt: new Date(),
        }),
      } as unknown as DeliveryRouter;
      const svc = new NotificationService([agentA, agentB], mockRouter);
      const result = await svc.processAlert(alert);
      expect(agentA.generate).toHaveBeenCalledWith(alert);
      expect(agentB.generate).toHaveBeenCalledWith(alert);
      expect(mockRouter.route).toHaveBeenCalledWith(notifA, NotificationChannel.EMAIL);
      expect(mockRouter.route).toHaveBeenCalledWith(notifB, NotificationChannel.EMAIL);
      expect(result.studentNotification).toEqual(notifA);
      expect(result.parentNotification).toEqual(notifB);
    });

    it('deadline alerts skip the parent agent (student-only)', async () => {
      const alert = new Alert({
        type: AlertType.DEADLINE,
        studentId: 'stu-1',
        severity: 'high',
        relatedData: {},
      });
      const studentNotif = new Notification({
        agentType: AgentType.STUDENT,
        studentId: 'stu-1',
        userId: 'stu-1',
        subject: 'Due soon',
        body: 'Open the worksheet',
        priority: NotificationPriority.HIGH,
        triggerType: alert.type,
        channels: [NotificationChannel.EMAIL],
      });
      const parentNotif = new Notification({
        agentType: AgentType.PARENT,
        studentId: 'stu-1',
        userId: 'parent-1',
        subject: 'Chore',
        body: 'Due tomorrow',
        priority: NotificationPriority.HIGH,
        triggerType: alert.type,
        channels: [NotificationChannel.EMAIL],
      });
      const studentAgent: INotificationAgent = {
        handles: jest.fn().mockReturnValue(true),
        generate: jest.fn().mockReturnValue(studentNotif),
      };
      const parentAgent: INotificationAgent = {
        handles: jest.fn().mockReturnValue(true),
        generate: jest.fn().mockReturnValue(parentNotif),
      };
      const mockRouter = {
        route: jest.fn().mockResolvedValue({
          success: true,
          channel: NotificationChannel.EMAIL,
          messageId: 'id',
          deliveredAt: new Date(),
        }),
      } as unknown as DeliveryRouter;
      const svc = new NotificationService([studentAgent, parentAgent], mockRouter);
      const result = await svc.processAlert(alert);
      expect(mockRouter.route).toHaveBeenCalledTimes(1);
      expect(mockRouter.route).toHaveBeenCalledWith(studentNotif, NotificationChannel.EMAIL);
      expect(result.deliveryResults).toHaveLength(1);
    });
  });

  describe('processAlertEnqueueDeliver', () => {
    it('should enqueue deliver jobs with resolved email in payload and correct channel', async () => {
      const mockQueue = {
        add: jest.fn().mockResolvedValue('job-id'),
      } as unknown as jest.Mocked<MongoQueue>;
      const notif = new Notification({
        agentType: AgentType.STUDENT,
        studentId: 'student-123',
        userId: 'student-123',
        subject: 'Test',
        body: 'Body',
        priority: NotificationPriority.HIGH,
        triggerType: AlertType.MISSING_ASSIGNMENT,
        channels: [NotificationChannel.EMAIL],
      });
      const agent: INotificationAgent = {
        handles: jest.fn().mockReturnValue(true),
        generate: jest.fn().mockReturnValue(notif),
      };
      const svc = new NotificationService([agent], mockDeliveryRouter);
      const alert = new Alert({
        studentId: 'student-123',
        type: AlertType.MISSING_ASSIGNMENT,
        severity: 'high',
        relatedData: {},
      });
      const resolved = [{ parentEmail: 'parent@example.com' }];

      const result = await svc.processAlertEnqueueDeliver(alert, mockQueue, resolved);

      expect(result.notifications).toHaveLength(1);
      expect(result.deliveryJobIds).toHaveLength(1);
      expect(mockQueue.add).toHaveBeenCalledTimes(1);
      expect(mockQueue.add).toHaveBeenCalledWith(
        'deliver',
        'deliver-one',
        {
          notificationPayload: expect.objectContaining({
            userId: 'parent@example.com',
            subject: 'Test',
            studentId: 'student-123',
          }),
          channel: NotificationChannel.EMAIL,
        },
        { maxAttempts: 5 }
      );
    });

    it('should skip channels without recipient address (email only → only EMAIL job)', async () => {
      const mockQueue = {
        add: jest.fn().mockResolvedValue('job-id'),
      } as unknown as jest.Mocked<MongoQueue>;
      const notif = new Notification({
        agentType: AgentType.STUDENT,
        studentId: 'student-123',
        userId: 'student-123',
        subject: 'Test',
        body: 'Body',
        priority: NotificationPriority.HIGH,
        triggerType: AlertType.MISSING_ASSIGNMENT,
        channels: [NotificationChannel.EMAIL, NotificationChannel.SMS],
      });
      const agent: INotificationAgent = {
        handles: jest.fn().mockReturnValue(true),
        generate: jest.fn().mockReturnValue(notif),
      };
      const svc = new NotificationService([agent], mockDeliveryRouter);
      const alert = new Alert({
        studentId: 'student-123',
        type: AlertType.MISSING_ASSIGNMENT,
        severity: 'high',
        relatedData: {},
      });
      const resolved = [{ parentEmail: 'only@example.com' }];

      await svc.processAlertEnqueueDeliver(alert, mockQueue, resolved);

      expect(mockQueue.add).toHaveBeenCalledTimes(1);
      expect(mockQueue.add).toHaveBeenCalledWith(
        'deliver',
        'deliver-one',
        expect.objectContaining({ channel: NotificationChannel.EMAIL }),
        { maxAttempts: 5 }
      );
    });

    it('should enqueue one deliver job per resolved recipient', async () => {
      const mockQueue = {
        add: jest.fn().mockResolvedValue('id'),
      } as unknown as jest.Mocked<MongoQueue>;
      const notif = new Notification({
        agentType: AgentType.STUDENT,
        studentId: 'student-123',
        userId: 'student-123',
        subject: 'Test',
        body: 'Body',
        priority: NotificationPriority.HIGH,
        triggerType: AlertType.MISSING_ASSIGNMENT,
        channels: [NotificationChannel.EMAIL],
      });
      const agent: INotificationAgent = {
        handles: jest.fn().mockReturnValue(true),
        generate: jest.fn().mockReturnValue(notif),
      };
      const svc = new NotificationService([agent], mockDeliveryRouter);
      const alert = new Alert({
        studentId: 'student-123',
        type: AlertType.MISSING_ASSIGNMENT,
        severity: 'high',
        relatedData: {},
      });
      const resolved = [
        { parentEmail: 'first@example.com' },
        { parentEmail: 'second@example.com' },
      ];

      const result = await svc.processAlertEnqueueDeliver(alert, mockQueue, resolved);

      expect(result.deliveryJobIds).toHaveLength(2);
      expect(mockQueue.add).toHaveBeenCalledTimes(2);
      const payloads = (mockQueue.add as jest.Mock).mock.calls.map(
        (c: [string, string, { notificationPayload: { userId: string } }]) =>
          c[2].notificationPayload.userId
      );
      expect(payloads).toContain('first@example.com');
      expect(payloads).toContain('second@example.com');
    });

    it('should throw for legacy service (no agents)', async () => {
      const mockQueue = { add: jest.fn() } as unknown as jest.Mocked<MongoQueue>;
      const alert = new Alert({
        studentId: 'student-123',
        type: AlertType.MISSING_ASSIGNMENT,
        severity: 'high',
        relatedData: {},
      });

      await expect(
        notificationService.processAlertEnqueueDeliver(alert, mockQueue)
      ).rejects.toThrow('processAlertEnqueueDeliver requires agent-based NotificationService');
      expect(mockQueue.add).not.toHaveBeenCalled();
    });

    it('should route PARENT notification to parent recipients and STUDENT to student recipients', async () => {
      const mockQueue = {
        add: jest.fn().mockResolvedValue('job-id'),
      } as unknown as jest.Mocked<MongoQueue>;
      const studentNotif = new Notification({
        agentType: AgentType.STUDENT,
        studentId: 'student-123',
        userId: 'student-123',
        subject: 'MISSING ASSIGNMENT',
        body: 'Math: Homework due.',
        priority: NotificationPriority.HIGH,
        triggerType: AlertType.MISSING_ASSIGNMENT,
        channels: [NotificationChannel.EMAIL],
      });
      const parentNotif = new Notification({
        agentType: AgentType.PARENT,
        studentId: 'student-123',
        userId: 'parent-456',
        subject: 'Ava Lewis - MISSING ASSIGNMENT: Math',
        body: 'Ava Lewis has a missing assignment in Math.',
        priority: NotificationPriority.HIGH,
        triggerType: AlertType.MISSING_ASSIGNMENT,
        channels: [NotificationChannel.EMAIL],
      });
      const studentAgent: INotificationAgent = {
        handles: jest.fn().mockReturnValue(true),
        generate: jest.fn().mockReturnValue(studentNotif),
      };
      const parentAgent: INotificationAgent = {
        handles: jest.fn().mockReturnValue(true),
        generate: jest.fn().mockReturnValue(parentNotif),
      };
      const svc = new NotificationService([studentAgent, parentAgent], mockDeliveryRouter);
      const alert = new Alert({
        studentId: 'student-123',
        type: AlertType.MISSING_ASSIGNMENT,
        severity: 'high',
        relatedData: {},
      });
      const resolved = [
        { parentEmail: 'parent@example.com', recipientType: 'parent' as const },
        { parentEmail: 'student@school.edu', recipientType: 'student' as const },
      ];

      await svc.processAlertEnqueueDeliver(alert, mockQueue, resolved);

      expect(mockQueue.add).toHaveBeenCalledTimes(2);
      const calls = (mockQueue.add as jest.Mock).mock.calls;
      const parentCall = calls.find(
        (c: [string, string, { notificationPayload: { userId: string; subject: string } }]) =>
          c[2].notificationPayload.userId === 'parent@example.com'
      );
      const studentCall = calls.find(
        (c: [string, string, { notificationPayload: { userId: string; subject: string } }]) =>
          c[2].notificationPayload.userId === 'student@school.edu'
      );
      expect(parentCall).toBeDefined();
      expect(parentCall![2].notificationPayload.agentType).toBe(AgentType.PARENT);
      expect(parentCall![2].notificationPayload.subject).toContain('Ava Lewis');
      expect(studentCall).toBeDefined();
      expect(studentCall![2].notificationPayload.agentType).toBe(AgentType.STUDENT);
      expect(studentCall![2].notificationPayload.subject).toBe('MISSING ASSIGNMENT');
    });

    it('does not enqueue parent deliver jobs for deadline alerts', async () => {
      const mockQueue = {
        add: jest.fn().mockResolvedValue('job-id'),
      } as unknown as jest.Mocked<MongoQueue>;
      const studentNotif = new Notification({
        agentType: AgentType.STUDENT,
        studentId: 'student-123',
        userId: 'student-123',
        subject: 'Due soon',
        body: 'Open the worksheet',
        priority: NotificationPriority.HIGH,
        triggerType: AlertType.DEADLINE,
        channels: [NotificationChannel.EMAIL],
      });
      const parentNotif = new Notification({
        agentType: AgentType.PARENT,
        studentId: 'student-123',
        userId: 'parent-456',
        subject: 'Chore',
        body: 'Due tomorrow',
        priority: NotificationPriority.HIGH,
        triggerType: AlertType.DEADLINE,
        channels: [NotificationChannel.EMAIL],
      });
      const svc = new NotificationService(
        [
          {
            handles: jest.fn().mockReturnValue(true),
            generate: jest.fn().mockReturnValue(studentNotif),
          },
          {
            handles: jest.fn().mockReturnValue(true),
            generate: jest.fn().mockReturnValue(parentNotif),
          },
        ],
        mockDeliveryRouter
      );
      const alert = new Alert({
        studentId: 'student-123',
        type: AlertType.DEADLINE,
        severity: 'medium',
        relatedData: {},
      });
      await svc.processAlertEnqueueDeliver(alert, mockQueue, [
        { parentEmail: 'parent@example.com', recipientType: 'parent' },
        { parentEmail: 'emma.demo@scholarmancy.com', recipientType: 'student' },
      ]);
      expect(mockQueue.add).toHaveBeenCalledTimes(1);
      const payload = (mockQueue.add as jest.Mock).mock.calls[0]?.[2] as {
        notificationPayload: { userId: string; agentType: AgentType };
      };
      expect(payload.notificationPayload.userId).toBe('emma.demo@scholarmancy.com');
      expect(payload.notificationPayload.agentType).toBe(AgentType.STUDENT);
    });

    it('should treat recipients without recipientType as parent (backward compat)', async () => {
      const mockQueue = {
        add: jest.fn().mockResolvedValue('job-id'),
      } as unknown as jest.Mocked<MongoQueue>;
      const studentNotif = new Notification({
        agentType: AgentType.STUDENT,
        studentId: 'stu-1',
        userId: 'stu-1',
        subject: 'Student sub',
        body: 'Student body',
        priority: NotificationPriority.HIGH,
        triggerType: AlertType.MISSING_ASSIGNMENT,
        channels: [NotificationChannel.EMAIL],
      });
      const parentNotif = new Notification({
        agentType: AgentType.PARENT,
        studentId: 'stu-1',
        userId: 'p-1',
        subject: 'Parent sub',
        body: 'Parent body',
        priority: NotificationPriority.HIGH,
        triggerType: AlertType.MISSING_ASSIGNMENT,
        channels: [NotificationChannel.EMAIL],
      });
      const studentAgent: INotificationAgent = {
        handles: jest.fn().mockReturnValue(true),
        generate: jest.fn().mockReturnValue(studentNotif),
      };
      const parentAgent: INotificationAgent = {
        handles: jest.fn().mockReturnValue(true),
        generate: jest.fn().mockReturnValue(parentNotif),
      };
      const svc = new NotificationService([studentAgent, parentAgent], mockDeliveryRouter);
      const alert = new Alert({
        studentId: 'stu-1',
        type: AlertType.MISSING_ASSIGNMENT,
        severity: 'high',
        relatedData: {},
      });
      const resolved = [{ parentEmail: 'legacy@example.com' }];

      await svc.processAlertEnqueueDeliver(alert, mockQueue, resolved);

      expect(mockQueue.add).toHaveBeenCalledTimes(1);
      expect((mockQueue.add as jest.Mock).mock.calls[0][2].notificationPayload.agentType).toBe(
        AgentType.PARENT
      );
      expect((mockQueue.add as jest.Mock).mock.calls[0][2].notificationPayload.subject).toBe(
        'Parent sub'
      );
    });
  });

  describe('deliverOne', () => {
    it('should reconstruct notification and route to channel, return DeliveryResult', async () => {
      const mockAgent: INotificationAgent = {
        handles: jest.fn().mockReturnValue(false),
        generate: jest.fn(),
      };
      const mockRouter = {
        route: jest.fn().mockResolvedValue({
          success: true,
          channel: NotificationChannel.EMAIL,
          messageId: 'msg-1',
          deliveredAt: new Date(),
        }),
      } as unknown as jest.Mocked<DeliveryRouter>;
      const svc = new NotificationService([mockAgent], mockRouter);
      const payload = {
        id: 'notif-id',
        agentType: AgentType.STUDENT,
        studentId: 'student-123',
        userId: 'user@example.com',
        subject: 'Sub',
        body: 'Body',
        priority: NotificationPriority.HIGH,
        triggerType: 'test',
        channels: [NotificationChannel.EMAIL],
      };

      const result = await svc.deliverOne(payload, NotificationChannel.EMAIL);

      expect(result.success).toBe(true);
      expect(result.channel).toBe(NotificationChannel.EMAIL);
      expect(result.messageId).toBe('msg-1');
      expect(mockRouter.route).toHaveBeenCalledTimes(1);
      const [notification] = (mockRouter.route as jest.Mock).mock.calls[0];
      expect(notification.userId).toBe('user@example.com');
      expect(notification.subject).toBe('Sub');
    });

    it('should propagate router error', async () => {
      const mockAgent: INotificationAgent = {
        handles: jest.fn().mockReturnValue(false),
        generate: jest.fn(),
      };
      const err = new DeliveryError('SMTP failed', NotificationChannel.EMAIL, {});
      const mockRouter = {
        route: jest.fn().mockRejectedValue(err),
      } as unknown as jest.Mocked<DeliveryRouter>;
      const svc = new NotificationService([mockAgent], mockRouter);
      const payload = {
        id: 'notif-id',
        agentType: AgentType.STUDENT,
        studentId: 'student-123',
        userId: 'user@example.com',
        subject: 'Sub',
        body: 'Body',
        priority: NotificationPriority.HIGH,
        triggerType: 'test',
      };

      await expect(svc.deliverOne(payload, NotificationChannel.EMAIL)).rejects.toThrow(
        DeliveryError
      );
    });
  });
});
