import request from 'supertest';
import { AlertType } from '@scholaracle/contracts';

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

  beforeAll(() => {
    // Create app - services will use mocked SendGrid/Twilio
    app = createApp({
      sendGridApiKey: 'SG.test-key',
      sendGridFromEmail: 'test@example.com',
      sendGridFromName: 'Test',
      twilioAccountSid: 'TEST_ACCOUNT_SID_PLACEHOLDER_NOT_REAL',
      twilioAuthToken: 'test-token',
      twilioFromNumber: '+1234567890',
    });
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /api/alerts → NotificationService → Delivery', () => {
    it('should process alert through complete flow: API → Service → Delivery', async () => {
      // Arrange
      const alertData = {
        studentId: 'student-123',
        type: AlertType.MISSING_ASSIGNMENT,
        severity: 'high',
        relatedData: {
          assignmentName: 'Math Homework',
          courseName: 'Algebra I',
          dueDate: new Date(Date.now() + 86400000).toISOString(),
        },
      };

      // Act
      const response = await request(app).post('/api/alerts').send(alertData);

      // Assert
      if (response.status !== 201) {
        // eslint-disable-next-line no-console
        console.error('Unexpected status:', response.status, response.body);
      }
      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({
        success: true,
        studentNotification: expect.objectContaining({
          id: expect.any(String),
          agentType: 'student',
          subject: expect.stringMatching(/MISSING ASSIGNMENT/i),
        }),
        parentNotification: expect.objectContaining({
          id: expect.any(String),
          agentType: 'parent',
          subject: expect.stringMatching(/Missing Assignment|MISSING ASSIGNMENT/i),
        }),
        deliveryResults: expect.any(Array),
      });
      expect(response.body.deliveryResults.length).toBeGreaterThan(0);
    });

    it('should handle grade drop alert correctly', async () => {
      // Arrange
      const alertData = {
        studentId: 'student-456',
        type: AlertType.GRADE_DROP,
        severity: 'critical',
        relatedData: {
          studentName: 'John Doe',
          course: 'History',
          courseName: 'History',
          previousGrade: 85,
          currentGrade: 72,
          change: -13,
          timeframe: 'Last 2 weeks',
          contributingFactors: ['Missing assignments', 'Low test scores'],
        },
      };

      // Act
      const response = await request(app).post('/api/alerts').send(alertData);

      // Assert
      if (response.status !== 201) {
        // eslint-disable-next-line no-console
        console.error('Grade drop test error:', response.status, response.body);
      }
      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.studentNotification.subject).toMatch(/GRADE DROP|Grade Drop/i);
      expect(response.body.parentNotification.subject).toMatch(/Grade Drop/i);
    });

    it('should handle deadline alert correctly', async () => {
      // Arrange
      const alertData = {
        studentId: 'student-789',
        type: AlertType.DEADLINE,
        severity: 'medium',
        relatedData: {
          assignmentName: 'Science Project',
          courseName: 'Biology',
          dueDate: new Date(Date.now() + 3600000).toISOString(),
        },
      };

      // Act
      const response = await request(app).post('/api/alerts').send(alertData);

      // Assert
      if (response.status !== 201) {
        // eslint-disable-next-line no-console
        console.error('Deadline test error:', response.status, response.body);
      }
      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      // Deadline template uses format like "Assignment Due Dec 9, 11:06 PM"
      expect(response.body.studentNotification.subject).toMatch(/Due|Deadline|DEADLINE/i);
    });

    it('should return 400 for invalid alert type', async () => {
      // Arrange
      const alertData = {
        studentId: 'student-123',
        type: 'invalid_type',
        severity: 'high',
        relatedData: {},
      };

      // Act
      const response = await request(app).post('/api/alerts').send(alertData);

      // Assert
      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Invalid alert type');
    });

    it('should return 400 for missing required fields', async () => {
      // Arrange
      const alertData = {
        studentId: 'student-123',
        // Missing type and severity
      };

      // Act
      const response = await request(app).post('/api/alerts').send(alertData);

      // Assert
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
