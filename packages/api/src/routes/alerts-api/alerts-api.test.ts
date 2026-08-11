import request from 'supertest';
import express, { type Express } from 'express';
import { MongoClient, ObjectId, type Db } from 'mongodb';
import { AuthService } from '@scholaracle/auth';
import { AlertRepository } from '@scholaracle/database';
import { alertsApiRouter } from './alerts-api';
import { authMiddleware } from '../../middleware/auth';
import { createErrorHandler } from '../../middleware/errorHandler';

describe('Alerts API Routes', () => {
  let app: Express;
  let database: Db;
  let mongoClient: MongoClient;
  let authService: AuthService;
  let alertRepo: AlertRepository;
  let testToken: string;
  let testUserId: string;

  beforeAll(async () => {
    // Connect to test database
    const mongodbUri = process.env['MONGODB_URI'] ?? 'mongodb://localhost:27017';
    const dbName = process.env['MONGODB_DB_NAME'] ?? 'scholaracle_test';

    try {
      mongoClient = new MongoClient(mongodbUri);
      await mongoClient.connect();
      database = mongoClient.db(dbName);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.warn('MongoDB not available, skipping integration tests');
      return;
    }

    authService = new AuthService(database);
    alertRepo = new AlertRepository(database);

    // Setup Express app with routes
    app = express();
    app.use(express.json());
    app.use('/api/alerts-api', authMiddleware(authService), alertsApiRouter({ database }));
    app.use(createErrorHandler());
  });

  afterAll(async () => {
    if (mongoClient) {
      await mongoClient.close();
    }
  });

  beforeEach(async () => {
    if (database) {
      // Clean up test data before each test
      await database.collection('alerts').deleteMany({});
      await database.collection('users').deleteMany({ email: 'alerts@example.com' });

      // Re-register test user for each test
      const registerResult = await authService.register(
        'alerts@example.com',
        'password123',
        'Alerts User'
      );
      if (registerResult.success && registerResult.user && registerResult.token) {
        testUserId = registerResult.user.id;
        testToken = registerResult.token;
      } else {
        throw new Error(`Failed to register test user: ${registerResult.error ?? 'Unknown error'}`);
      }
    }
  });

  describe('GET /api/alerts-api', () => {
    it('should return empty array when user has no alerts', async () => {
      const response = await request(app)
        .get('/api/alerts-api')
        .set('Authorization', `Bearer ${testToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toEqual([]);
    });

    it('should return alerts for user', async () => {
      // Insert test alerts directly via repository
      await alertRepo.create({
        userId: testUserId,
        studentId: 'student-1',
        type: 'missing_assignment',
        severity: 'high',
        message: 'Test alert one',
      });

      await alertRepo.create({
        userId: testUserId,
        studentId: 'student-2',
        type: 'grade_drop',
        severity: 'medium',
        message: 'Test alert two',
      });

      const response = await request(app)
        .get('/api/alerts-api')
        .set('Authorization', `Bearer ${testToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(2);
      expect(response.body[0]).toHaveProperty('id');
      expect(response.body[0]).toHaveProperty('message');
      expect(response.body[0]).toHaveProperty('type');
      expect(response.body[0]).toHaveProperty('severity');
    });
  });

  describe('GET /api/alerts-api/:id', () => {
    it('should get single alert by id', async () => {
      const alert = await alertRepo.create({
        userId: testUserId,
        studentId: 'student-1',
        type: 'missing_assignment',
        severity: 'high',
        message: 'Test alert',
      });

      const alertId = alert.id ?? '';

      const response = await request(app)
        .get(`/api/alerts-api/${alertId}`)
        .set('Authorization', `Bearer ${testToken}`);

      expect(response.status).toBe(200);
      expect(response.body.id).toBe(alertId);
      expect(response.body.message).toBe('Test alert');
      expect(response.body.type).toBe('missing_assignment');
      expect(response.body.severity).toBe('high');
    });

    it('should return 404 for non-existent alert', async () => {
      const fabricatedId = new ObjectId().toString();

      const response = await request(app)
        .get(`/api/alerts-api/${fabricatedId}`)
        .set('Authorization', `Bearer ${testToken}`);

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
    });

    it('should return 403 when accessing another user alert', async () => {
      // Create an alert belonging to a different user
      const otherUserId = new ObjectId().toString();
      const alert = await alertRepo.create({
        userId: otherUserId,
        studentId: 'student-1',
        type: 'missing_assignment',
        severity: 'high',
        message: 'Other user alert',
      });

      const alertId = alert.id ?? '';

      const response = await request(app)
        .get(`/api/alerts-api/${alertId}`)
        .set('Authorization', `Bearer ${testToken}`);

      expect(response.status).toBe(403);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Forbidden');
      expect(response.body.code).toBe('FORBIDDEN');
    });
  });

  describe('POST /api/alerts-api/:id/acknowledge', () => {
    it('should acknowledge an alert', async () => {
      const alert = await alertRepo.create({
        userId: testUserId,
        studentId: 'student-1',
        type: 'missing_assignment',
        severity: 'high',
        message: 'Alert to acknowledge',
      });

      const alertId = alert.id ?? '';

      const response = await request(app)
        .post(`/api/alerts-api/${alertId}/acknowledge`)
        .set('Authorization', `Bearer ${testToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    it('should return 404 when acknowledging non-existent alert', async () => {
      const fabricatedId = new ObjectId().toString();

      const response = await request(app)
        .post(`/api/alerts-api/${fabricatedId}/acknowledge`)
        .set('Authorization', `Bearer ${testToken}`);

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
    });
  });

  describe('DELETE /api/alerts-api/:id', () => {
    it('should delete an alert', async () => {
      const alert = await alertRepo.create({
        userId: testUserId,
        studentId: 'student-1',
        type: 'missing_assignment',
        severity: 'high',
        message: 'Alert to delete',
      });

      const alertId = alert.id ?? '';

      const response = await request(app)
        .delete(`/api/alerts-api/${alertId}`)
        .set('Authorization', `Bearer ${testToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);

      // Verify alert is gone
      const getResponse = await request(app)
        .get(`/api/alerts-api/${alertId}`)
        .set('Authorization', `Bearer ${testToken}`);

      expect(getResponse.status).toBe(404);
    });

    it('should return 404 when deleting non-existent alert', async () => {
      const fabricatedId = new ObjectId().toString();

      const response = await request(app)
        .delete(`/api/alerts-api/${fabricatedId}`)
        .set('Authorization', `Bearer ${testToken}`);

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
    });
  });
});
