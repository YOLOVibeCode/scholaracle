import request from 'supertest';
import { MongoClient, type Db } from 'mongodb';
import { AlertType } from '@scholaracle/contracts';
import { AuthService } from '@scholaracle/auth';
import { StudentRepository } from '@scholaracle/database';

// Mock SendGrid before importing server
jest.mock('@sendgrid/mail', () => {
  const mockSend = jest.fn().mockResolvedValue([
    {
      statusCode: 202,
      body: { message_id: 'email-123' },
    },
  ]);

  return {
    __esModule: true,
    default: {
      setApiKey: jest.fn(),
      send: mockSend,
    },
  };
});

// Mock Twilio before importing server
jest.mock('twilio', () => {
  const mockCreate = jest.fn().mockResolvedValue({
    sid: 'sms-123',
    status: 'queued',
  });

  return {
    __esModule: true,
    default: jest.fn(() => ({
      messages: {
        create: mockCreate,
      },
    })),
  };
});

// Mock Firebase Admin before importing server
jest.mock('firebase-admin', () => {
  const mockSend = jest.fn().mockResolvedValue('fcm-message-id');

  return {
    __esModule: true,
    messaging: jest.fn(() => ({
      send: mockSend,
    })),
    initializeApp: jest.fn(),
  };
});

import { createApp } from '../server';

describe('API Notification Flow Integration', () => {
  let app: ReturnType<typeof createApp>;
  let mongoClient: MongoClient;
  let database: Db;
  let userToken: string;
  let studentId: string;
  // Note: integration test now uses real DB + auth — DEF-003 closed the
  // unauthenticated POST /api/alerts pathway this suite previously exercised.

  const jwtSecret = 'integration-test-secret-do-not-use-in-prod';

  beforeAll(async () => {
    const uri = process.env['MONGODB_URI'] ?? 'mongodb://localhost:27017';
    const dbName = process.env['MONGODB_DB_NAME'] ?? 'scholaracle_test';
    mongoClient = new MongoClient(uri);
    await mongoClient.connect();
    database = mongoClient.db(dbName);

    await database.collection('users').deleteMany({ email: 'integration@apiflow.test' });
    await database.collection('students').deleteMany({ name: 'IntegrationFlow Student' });

    const authService = new AuthService(database, jwtSecret);
    const reg = await authService.register(
      'integration@apiflow.test',
      'password123',
      'Integration User'
    );
    if (!reg.success || !reg.user?.id || !reg.token) {
      throw new Error('Failed to register integration user');
    }
    userToken = reg.token;

    const studentRepo = new StudentRepository(database);
    const created = await studentRepo.create({
      userId: reg.user.id,
      name: 'IntegrationFlow Student',
      grade: 9,
      studentId: 'IFLOW-001',
    });
    studentId = created._id!.toString();

    app = createApp(
      {
        jwtSecret,
        sendGridApiKey: 'SG.test-key',
        sendGridFromEmail: 'test@example.com',
        sendGridFromName: 'Test',
        twilioAccountSid: 'TEST_ACCOUNT_SID_PLACEHOLDER_NOT_REAL',
        twilioAuthToken: 'test-token',
        twilioFromNumber: '+1234567890',
      },
      database
    );
  });

  afterAll(async () => {
    // MongoQueue runs a fire-and-forget _ensureIndexes() during construction;
    // give it a tick to settle before closing so we don't get a
    // MongoClientClosedError thrown out of the unhandled rejection handler.
    await new Promise((resolve) => setTimeout(resolve, 200));
    await mongoClient.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /api/alerts → enqueue', () => {
    // With a database wired, the route enqueues a notify job and returns 202.
    // End-to-end notification *content* is covered in @scholaracle/agents tests;
    // here we verify the API → queue handoff and validation wiring.

    it('enqueues a missing-assignment alert and returns 202 with a jobId', async () => {
      const response = await request(app)
        .post('/api/alerts')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          studentId,
          type: AlertType.MISSING_ASSIGNMENT,
          severity: 'high',
          relatedData: {
            assignmentName: 'Math Homework',
            courseName: 'Algebra I',
            dueDate: new Date(Date.now() + 86400000).toISOString(),
          },
        });

      expect(response.status).toBe(202);
      expect(response.body).toMatchObject({
        jobId: expect.any(String),
        message: 'Notification queued',
      });
    });

    it('enqueues a grade-drop alert and returns 202', async () => {
      const response = await request(app)
        .post('/api/alerts')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          studentId,
          type: AlertType.GRADE_DROP,
          severity: 'critical',
          relatedData: {
            previousGrade: 85,
            currentGrade: 72,
          },
        });

      expect(response.status).toBe(202);
      expect(response.body.jobId).toEqual(expect.any(String));
    });

    it('enqueues a deadline alert and returns 202', async () => {
      const response = await request(app)
        .post('/api/alerts')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          studentId,
          type: AlertType.DEADLINE,
          severity: 'medium',
          relatedData: {
            assignmentName: 'Science Project',
            courseName: 'Biology',
            dueDate: new Date(Date.now() + 3600000).toISOString(),
          },
        });

      expect(response.status).toBe(202);
      expect(response.body.jobId).toEqual(expect.any(String));
    });

    it('returns 400 for invalid alert type', async () => {
      const response = await request(app)
        .post('/api/alerts')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          studentId,
          type: 'invalid_type',
          severity: 'high',
          relatedData: {},
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Invalid alert type');
    });

    it('returns 400 for missing required fields', async () => {
      const response = await request(app)
        .post('/api/alerts')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          studentId,
          // Missing type and severity
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Missing required fields');
    });
  });

  describe('GET /api/health', () => {
    it('should return health status', async () => {
      // Act
      const response = await request(app).get('/api/health');

      // Assert
      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        status: 'ok',
        timestamp: expect.any(String),
      });
    });
  });
});
