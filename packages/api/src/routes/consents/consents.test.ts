import request from 'supertest';
import express, { type Express } from 'express';
import { MongoClient, type Db } from 'mongodb';
import { AuthService } from '@scholaracle/auth';
import { SERVER_AI_CONSENT_PURPOSE } from '@scholaracle/contracts';
import { consentsRouter } from './consents';
import { authMiddleware } from '../../middleware/auth';
import { createErrorHandler } from '../../middleware/errorHandler';

describe('Consents API Routes', () => {
  let app: Express;
  let database: Db;
  let mongoClient: MongoClient;
  let authService: AuthService;
  let testToken: string;
  let testUserId: string;

  beforeAll(async () => {
    const mongodbUri = process.env['MONGODB_URI'] ?? 'mongodb://localhost:27017';
    const dbName = process.env['MONGODB_DB_NAME'] ?? 'scholaracle_test';

    mongoClient = new MongoClient(mongodbUri);
    await mongoClient.connect();
    database = mongoClient.db(dbName);

    await database.collection('users').deleteMany({ email: 'consents@example.com' });
    await database.collection('consents').deleteMany({});

    authService = new AuthService(database);
    const reg = await authService.register('consents@example.com', 'password123', 'Consents User');
    if (!reg.success || !reg.user || !reg.token) {
      throw new Error('Failed to register test user');
    }
    testUserId = reg.user.id;
    testToken = reg.token;

    app = express();
    app.use(express.json());
    app.use('/api/consents', authMiddleware(authService), consentsRouter({ database }));
    app.use(createErrorHandler());
  });

  afterAll(async () => {
    await mongoClient.close();
  });

  beforeEach(async () => {
    await database.collection('consents').deleteMany({ userId: testUserId });
  });

  it('GET returns serverAi false by default', async () => {
    const response = await request(app)
      .get('/api/consents')
      .set('Authorization', `Bearer ${testToken}`);
    expect(response.status).toBe(200);
    expect(response.body.serverAi).toBe(false);
  });

  it('PUT enables and GET reflects serverAi true', async () => {
    const put = await request(app)
      .put('/api/consents/server-ai')
      .set('Authorization', `Bearer ${testToken}`)
      .send({ enabled: true });
    expect(put.status).toBe(200);
    expect(put.body.serverAi).toBe(true);

    const row = await database.collection('consents').findOne({
      userId: testUserId,
      purpose: SERVER_AI_CONSENT_PURPOSE,
    });
    expect(row?.['consentedAt']).toBeDefined();
    expect(row?.['revokedAt']).toBeUndefined();
  });

  it('PUT disable revokes consent', async () => {
    await request(app)
      .put('/api/consents/server-ai')
      .set('Authorization', `Bearer ${testToken}`)
      .send({ enabled: true });

    const put = await request(app)
      .put('/api/consents/server-ai')
      .set('Authorization', `Bearer ${testToken}`)
      .send({ enabled: false });
    expect(put.status).toBe(200);
    expect(put.body.serverAi).toBe(false);
  });
});
