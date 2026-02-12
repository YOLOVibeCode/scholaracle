import request from 'supertest';
import express, { type Express } from 'express';
import { MongoClient, type Db } from 'mongodb';
import { authRouter } from './auth';

describe('Auth API Routes', () => {
  let app: Express;
  let database: Db;
  let mongoClient: MongoClient;

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

    // Setup Express app with routes
    app = express();
    app.use(express.json());
    app.use('/api/auth', authRouter({ database }));
  });

  afterAll(async () => {
    if (mongoClient) {
      await mongoClient.close();
    }
  });

  beforeEach(async () => {
    // Clean up test users before each test
    if (database) {
      await database.collection('users').deleteMany({
        email: { $in: ['authtest@example.com', 'authdup@example.com', 'nonexistent@example.com'] },
      });
    }
  });

  describe('POST /api/auth/register', () => {
    it('should register a new user', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({ email: 'authtest@example.com', password: 'password123', name: 'Auth Test User' });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body).toHaveProperty('token');
      expect(response.body).toHaveProperty('user');
      expect(response.body.user).toHaveProperty('id');
      expect(response.body.user.email).toBe('authtest@example.com');
    });

    it('should reject registration with missing fields', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({ email: 'authtest@example.com', password: 'password123' });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Missing required fields');
    });

    it('should reject duplicate email registration', async () => {
      // Register first time
      await request(app)
        .post('/api/auth/register')
        .send({ email: 'authdup@example.com', password: 'password123', name: 'First User' });

      // Register second time with same email
      const response = await request(app)
        .post('/api/auth/register')
        .send({ email: 'authdup@example.com', password: 'password456', name: 'Second User' });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });
  });

  describe('POST /api/auth/login', () => {
    it('should login with valid credentials', async () => {
      // Register a user first
      await request(app)
        .post('/api/auth/register')
        .send({ email: 'authtest@example.com', password: 'password123', name: 'Auth Test User' });

      // Login with that user
      const response = await request(app)
        .post('/api/auth/login')
        .send({ email: 'authtest@example.com', password: 'password123' });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body).toHaveProperty('token');
      expect(response.body).toHaveProperty('user');
    });

    it('should reject login with wrong password', async () => {
      // Register a user first
      await request(app)
        .post('/api/auth/register')
        .send({ email: 'authtest@example.com', password: 'password123', name: 'Auth Test User' });

      // Login with wrong password
      const response = await request(app)
        .post('/api/auth/login')
        .send({ email: 'authtest@example.com', password: 'wrongpassword' });

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });

    it('should reject login with non-existent email', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({ email: 'nonexistent@example.com', password: 'password123' });

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });

    it('should reject login with missing fields', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({ email: 'authtest@example.com' });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Missing required fields');
    });
  });
});
