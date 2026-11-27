/**
 * The agenda routes must accept the tokens the rest of the API accepts.
 *
 * The server resolves one token secret (its config, then JWT_SECRET, then a development
 * default) and hands it to every router that checks a token. The agenda router built its
 * own AuthService without it, so wherever the server's secret was not the AuthService
 * default the agenda answered 401 to a signed-in parent. On the web that reads as
 * "session expired": the dashboard loads the agenda first and signs the parent out on a 401.
 */

import request from 'supertest';
import { MongoClient, type Db } from 'mongodb';
import { AuthService } from '@scholaracle/auth';

jest.mock('@sendgrid/mail', () => {
  const mockSend = jest
    .fn()
    .mockResolvedValue([{ statusCode: 202, body: { message_id: 'email-123' } }]);
  return {
    __esModule: true,
    default: { setApiKey: jest.fn(), send: mockSend },
  };
});

jest.mock('firebase-admin', () => ({
  __esModule: true,
  messaging: jest.fn(() => ({ send: jest.fn().mockResolvedValue('fcm-message-id') })),
  initializeApp: jest.fn(),
}));

import { createApp } from '../../server';

const EMAIL = 'agenda-token-secret@test.com';
const SERVER_SECRET = 'agenda-token-secret-test-do-not-use-in-prod';
const OTHER_SECRET = 'some-other-secret-do-not-use-in-prod';

describe('Agenda API — token secret', () => {
  let mongoClient: MongoClient;
  let database: Db;
  let app: ReturnType<typeof createApp>;
  let token: string;
  let tokenFromOtherSecret: string;

  const range = (): { from: string; to: string } => {
    const now = Date.now();
    return {
      from: new Date(now).toISOString(),
      to: new Date(now + 7 * 24 * 60 * 60_000).toISOString(),
    };
  };

  beforeAll(async () => {
    const uri = process.env['MONGODB_URI'] ?? 'mongodb://localhost:27017';
    const dbName = process.env['MONGODB_DB_NAME'] ?? 'scholaracle_test';
    mongoClient = new MongoClient(uri);
    await mongoClient.connect();
    database = mongoClient.db(dbName);
    await database.collection('users').deleteMany({ email: EMAIL });

    app = createApp(
      {
        jwtSecret: SERVER_SECRET,
        sendGridApiKey: 'SG.test-key',
        sendGridFromEmail: 'test@example.com',
        sendGridFromName: 'Test',
      },
      database
    );

    const registered = await new AuthService(database, SERVER_SECRET).register(
      EMAIL,
      'password123',
      'Agenda Token Secret'
    );
    if (!registered.success || !registered.token) {
      throw new Error('Failed to create the agenda token-secret test user');
    }
    token = registered.token;

    const signedElsewhere = await new AuthService(database, OTHER_SECRET).login(
      EMAIL,
      'password123'
    );
    if (!signedElsewhere.success || !signedElsewhere.token) {
      throw new Error('Failed to sign the test user in with the other secret');
    }
    tokenFromOtherSecret = signedElsewhere.token;
  });

  afterAll(async () => {
    await database.collection('users').deleteMany({ email: EMAIL });
    await mongoClient.close();
  });

  it('the token is one the rest of the API accepts', async () => {
    const res = await request(app).get('/api/students').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
  });

  it('reads the agenda with that same token', async () => {
    const res = await request(app)
      .get('/api/agenda')
      .query(range())
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data.items)).toBe(true);
  });

  it('snoozes an agenda item with that same token', async () => {
    const res = await request(app)
      .post('/api/agenda/snooze')
      .set('Authorization', `Bearer ${token}`)
      .send({
        itemType: 'assignment',
        itemKey: 'agenda-token-secret-item',
        snoozedUntil: new Date(Date.now() + 60 * 60_000).toISOString(),
      });

    expect(res.status).toBe(200);
  });

  it('still turns away a token signed with another secret', async () => {
    const res = await request(app)
      .get('/api/agenda')
      .query(range())
      .set('Authorization', `Bearer ${tokenFromOtherSecret}`);

    expect(res.status).toBe(401);
  });

  it('still turns away a request with no token', async () => {
    const res = await request(app).get('/api/agenda').query(range());

    expect(res.status).toBe(401);
  });
});
