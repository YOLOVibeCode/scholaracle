import request from 'supertest';
import express, { type Express, type Request, type Response, type NextFunction } from 'express';
import { alertsRouter } from './alerts';
import { NotificationService } from '@scholaracle/agents';
import { Notification, AgentType, NotificationPriority, AlertType } from '@scholaracle/contracts';

describe('alertsRouter (legacy POST /api/alerts)', () => {
  const validAlertBody = {
    studentId: 'student-123',
    type: AlertType.MISSING_ASSIGNMENT,
    severity: 'high',
    relatedData: { course: 'Math', assignment: 'HW' },
  };

  // Stand-in for authMiddleware in unit tests — production wiring (server.ts) uses
  // the real authMiddleware. DEF-003 requires the handler to enforce req.userId,
  // so all tests below must inject one.
  function fakeAuth(userId: string) {
    return (req: Request, _res: Response, next: NextFunction): void => {
      (req as Request & { userId: string }).userId = userId;
      next();
    };
  }

  describe('when queue is provided', () => {
    it('should return 202 and jobId when enqueue succeeds', async () => {
      const mockQueue = {
        add: jest.fn().mockResolvedValue('job-id-456'),
      };
      const mockNotificationService = { processAlert: jest.fn() } as unknown as NotificationService;
      const app: Express = express();
      app.use(express.json());
      app.use(
        '/api/alerts',
        fakeAuth('user-test-123'),
        alertsRouter(mockNotificationService, {
          queue: mockQueue as unknown as import('@scholaracle/agents').MongoQueue,
        })
      );

      const response = await request(app).post('/api/alerts').send(validAlertBody);

      expect(response.status).toBe(202);
      expect(response.body).toMatchObject({
        jobId: 'job-id-456',
        message: 'Notification queued',
      });
      expect(mockQueue.add).toHaveBeenCalledWith(
        'notify',
        'deliver-notification',
        expect.objectContaining({
          alert: expect.objectContaining({
            studentId: 'student-123',
            type: AlertType.MISSING_ASSIGNMENT,
            severity: 'high',
            relatedData: validAlertBody.relatedData,
          }),
        }),
        expect.any(Object)
      );
      expect(mockNotificationService.processAlert).not.toHaveBeenCalled();
    });
  });

  describe('when queue is not provided', () => {
    it('should return 201 and notification payload when processAlert succeeds', async () => {
      const mockResult = {
        studentNotification: new Notification({
          agentType: AgentType.STUDENT,
          studentId: 'student-123',
          userId: 'student-123',
          subject: 'Test',
          body: 'Body',
          priority: NotificationPriority.HIGH,
          triggerType: AlertType.MISSING_ASSIGNMENT,
        }),
        parentNotification: new Notification({
          agentType: AgentType.PARENT,
          studentId: 'student-123',
          userId: 'parent-1',
          subject: 'Test',
          body: 'Body',
          priority: NotificationPriority.HIGH,
          triggerType: AlertType.MISSING_ASSIGNMENT,
        }),
        deliveryResults: [],
      };
      const mockNotificationService = {
        processAlert: jest.fn().mockResolvedValue(mockResult),
      } as unknown as NotificationService;
      const app: Express = express();
      app.use(express.json());
      app.use('/api/alerts', fakeAuth('user-test-123'), alertsRouter(mockNotificationService));

      const response = await request(app).post('/api/alerts').send(validAlertBody);

      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({
        success: true,
        studentNotification: expect.objectContaining({
          id: expect.any(String),
          agentType: 'student',
          subject: 'Test',
        }),
        parentNotification: expect.objectContaining({
          agentType: 'parent',
          subject: 'Test',
        }),
      });
      expect(mockNotificationService.processAlert).toHaveBeenCalledTimes(1);
    });
  });

  describe('validation', () => {
    it('should return 400 when required fields are missing', async () => {
      const mockNotificationService = { processAlert: jest.fn() } as unknown as NotificationService;
      const app: Express = express();
      app.use(express.json());
      app.use('/api/alerts', fakeAuth('user-test-123'), alertsRouter(mockNotificationService));

      const response = await request(app).post('/api/alerts').send({
        studentId: 'student-123',
        // type and severity missing
      });

      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({ success: false, error: expect.any(String) });
      expect(mockNotificationService.processAlert).not.toHaveBeenCalled();
    });
  });
});
