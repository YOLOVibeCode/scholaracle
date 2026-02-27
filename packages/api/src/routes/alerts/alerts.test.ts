import request from 'supertest';
import express, { type Express } from 'express';
import { MongoClient, type Db, ObjectId } from 'mongodb';
import { AlertRepository } from '@scholaracle/database';
import { AuthService } from '@scholaracle/auth';
import { alertsApiRouter } from '../alerts-api/alerts-api';
import { authMiddleware } from '../../middleware/auth';

describe('Alerts API Routes', () => {
  let app: Express;
  let database: Db;
  let mongoClient: MongoClient;
  let authService: AuthService;
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

    // Create test user and get token
    authService = new AuthService(database);
    const registerResult = await authService.register(
      'test@example.com',
      'password123',
      'Test User'
    );
    if (registerResult.success && registerResult.user) {
      testUserId = registerResult.user.id;
      testToken = registerResult.token ?? '';
    }

    // Setup Express app with routes
    app = express();
    app.use(express.json());
    app.use('/api/alerts-api', authMiddleware(authService), alertsApiRouter({ database }));
  });

  afterAll(async () => {
    if (mongoClient) {
      await mongoClient.close();
    }
  });

  beforeEach(async () => {
    // Clean up alerts collection before each test
    if (database) {
      await database.collection('alerts').deleteMany({});
    }
  });

  describe('GET /api/alerts-api', () => {
    it('should return 401 without auth token', async () => {
      const appWithoutAuth = express();
      appWithoutAuth.use(express.json());
      appWithoutAuth.use('/api/alerts-api', alertsApiRouter({ database }));

      const response = await request(appWithoutAuth).get('/api/alerts-api');

      expect(response.status).toBe(401);
    });

    it('should return empty array when no alerts exist', async () => {
      const response = await request(app)
        .get('/api/alerts-api')
        .set('Authorization', `Bearer ${testToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toEqual([]);
    });

    it('should return user alerts', async () => {
      // Arrange - Create test alerts
      const alertRepository = new AlertRepository(database);
      await alertRepository.create({
        studentId: 'student-123',
        userId: testUserId,
        type: 'MISSING_ASSIGNMENT',
        severity: 'warning',
        message: 'Test alert 1',
      });
      await alertRepository.create({
        studentId: 'student-123',
        userId: testUserId,
        type: 'GRADE_DROP',
        severity: 'critical',
        message: 'Test alert 2',
      });

      // Act
      const response = await request(app)
        .get('/api/alerts-api')
        .set('Authorization', `Bearer ${testToken}`);

      // Assert
      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBe(2);
      expect(response.body[0]).toHaveProperty('id');
      expect(response.body[0]).toHaveProperty('type', 'MISSING_ASSIGNMENT');
      expect(response.body[1]).toHaveProperty('type', 'GRADE_DROP');
    });

    it('should not return other user alerts', async () => {
      // Arrange - Create alert for different user
      const alertRepository = new AlertRepository(database);
      await alertRepository.create({
        studentId: 'student-456',
        userId: 'other-user-id',
        type: 'MISSING_ASSIGNMENT',
        severity: 'warning',
        message: 'Other user alert',
      });

      // Act
      const response = await request(app)
        .get('/api/alerts-api')
        .set('Authorization', `Bearer ${testToken}`);

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.length).toBe(0);
    });
  });

  describe('GET /api/alerts-api/:id', () => {
    it('should return single alert by id', async () => {
      // Arrange
      const alertRepository = new AlertRepository(database);
      await alertRepository.create({
        studentId: 'student-123',
        userId: testUserId,
        type: 'MISSING_ASSIGNMENT',
        severity: 'warning',
        message: 'Test alert',
      });

      // Get the ID from repository result
      const allAlerts = await alertRepository.findByUserId(testUserId);
      const alertId = allAlerts[0]?.id ?? '';

      // Act
      const response = await request(app)
        .get(`/api/alerts-api/${alertId}`)
        .set('Authorization', `Bearer ${testToken}`);

      // Assert
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('id');
      expect(response.body).toHaveProperty('type', 'MISSING_ASSIGNMENT');
    });

    it('should return 404 for non-existent alert', async () => {
      const fakeId = new ObjectId().toString();

      const response = await request(app)
        .get(`/api/alerts-api/${fakeId}`)
        .set('Authorization', `Bearer ${testToken}`);

      expect(response.status).toBe(404);
    });

    it('should return 403 for other user alert', async () => {
      // Arrange
      const alertRepository = new AlertRepository(database);
      await alertRepository.create({
        studentId: 'student-456',
        userId: 'other-user-id',
        type: 'MISSING_ASSIGNMENT',
        severity: 'warning',
        message: 'Other user alert',
      });

      const allAlerts = await alertRepository.findByUserId('other-user-id');
      const otherAlertId = allAlerts[0]?.id ?? '';

      // Act
      const response = await request(app)
        .get(`/api/alerts-api/${otherAlertId}`)
        .set('Authorization', `Bearer ${testToken}`);

      // Assert
      expect(response.status).toBe(403);
    });
  });

  describe('POST /api/alerts-api/:id/acknowledge', () => {
    it('should acknowledge alert successfully', async () => {
      // Arrange
      const alertRepository = new AlertRepository(database);
      await alertRepository.create({
        studentId: 'student-123',
        userId: testUserId,
        type: 'MISSING_ASSIGNMENT',
        severity: 'warning',
        message: 'Test alert',
      });

      const allAlerts = await alertRepository.findByUserId(testUserId);
      const alertId = allAlerts[0]?.id ?? '';

      // Act
      const response = await request(app)
        .post(`/api/alerts-api/${alertId}/acknowledge`)
        .set('Authorization', `Bearer ${testToken}`);

      // Assert
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);

      // Verify alert is acknowledged
      const updatedAlert = await alertRepository.findById(alertId);
      expect(updatedAlert?.acknowledged).toBe(true);
    });

    it('should return 404 for non-existent alert', async () => {
      const fakeId = new ObjectId().toString();

      const response = await request(app)
        .post(`/api/alerts-api/${fakeId}/acknowledge`)
        .set('Authorization', `Bearer ${testToken}`);

      expect(response.status).toBe(404);
    });

    it('should return 403 for other user alert', async () => {
      // Arrange
      const alertRepository = new AlertRepository(database);
      await alertRepository.create({
        studentId: 'student-456',
        userId: 'other-user-id',
        type: 'MISSING_ASSIGNMENT',
        severity: 'warning',
        message: 'Other user alert',
      });

      const allAlerts = await alertRepository.findByUserId('other-user-id');
      const otherAlertId = allAlerts[0]?.id ?? '';

      // Act
      const response = await request(app)
        .post(`/api/alerts-api/${otherAlertId}/acknowledge`)
        .set('Authorization', `Bearer ${testToken}`);

      // Assert
      expect(response.status).toBe(403);
    });
  });

  describe('DELETE /api/alerts-api/:id', () => {
    it('should delete alert successfully', async () => {
      // Arrange
      const alertRepository = new AlertRepository(database);
      await alertRepository.create({
        studentId: 'student-123',
        userId: testUserId,
        type: 'MISSING_ASSIGNMENT',
        severity: 'warning',
        message: 'Test alert',
      });

      const allAlerts = await alertRepository.findByUserId(testUserId);
      const alertId = allAlerts[0]?.id ?? '';

      // Act
      const response = await request(app)
        .delete(`/api/alerts-api/${alertId}`)
        .set('Authorization', `Bearer ${testToken}`);

      // Assert
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('success', true);

      // Verify alert is deleted
      const deletedAlert = await alertRepository.findById(alertId);
      expect(deletedAlert).toBeNull();
    });

    it('should return 404 for non-existent alert', async () => {
      const fakeId = new ObjectId().toString();

      const response = await request(app)
        .delete(`/api/alerts-api/${fakeId}`)
        .set('Authorization', `Bearer ${testToken}`);

      expect(response.status).toBe(404);
    });

    it('should return 403 for other user alert', async () => {
      // Arrange
      const alertRepository = new AlertRepository(database);
      await alertRepository.create({
        studentId: 'student-456',
        userId: 'other-user-id',
        type: 'MISSING_ASSIGNMENT',
        severity: 'warning',
        message: 'Other user alert',
      });

      const allAlerts = await alertRepository.findByUserId('other-user-id');
      const otherAlertId = allAlerts[0]?.id ?? '';

      // Act
      const response = await request(app)
        .delete(`/api/alerts-api/${otherAlertId}`)
        .set('Authorization', `Bearer ${testToken}`);

      // Assert
      expect(response.status).toBe(403);
    });
  });
});
