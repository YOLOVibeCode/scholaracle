import { MongoQueue } from '../queue/MongoQueue';
import { NotificationScheduler } from '../scheduler/NotificationScheduler';
import { NotificationWorker } from '../worker/NotificationWorker';
import { NotificationService } from '../service/NotificationService';
import { StudentNotificationGenerator } from '../generators/StudentNotificationGenerator';
import { ParentNotificationGenerator } from '../generators/ParentNotificationGenerator';
import { DeliveryRouter } from '../delivery/DeliveryRouter';
import { EmailDelivery } from '../delivery/EmailDelivery';
import { SMSDelivery } from '../delivery/SMSDelivery';
import {
  Alert,
  AlertType,
  NotificationPriority,
  AgentType,
  Notification,
} from '@scholaracle/contracts';
import type { Db } from 'mongodb';
import { MongoClient } from 'mongodb';
import type { MailService } from '@sendgrid/mail';
import type { Twilio } from 'twilio';

describe('NotificationFlow Integration', () => {
  let mongoClient: MongoClient;
  let database: Db;
  let mongoQueue: MongoQueue;
  let notificationScheduler: NotificationScheduler;
  let notificationWorker: NotificationWorker;
  let notificationService: NotificationService;
  let studentGenerator: StudentNotificationGenerator;
  let parentGenerator: ParentNotificationGenerator;
  let deliveryRouter: DeliveryRouter;
  let emailDelivery: EmailDelivery;
  let smsDelivery: SMSDelivery;
  let mockSendGrid: jest.Mocked<MailService>;
  let mockTwilio: jest.Mocked<Twilio>;

  beforeAll(async () => {
    // Connect to test MongoDB instance
    const mongoUri = process.env['MONGODB_URI'] ?? 'mongodb://localhost:27017';
    const dbName = `scholaracle_test_${Date.now()}`;

    try {
      mongoClient = new MongoClient(mongoUri);
      await mongoClient.connect();
      database = mongoClient.db(dbName);
    } catch (error) {
      console.error('Failed to connect to MongoDB. Skipping integration tests.');
      console.error(
        'To run integration tests, ensure MongoDB is running or set MONGODB_URI environment variable.'
      );
      throw error;
    }

    // Initialize queue
    mongoQueue = new MongoQueue(database);

    // Initialize delivery services with mocked clients
    mockSendGrid = {
      setApiKey: jest.fn(),
      send: jest.fn(),
    } as unknown as jest.Mocked<MailService>;

    mockTwilio = {
      messages: {
        create: jest.fn(),
      },
    } as unknown as jest.Mocked<Twilio>;

    emailDelivery = new EmailDelivery(
      {
        apiKey: 'test-api-key',
        fromEmail: 'test@example.com',
        fromName: 'Test',
      },
      mockSendGrid
    );

    smsDelivery = new SMSDelivery(
      {
        accountSid: 'test-account-sid',
        authToken: 'test-auth-token',
        fromNumber: '+1234567890',
      },
      mockTwilio
    );

    deliveryRouter = new DeliveryRouter([emailDelivery, smsDelivery]);

    // Initialize generators
    studentGenerator = new StudentNotificationGenerator();
    parentGenerator = new ParentNotificationGenerator();

    // Initialize notification service
    notificationService = new NotificationService(
      studentGenerator,
      parentGenerator,
      deliveryRouter
    );

    // Initialize scheduler
    notificationScheduler = new NotificationScheduler(mongoQueue);

    // Initialize worker
    notificationWorker = new NotificationWorker(mongoQueue, notificationService, {
      pollIntervalMs: 100,
      concurrency: 5,
    });
  });

  afterAll(async () => {
    await notificationWorker.stop();
    await database.dropDatabase();
    await mongoClient.close();
  });

  beforeEach(async () => {
    // Clear jobs collection before each test
    await database.collection('jobs').deleteMany({});

    // Reset mocks
    jest.clearAllMocks();
  });

  describe('End-to-End Flow', () => {
    it('should process alert through complete flow: Alert → Schedule → Worker → Delivery', async () => {
      // Arrange: Create a missing assignment alert
      const alert = new Alert({
        studentId: 'student-123',
        type: AlertType.MISSING_ASSIGNMENT,
        severity: 'high',
        relatedData: {
          assignmentName: 'Math Homework',
          courseName: 'Algebra I',
          dueDate: new Date(Date.now() + 86400000), // Tomorrow
        },
      });

      // Mock SendGrid and Twilio responses
      (mockSendGrid.send as jest.Mock).mockResolvedValue([
        {
          statusCode: 202,
          body: { message_id: 'email-123' },
        },
      ]);

      (mockTwilio.messages.create as jest.Mock).mockResolvedValue({
        sid: 'sms-123',
        status: 'queued',
      });

      // Act Step 1: Generate notifications from alert
      const studentNotification = studentGenerator.generate(alert);
      const parentNotification = parentGenerator.generate(alert);

      // Verify notifications were generated correctly
      expect(studentNotification).toBeDefined();
      expect(studentNotification.agentType).toBe(AgentType.STUDENT);
      expect(studentNotification.priority).toBe(NotificationPriority.HIGH);
      expect(studentNotification.subject).toContain('MISSING ASSIGNMENT');

      expect(parentNotification).toBeDefined();
      expect(parentNotification.agentType).toBe(AgentType.PARENT);
      expect(parentNotification.priority).toBe(NotificationPriority.HIGH);
      expect(parentNotification.subject).toContain('Missing Assignment');

      // Act Step 2: Schedule notifications
      await notificationScheduler.schedule(studentNotification, alert);
      await notificationScheduler.schedule(parentNotification, alert);

      // Verify jobs were created
      const jobsBefore = await database.collection('jobs').countDocuments({
        status: 'pending',
      });
      expect(jobsBefore).toBeGreaterThanOrEqual(2);

      // Act Step 3: Start worker and process jobs
      notificationWorker.start();

      // Wait for worker to process jobs
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Act Step 4: Verify jobs were processed
      const jobsAfter = await database.collection('jobs').countDocuments({
        status: 'completed',
      });
      expect(jobsAfter).toBeGreaterThanOrEqual(2);

      // Verify delivery services were called
      expect(mockSendGrid.send).toHaveBeenCalled();
      expect(mockTwilio.messages.create).toHaveBeenCalled();

      // Stop worker
      await notificationWorker.stop();
    });

    it('should handle scheduled delivery correctly', async () => {
      // Arrange: Create alert for future delivery
      const alert = new Alert({
        studentId: 'student-456',
        type: AlertType.DEADLINE,
        severity: 'medium',
        relatedData: {
          assignmentName: 'Science Project',
          courseName: 'Biology',
          dueDate: new Date(Date.now() + 3600000), // 1 hour from now
        },
      });

      const futureDate = new Date(Date.now() + 2000); // 2 seconds from now
      const baseNotification = studentGenerator.generate(alert);
      const notification = new Notification({
        agentType: baseNotification.agentType,
        studentId: baseNotification.studentId,
        userId: baseNotification.userId,
        subject: baseNotification.subject,
        body: baseNotification.body,
        priority: baseNotification.priority,
        triggerType: baseNotification.triggerType,
        triggerData: baseNotification.triggerData,
        channels: baseNotification.channels,
        scheduledFor: futureDate,
        actions: baseNotification.actions,
      });

      (mockSendGrid.send as jest.Mock).mockResolvedValue([
        {
          statusCode: 202,
          body: { message_id: 'email-456' },
        },
      ]);

      // Act: Schedule for future delivery
      await notificationScheduler.schedule(notification, alert);

      // Verify job was created with delay
      const jobs = await database.collection('jobs').find({}).toArray();
      expect(jobs.length).toBe(1);
      expect(jobs[0]?.['status']).toBe('pending');

      // Start worker
      notificationWorker.start();

      // Wait for scheduled time + processing time
      await new Promise((resolve) => setTimeout(resolve, 3000));

      // Verify job was processed after delay
      const completedJobs = await database
        .collection('jobs')
        .find({ status: 'completed' })
        .toArray();
      expect(completedJobs.length).toBe(1);

      await notificationWorker.stop();
    });

    it('should handle job failures and retries', async () => {
      // Arrange: Create alert
      const alert = new Alert({
        studentId: 'student-789',
        type: AlertType.GRADE_DROP,
        severity: 'critical',
        relatedData: {
          courseName: 'History',
          previousGrade: 85,
          currentGrade: 72,
        },
      });

      const notification = studentGenerator.generate(alert);

      // Mock delivery to fail first time, succeed on retry
      let callCount = 0;
      (mockSendGrid.send as jest.Mock).mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          throw new Error('Temporary delivery failure');
        }
        return Promise.resolve([
          {
            statusCode: 202,
            body: { message_id: 'email-789' },
          },
        ]);
      });

      // Act: Schedule notification
      await notificationScheduler.schedule(notification, alert);

      // Start worker
      notificationWorker.start();

      // Wait for processing and retry
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Verify retry occurred
      expect(emailDelivery.deliver).toHaveBeenCalledTimes(2);

      await notificationWorker.stop();
    });

    it('should process multiple alerts concurrently', async () => {
      // Arrange: Create multiple alerts
      const alerts = [
        new Alert({
          studentId: 'student-1',
          type: AlertType.MISSING_ASSIGNMENT,
          severity: 'high',
          relatedData: { assignmentName: 'Assignment 1' },
        }),
        new Alert({
          studentId: 'student-2',
          type: AlertType.DEADLINE,
          severity: 'medium',
          relatedData: { assignmentName: 'Assignment 2' },
        }),
        new Alert({
          studentId: 'student-3',
          type: AlertType.TEST,
          severity: 'high',
          relatedData: { testName: 'Test 1' },
        }),
      ];

      (mockSendGrid.send as jest.Mock).mockResolvedValue([
        {
          statusCode: 202,
          body: { message_id: 'email-batch' },
        },
      ]);

      // Act: Schedule all notifications
      for (const alert of alerts) {
        const studentNotification = studentGenerator.generate(alert);
        const parentNotification = parentGenerator.generate(alert);
        await notificationScheduler.schedule(studentNotification, alert);
        await notificationScheduler.schedule(parentNotification, alert);
      }

      // Verify all jobs were created
      const pendingJobs = await database.collection('jobs').countDocuments({
        status: 'pending',
      });
      expect(pendingJobs).toBe(6); // 3 alerts × 2 notifications each

      // Start worker
      notificationWorker.start();

      // Wait for all jobs to process
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Verify all jobs were completed
      const completedJobs = await database.collection('jobs').countDocuments({
        status: 'completed',
      });
      expect(completedJobs).toBe(6);

      // Verify delivery was called for all notifications
      expect(mockSendGrid.send).toHaveBeenCalledTimes(6);

      await notificationWorker.stop();
    });
  });
});
