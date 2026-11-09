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

    it('delivers student_needs_help to the parent only on the legacy path', async () => {
      const alert = new Alert({
        studentId: 'gideon-id',
        type: AlertType.STUDENT_NEEDS_HELP,
        severity: 'info',
        relatedData: { title: 'Ch. 5 problems' },
      });
      const studentNotification = new Notification({
        agentType: AgentType.STUDENT,
        studentId: 'gideon-id',
        userId: 'gideon-id',
        subject: 'Your grown-ups were told',
        body: 'x',
        priority: NotificationPriority.MEDIUM,
        triggerType: AlertType.STUDENT_NEEDS_HELP,
        channels: [NotificationChannel.EMAIL],
      });
      const parentNotification = new Notification({
        agentType: AgentType.PARENT,
        studentId: 'gideon-id',
        userId: 'parent-1',
        subject: 'Gideon asked for help with Ch. 5 problems',
        body: 'y',
        priority: NotificationPriority.MEDIUM,
        triggerType: AlertType.STUDENT_NEEDS_HELP,
        channels: [NotificationChannel.EMAIL],
      });
      mockStudentGenerator.generate.mockReturnValue(studentNotification);
      mockParentGenerator.generate.mockReturnValue(parentNotification);
      mockDeliveryRouter.route.mockResolvedValue({
        success: true,
        channel: NotificationChannel.EMAIL,
        messageId: 'email-1',
        deliveredAt: new Date(),
      });
      await notificationService.processAlert(alert, { parentEmail: 'owner@example.com' });
      expect(mockDeliveryRouter.route).toHaveBeenCalledTimes(1);
      const [sent, channel] = mockDeliveryRouter.route.mock.calls[0] as [
        Notification,
        NotificationChannel,
      ];
      expect(channel).toBe(NotificationChannel.EMAIL);
      expect(sent.agentType).toBe(AgentType.PARENT);
      expect(sent.userId).toBe('owner@example.com');
      expect(studentNotification.sentAt).toBeUndefined();
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
        subject: 'Avery Sample - MISSING ASSIGNMENT: Math',
        body: 'Avery Sample has a missing assignment in Math.',
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
      expect(parentCall![2].notificationPayload.subject).toContain('Avery Sample');
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

    it('student_needs_help goes to the parents only, never back to the student alertEmail (R3)', async () => {
      const mockQueue = {
        add: jest.fn().mockResolvedValue('job-id'),
      } as unknown as jest.Mocked<MongoQueue>;
      const studentNotif = new Notification({
        agentType: AgentType.STUDENT,
        studentId: 'gideon-id',
        userId: 'gideon-id',
        subject: 'Your grown-ups were told about Ch. 5 problems',
        body: 'You asked for help.',
        priority: NotificationPriority.MEDIUM,
        triggerType: AlertType.STUDENT_NEEDS_HELP,
        channels: [NotificationChannel.EMAIL],
      });
      const parentNotif = new Notification({
        agentType: AgentType.PARENT,
        studentId: 'gideon-id',
        userId: 'parent-1',
        subject: 'Gideon asked for help with Ch. 5 problems',
        body: 'Gideon tapped "Need help" on "Ch. 5 problems" in Math.\nGideon wrote: "I don\'t get #7"',
        priority: NotificationPriority.MEDIUM,
        triggerType: AlertType.STUDENT_NEEDS_HELP,
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
        studentId: 'gideon-id',
        type: AlertType.STUDENT_NEEDS_HELP,
        severity: 'info',
        relatedData: { title: 'Ch. 5 problems', note: "I don't get #7" },
      });
      await svc.processAlertEnqueueDeliver(alert, mockQueue, [
        { parentEmail: 'owner@example.com', userId: 'parent-1', recipientType: 'parent' },
        { parentEmail: 'coparent@example.com', recipientType: 'parent' },
        { parentEmail: 'gideon.student@school.edu', recipientType: 'student' },
      ]);
      const payloads = (mockQueue.add as jest.Mock).mock.calls.map(
        (
          c: [
            string,
            string,
            {
              notificationPayload: {
                userId: string;
                agentType: AgentType;
                subject: string;
                body: string;
              };
            },
          ]
        ) => c[2].notificationPayload
      );
      expect(payloads.map((p) => p.userId).sort()).toEqual([
        'coparent@example.com',
        'owner@example.com',
      ]);
      for (const p of payloads) {
        expect(p.agentType).toBe(AgentType.PARENT);
        expect(p.subject).toBe('Gideon asked for help with Ch. 5 problems');
        expect(p.body).toContain('Gideon wrote: "I don\'t get #7"');
      }
    });
  });

  describe('digest exemption for student_needs_help (R3)', () => {
    const parentRecipient = {
      parentEmail: 'owner@example.com',
      parentPhone: '+15555550100',
      userId: 'parent-1',
      recipientType: 'parent' as const,
    };

    function digestOptions() {
      return {
        sms: {
          getSmsDigestPreference: jest.fn().mockResolvedValue({ enabled: true }),
          enqueueSmsForDigest: jest.fn().mockResolvedValue(undefined),
        },
        email: {
          getEmailDigestPreference: jest
            .fn()
            .mockResolvedValue({ enabled: true, frequency: 'balanced' as const }),
          enqueueEmailForDigest: jest.fn().mockResolvedValue(undefined),
        },
      };
    }

    function parentNotification(type: AlertType): Notification {
      return new Notification({
        agentType: AgentType.PARENT,
        studentId: 'gideon-id',
        userId: 'parent-1',
        subject: 'subject',
        body: 'body',
        priority: NotificationPriority.MEDIUM,
        triggerType: type,
        channels: [NotificationChannel.EMAIL, NotificationChannel.SMS],
      });
    }

    it('goes out at once on email and SMS even when both digests are on (severity info)', async () => {
      const mockQueue = {
        add: jest.fn().mockResolvedValue('job-id'),
      } as unknown as jest.Mocked<MongoQueue>;
      const { sms, email } = digestOptions();
      const agent: INotificationAgent = {
        handles: jest.fn().mockReturnValue(true),
        generate: jest.fn().mockReturnValue(parentNotification(AlertType.STUDENT_NEEDS_HELP)),
      };
      const svc = new NotificationService([agent], mockDeliveryRouter, sms, email);
      const alert = new Alert({
        studentId: 'gideon-id',
        type: AlertType.STUDENT_NEEDS_HELP,
        severity: 'info',
        relatedData: { title: 'Ch. 5 problems' },
      });

      await svc.processAlertEnqueueDeliver(alert, mockQueue, [parentRecipient]);

      const channels = (mockQueue.add as jest.Mock).mock.calls
        .map((c: [string, string, { channel: NotificationChannel }]) => c[2].channel)
        .sort();
      expect(channels).toEqual([NotificationChannel.EMAIL, NotificationChannel.SMS].sort());
      expect(sms.enqueueSmsForDigest).not.toHaveBeenCalled();
      expect(email.enqueueEmailForDigest).not.toHaveBeenCalled();
    });

    it('control: a warning missing_assignment still defers to both digests', async () => {
      const mockQueue = {
        add: jest.fn().mockResolvedValue('job-id'),
      } as unknown as jest.Mocked<MongoQueue>;
      const { sms, email } = digestOptions();
      const agent: INotificationAgent = {
        handles: jest.fn().mockReturnValue(true),
        generate: jest.fn().mockReturnValue(parentNotification(AlertType.MISSING_ASSIGNMENT)),
      };
      const svc = new NotificationService([agent], mockDeliveryRouter, sms, email);
      const alert = new Alert({
        studentId: 'gideon-id',
        type: AlertType.MISSING_ASSIGNMENT,
        severity: 'warning',
        relatedData: {},
      });

      await svc.processAlertEnqueueDeliver(alert, mockQueue, [parentRecipient]);

      expect(mockQueue.add).not.toHaveBeenCalled();
      expect(sms.enqueueSmsForDigest).toHaveBeenCalledTimes(1);
      expect(email.enqueueEmailForDigest).toHaveBeenCalledTimes(1);
    });

    it('legacy processAlert sends the SMS now instead of queueing it for the digest', async () => {
      const { sms } = digestOptions();
      const svc = new NotificationService(
        mockStudentGenerator,
        mockParentGenerator,
        mockDeliveryRouter,
        sms
      );
      const alert = new Alert({
        studentId: 'gideon-id',
        type: AlertType.STUDENT_NEEDS_HELP,
        severity: 'info',
        relatedData: {},
      });
      const parent = new Notification({
        agentType: AgentType.PARENT,
        studentId: 'gideon-id',
        userId: 'parent-1',
        subject: 'subject',
        body: 'body',
        priority: NotificationPriority.MEDIUM,
        triggerType: AlertType.STUDENT_NEEDS_HELP,
        channels: [NotificationChannel.SMS],
      });
      mockStudentGenerator.generate.mockReturnValue(parent);
      mockParentGenerator.generate.mockReturnValue(parent);
      mockDeliveryRouter.route.mockResolvedValue({
        success: true,
        channel: NotificationChannel.SMS,
        messageId: 'sms-1',
        deliveredAt: new Date(),
      });

      await svc.processAlert(alert, parentRecipient);

      expect(sms.enqueueSmsForDigest).not.toHaveBeenCalled();
      expect(mockDeliveryRouter.route).toHaveBeenCalledTimes(1);
      const [sent, channel] = mockDeliveryRouter.route.mock.calls[0] as [
        Notification,
        NotificationChannel,
      ];
      expect(channel).toBe(NotificationChannel.SMS);
      expect(sent.userId).toBe(parentRecipient.parentPhone);
    });
  });

  describe('push fan-out per person and alertTypes (sharing S3)', () => {
    const parentNotif = (channels: NotificationChannel[]): Notification =>
      new Notification({
        agentType: AgentType.PARENT,
        studentId: 'student-123',
        userId: 'student-123',
        subject: 'Grade drop',
        body: 'Math fell to 72.',
        priority: NotificationPriority.HIGH,
        triggerType: AlertType.GRADE_DROP,
        channels,
      });
    const alert = new Alert({
      studentId: 'student-123',
      type: AlertType.GRADE_DROP,
      severity: 'warning',
      relatedData: {},
    });
    type AddCall = [
      string,
      string,
      { notificationPayload: { userId: string }; channel: NotificationChannel },
    ];
    const jobs = (q: { add: jest.Mock }): Array<{ to: string; channel: NotificationChannel }> =>
      (q.add.mock.calls as AddCall[]).map((c) => ({
        to: c[2].notificationPayload.userId,
        channel: c[2].channel,
      }));

    it("enqueues one push per person who chose it, to that person's own account", async () => {
      const mockQueue = { add: jest.fn().mockResolvedValue('job') };
      const agent: INotificationAgent = {
        handles: jest.fn().mockReturnValue(true),
        generate: jest
          .fn()
          .mockReturnValue(parentNotif([NotificationChannel.EMAIL, NotificationChannel.SMS])),
      };
      const svc = new NotificationService([agent], mockDeliveryRouter);
      const resolved = [
        { parentEmail: 'owner@example.com', userId: 'owner-id', push: true },
        { parentEmail: 'jess@example.com', userId: 'jess-id', push: true },
        { parentPhone: '+15550000002', userId: 'tom-id' },
      ];

      await svc.processAlertEnqueueDeliver(alert, mockQueue as unknown as MongoQueue, resolved);

      const sent = jobs(mockQueue);
      expect(sent).toEqual(
        expect.arrayContaining([
          { to: 'owner@example.com', channel: NotificationChannel.EMAIL },
          { to: 'owner-id', channel: NotificationChannel.PUSH },
          { to: 'jess@example.com', channel: NotificationChannel.EMAIL },
          { to: 'jess-id', channel: NotificationChannel.PUSH },
          { to: '+15550000002', channel: NotificationChannel.SMS },
        ])
      );
      expect(sent).toHaveLength(5);
      const pushTargets = sent
        .filter((j) => j.channel === NotificationChannel.PUSH)
        .map((j) => j.to);
      expect(pushTargets).toEqual(['owner-id', 'jess-id']);
    });

    it('skips a person whose alertTypes exclude this alert, on every channel', async () => {
      const mockQueue = { add: jest.fn().mockResolvedValue('job') };
      const agent: INotificationAgent = {
        handles: jest.fn().mockReturnValue(true),
        generate: jest.fn().mockReturnValue(parentNotif([NotificationChannel.EMAIL])),
      };
      const svc = new NotificationService([agent], mockDeliveryRouter);
      const resolved = [
        { parentEmail: 'owner@example.com', userId: 'owner-id', push: true },
        {
          parentEmail: 'only-missing@example.com',
          userId: 'om-id',
          push: true,
          alertTypes: [AlertType.MISSING_ASSIGNMENT],
        },
        {
          parentEmail: 'wants-grades@example.com',
          userId: 'wg-id',
          alertTypes: [AlertType.GRADE_DROP],
        },
        { parentEmail: 'empty-list@example.com', alertTypes: [] },
      ];

      await svc.processAlertEnqueueDeliver(alert, mockQueue as unknown as MongoQueue, resolved);

      const to = jobs(mockQueue).map((j) => j.to);
      expect(to).toEqual([
        'owner@example.com',
        'owner-id',
        'wants-grades@example.com',
        'empty-list@example.com',
      ]);
    });

    it('does not fan a PUSH channel on the notification out to resolved recipients generically', async () => {
      const mockQueue = { add: jest.fn().mockResolvedValue('job') };
      const agent: INotificationAgent = {
        handles: jest.fn().mockReturnValue(true),
        generate: jest
          .fn()
          .mockReturnValue(parentNotif([NotificationChannel.PUSH, NotificationChannel.EMAIL])),
      };
      const svc = new NotificationService([agent], mockDeliveryRouter);
      const resolved = [
        { parentEmail: 'owner@example.com', userId: 'owner-id' },
        { userId: 'jess-id', push: true },
        {
          parentEmail: 'kid@school.edu',
          userId: 'kid-id',
          push: true,
          recipientType: 'student' as const,
        },
      ];

      await svc.processAlertEnqueueDeliver(alert, mockQueue as unknown as MongoQueue, resolved);

      // The student's email still goes out; nobody gets a push except the adult who chose it,
      // and the notification's own PUSH channel is not broadcast to every resolved recipient.
      expect(jobs(mockQueue)).toEqual([
        { to: 'owner@example.com', channel: NotificationChannel.EMAIL },
        { to: 'jess-id', channel: NotificationChannel.PUSH },
        { to: 'kid@school.edu', channel: NotificationChannel.EMAIL },
      ]);
    });

    it('a sole push-only adult (owner silenced) gets exactly one push; nothing goes to the student id', async () => {
      const mockQueue = { add: jest.fn().mockResolvedValue('job') };
      const agent: INotificationAgent = {
        handles: jest.fn().mockReturnValue(true),
        generate: jest
          .fn()
          .mockReturnValue(parentNotif([NotificationChannel.EMAIL, NotificationChannel.PUSH])),
      };
      const svc = new NotificationService([agent], mockDeliveryRouter);

      await svc.processAlertEnqueueDeliver(alert, mockQueue as unknown as MongoQueue, [
        { userId: 'jess-id', push: true },
      ]);

      expect(jobs(mockQueue)).toEqual([{ to: 'jess-id', channel: NotificationChannel.PUSH }]);
    });

    it('in-process: a sole push-only adult gets exactly one push; nothing goes to the student id', async () => {
      const studentNotif = new Notification({
        agentType: AgentType.STUDENT,
        studentId: 'student-123',
        userId: 'student-123',
        subject: 's',
        body: 'b',
        priority: NotificationPriority.HIGH,
        triggerType: AlertType.GRADE_DROP,
        channels: [],
      });
      mockStudentGenerator.generate.mockReturnValue(studentNotif);
      mockParentGenerator.generate.mockReturnValue(
        parentNotif([NotificationChannel.EMAIL, NotificationChannel.PUSH])
      );
      mockDeliveryRouter.route.mockResolvedValue({
        success: true,
        channel: NotificationChannel.PUSH,
      });

      await notificationService.processAlert(alert, [{ userId: 'jess-id', push: true }]);

      expect(mockDeliveryRouter.route.mock.calls.map(([n, ch]) => [n.userId, ch])).toEqual([
        ['jess-id', NotificationChannel.PUSH],
      ]);
    });

    it('keeps the legacy single-recipient path: PUSH goes to the notification userId', async () => {
      const mockQueue = { add: jest.fn().mockResolvedValue('job') };
      const agent: INotificationAgent = {
        handles: jest.fn().mockReturnValue(true),
        generate: jest.fn().mockReturnValue(parentNotif([NotificationChannel.PUSH])),
      };
      const svc = new NotificationService([agent], mockDeliveryRouter);

      await svc.processAlertEnqueueDeliver(alert, mockQueue as unknown as MongoQueue);

      expect(jobs(mockQueue)).toEqual([{ to: 'student-123', channel: NotificationChannel.PUSH }]);
    });

    it('in-process processAlert routes one PUSH per person to their own account', async () => {
      const studentNotif = new Notification({
        agentType: AgentType.STUDENT,
        studentId: 'student-123',
        userId: 'student-123',
        subject: 's',
        body: 'b',
        priority: NotificationPriority.HIGH,
        triggerType: AlertType.GRADE_DROP,
        channels: [],
      });
      mockStudentGenerator.generate.mockReturnValue(studentNotif);
      mockParentGenerator.generate.mockReturnValue(parentNotif([NotificationChannel.EMAIL]));
      const ok: DeliveryResult = { success: true, channel: NotificationChannel.EMAIL };
      mockDeliveryRouter.route.mockResolvedValue(ok);

      await notificationService.processAlert(alert, [
        { parentEmail: 'owner@example.com', userId: 'owner-id', push: true },
        { parentEmail: 'jess@example.com', userId: 'jess-id', push: true },
        { parentEmail: 'quiet@example.com', userId: 'quiet-id', alertTypes: ['deadline'] },
      ]);

      const routed = mockDeliveryRouter.route.mock.calls.map(([n, ch]) => [n.userId, ch]);
      expect(routed).toEqual([
        ['owner@example.com', NotificationChannel.EMAIL],
        ['owner-id', NotificationChannel.PUSH],
        ['jess@example.com', NotificationChannel.EMAIL],
        ['jess-id', NotificationChannel.PUSH],
      ]);
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
