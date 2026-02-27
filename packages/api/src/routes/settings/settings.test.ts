import request from 'supertest';
import express, { type Express } from 'express';
import { MongoClient, type Db } from 'mongodb';
import { UserRepository } from '@scholaracle/database';
import { AuthService } from '@scholaracle/auth';
import { settingsRouter } from './settings';
import { authMiddleware } from '../../middleware/auth';

describe('Settings API Routes', () => {
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

    // Clean up any existing test users
    await database.collection('users').deleteMany({ email: 'settings@example.com' });

    // Create test user and get token
    authService = new AuthService(database);
    const registerResult = await authService.register(
      'settings@example.com',
      'password123',
      'Settings User'
    );
    if (registerResult.success && registerResult.user && registerResult.token) {
      testUserId = registerResult.user.id;
      testToken = registerResult.token;
    } else {
      // Try login if registration failed (user might already exist)
      const loginResult = await authService.login('settings@example.com', 'password123');
      if (loginResult.success && loginResult.user && loginResult.token) {
        testUserId = loginResult.user.id;
        testToken = loginResult.token;
      } else {
        throw new Error(
          `Failed to authenticate test user: ${registerResult.error ?? loginResult.error ?? 'Unknown error'}`
        );
      }
    }

    // Setup Express app with routes
    app = express();
    app.use(express.json());
    app.use('/api/settings', authMiddleware(authService), settingsRouter({ database }));
  });

  afterAll(async () => {
    if (mongoClient) {
      await mongoClient.close();
    }
  });

  beforeEach(async () => {
    // Reset user settings before each test
    if (database && testUserId) {
      const userRepository = new UserRepository(database);
      const user = await userRepository.findById(testUserId);
      if (user) {
        await userRepository.update(testUserId, {
          preferences: {
            notifications: {
              push: true,
              email: true,
              sms: false,
            },
            alerts: {
              gradeDrop: 5,
              daysBeforeDeadline: 2,
              lowGradeThreshold: 80,
            },
          },
        });
      }
    }
  });

  describe('GET /api/settings', () => {
    it('should return 401 without auth token', async () => {
      const appWithoutAuth = express();
      appWithoutAuth.use(express.json());
      appWithoutAuth.use('/api/settings', settingsRouter({ database }));

      const response = await request(appWithoutAuth).get('/api/settings');

      expect(response.status).toBe(401);
    });

    it('should return user settings', async () => {
      const response = await request(app)
        .get('/api/settings')
        .set('Authorization', `Bearer ${testToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('notifications');
      expect(response.body).toHaveProperty('alerts');
      expect(response.body.notifications).toHaveProperty('push');
      expect(response.body.notifications).toHaveProperty('email');
      expect(response.body.notifications).toHaveProperty('sms');
    });

    it('should return defaults for new user', async () => {
      // Clean up any existing user first
      await database.collection('users').deleteMany({ email: 'newuser@example.com' });

      // Create a new user without settings
      const newUserResult = await authService.register(
        'newuser@example.com',
        'password123',
        'New User'
      );
      let newToken = newUserResult.token ?? '';

      // If registration didn't return token, try login
      if (!newToken && newUserResult.success) {
        const loginResult = await authService.login('newuser@example.com', 'password123');
        newToken = loginResult.token ?? '';
      }

      if (!newToken) {
        // If still no token, user might already exist - try login
        const loginResult = await authService.login('newuser@example.com', 'password123');
        if (loginResult.success && loginResult.token) {
          newToken = loginResult.token;
        }
      }

      if (!newToken) {
        throw new Error(
          `Failed to get token for new user: ${newUserResult.error ?? 'Unknown error'}`
        );
      }

      const response = await request(app)
        .get('/api/settings')
        .set('Authorization', `Bearer ${newToken}`);

      expect(response.status).toBe(200);
      expect(response.body.notifications.push).toBe(true);
      expect(response.body.notifications.email).toBe(true);
      expect(response.body.alerts.gradeDrop).toBe(5);
    });
  });

  describe('PUT /api/settings', () => {
    it('should update notification preferences', async () => {
      const updateData = {
        notifications: {
          push: false,
          email: true,
          sms: true,
        },
      };

      const response = await request(app)
        .put('/api/settings')
        .set('Authorization', `Bearer ${testToken}`)
        .send(updateData);

      expect(response.status).toBe(200);
      expect(response.body.notifications.push).toBe(false);
      expect(response.body.notifications.email).toBe(true);
      expect(response.body.notifications.sms).toBe(true);
    });

    it('should update alert thresholds', async () => {
      const updateData = {
        alerts: {
          gradeDrop: 10,
          daysBeforeDeadline: 3,
          lowGradeThreshold: 75,
        },
      };

      const response = await request(app)
        .put('/api/settings')
        .set('Authorization', `Bearer ${testToken}`)
        .send(updateData);

      expect(response.status).toBe(200);
      expect(response.body.alerts.gradeDrop).toBe(10);
      expect(response.body.alerts.daysBeforeDeadline).toBe(3);
      expect(response.body.alerts.lowGradeThreshold).toBe(75);
    });

    it('should update both notifications and alerts', async () => {
      const updateData = {
        notifications: {
          push: false,
          email: false,
          sms: true,
        },
        alerts: {
          gradeDrop: 15,
          daysBeforeDeadline: 5,
          lowGradeThreshold: 70,
        },
      };

      const response = await request(app)
        .put('/api/settings')
        .set('Authorization', `Bearer ${testToken}`)
        .send(updateData);

      expect(response.status).toBe(200);
      expect(response.body.notifications.sms).toBe(true);
      expect(response.body.alerts.gradeDrop).toBe(15);
    });

    it('should validate threshold values', async () => {
      const updateData = {
        alerts: {
          gradeDrop: -5, // Invalid negative value
        },
      };

      const response = await request(app)
        .put('/api/settings')
        .set('Authorization', `Bearer ${testToken}`)
        .send(updateData);

      expect(response.status).toBe(400);
    });
  });

  describe('PUT /api/settings/notifications', () => {
    it('should update only notification preferences', async () => {
      const updateData = {
        push: false,
        email: false,
        sms: true,
      };

      const response = await request(app)
        .put('/api/settings/notifications')
        .set('Authorization', `Bearer ${testToken}`)
        .send(updateData);

      expect(response.status).toBe(200);
      expect(response.body.notifications.push).toBe(false);
      expect(response.body.notifications.email).toBe(false);
      expect(response.body.notifications.sms).toBe(true);
      // Alerts should remain unchanged
      expect(response.body.alerts.gradeDrop).toBe(5);
    });
  });

  describe('PUT /api/settings/alerts', () => {
    it('should update only alert thresholds', async () => {
      const updateData = {
        gradeDrop: 8,
        daysBeforeDeadline: 4,
        lowGradeThreshold: 85,
      };

      const response = await request(app)
        .put('/api/settings/alerts')
        .set('Authorization', `Bearer ${testToken}`)
        .send(updateData);

      expect(response.status).toBe(200);
      expect(response.body.alerts.gradeDrop).toBe(8);
      expect(response.body.alerts.daysBeforeDeadline).toBe(4);
      expect(response.body.alerts.lowGradeThreshold).toBe(85);
      // Notifications should remain unchanged
      expect(response.body.notifications.push).toBe(true);
    });
  });
});
