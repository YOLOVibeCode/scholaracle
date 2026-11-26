/**
 * Signing a session out from another device signs that device out.
 *
 * DELETE /api/sessions/:id and DELETE /api/sessions marked the session row as revoked and did
 * nothing else, and nothing reads that mark. The signed-out device went on refreshing its
 * tokens, for up to thirty days, and its next refresh put it back in the list as a new
 * session. Now the device's refresh tokens stop working, so it is out as soon as the access
 * token it holds runs out (fifteen minutes at most).
 *
 * The app is the real one (`createApp`), reached over HTTP.
 */

import { once } from 'node:events';
import type { Server } from 'node:http';
import request from 'supertest';
import { MongoClient, type Db } from 'mongodb';

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

const EMAIL = 'session-sign-out@test.com';
const PASSWORD = 'SessionSignOut!Passw0rd';

interface IDevice {
  readonly accessToken: string;
  readonly refreshToken: string;
}

describe('Signing a session out from another device', () => {
  let mongoClient: MongoClient;
  let database: Db;
  let server: Server;
  let thisDevice: IDevice;
  let otherDevice: IDevice;

  const removeTestUser = async (): Promise<void> => {
    const user = await database.collection('users').findOne({ email: EMAIL });
    if (!user) return;
    await database.collection('sessions').deleteMany({ userId: user._id });
    await database.collection('refresh_tokens').deleteMany({ userId: user._id });
    await database.collection('users').deleteOne({ _id: user._id });
  };

  const asDevice = (res: request.Response): IDevice => {
    expect({ status: res.status, error: res.body.error }).toEqual({ status: res.status });
    return {
      accessToken: res.body.token as string,
      refreshToken: res.body.refreshToken as string,
    };
  };

  /** What the device does when its access token runs out: ask for a new one. */
  const refresh = (device: IDevice): Promise<request.Response> =>
    request(server).post('/api/auth/refresh').send({ refreshToken: device.refreshToken });

  /** The id of the session `device` is signed in with, as the sessions list reports it. */
  const sessionIdOf = async (device: IDevice): Promise<string> => {
    const res = await request(server)
      .get('/api/sessions')
      .set('Authorization', `Bearer ${device.accessToken}`);
    const current = (res.body.sessions as Array<{ id: string; isCurrent: boolean }>).find(
      (s) => s.isCurrent
    );
    expect(current).toBeDefined();
    return current!.id;
  };

  const sessionCount = async (device: IDevice): Promise<number> => {
    const res = await request(server)
      .get('/api/sessions')
      .set('Authorization', `Bearer ${device.accessToken}`);
    return (res.body.sessions as unknown[]).length;
  };

  beforeAll(async () => {
    const uri = process.env['MONGODB_URI'] ?? 'mongodb://localhost:27017';
    const dbName = process.env['MONGODB_DB_NAME'] ?? 'scholaracle_test';
    mongoClient = new MongoClient(uri);
    await mongoClient.connect();
    database = mongoClient.db(dbName);

    // On 127.0.0.1, so no other program on the machine can answer for this server
    // (see routes/admin/adminServerWiring.test.ts).
    server = createApp(
      {
        jwtSecret: 'session-sign-out-secret-do-not-use-in-prod',
        sendGridApiKey: 'SG.test-key',
        sendGridFromEmail: 'test@example.com',
        sendGridFromName: 'Test',
      },
      database
    ).listen(0, '127.0.0.1');
    await once(server, 'listening');
  });

  beforeEach(async () => {
    await removeTestUser();

    const registered = await request(server)
      .post('/api/auth/register')
      .send({ email: EMAIL, password: PASSWORD, name: 'Session Sign Out' });
    expect(registered.status).toBe(201);
    thisDevice = asDevice(registered);

    const signedIn = await request(server)
      .post('/api/auth/login')
      .send({ email: EMAIL, password: PASSWORD });
    expect(signedIn.status).toBe(200);
    otherDevice = asDevice(signedIn);

    expect(await sessionCount(thisDevice)).toBe(2);
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
      server.closeAllConnections();
    });
    await removeTestUser();
    await mongoClient.close();
  });

  it('one session: that device can no longer get a new access token', async () => {
    const otherSessionId = await sessionIdOf(otherDevice);

    const signOut = await request(server)
      .delete(`/api/sessions/${otherSessionId}`)
      .set('Authorization', `Bearer ${thisDevice.accessToken}`);
    expect(signOut.status).toBe(200);

    expect((await refresh(otherDevice)).status).toBe(401);
    // It has not come back as a new session either.
    expect(await sessionCount(thisDevice)).toBe(1);
  });

  it('one session: the device that asked stays signed in', async () => {
    const otherSessionId = await sessionIdOf(otherDevice);

    await request(server)
      .delete(`/api/sessions/${otherSessionId}`)
      .set('Authorization', `Bearer ${thisDevice.accessToken}`);

    const refreshed = await refresh(thisDevice);
    expect(refreshed.status).toBe(200);
    expect(typeof refreshed.body.token).toBe('string');
  });

  it('all other sessions: every other device can no longer get a new access token', async () => {
    const signOut = await request(server)
      .delete('/api/sessions')
      .set('Authorization', `Bearer ${thisDevice.accessToken}`);
    expect({ status: signOut.status, revoked: signOut.body.revoked }).toEqual({
      status: 200,
      revoked: 1,
    });

    expect((await refresh(otherDevice)).status).toBe(401);
    expect(await sessionCount(thisDevice)).toBe(1);

    const refreshed = await refresh(thisDevice);
    expect(refreshed.status).toBe(200);
  });

  it("another account's session cannot be signed out", async () => {
    const otherSessionId = await sessionIdOf(otherDevice);
    const strangerEmail = 'session-sign-out-stranger@test.com';
    await database.collection('users').deleteMany({ email: strangerEmail });
    const stranger = asDevice(
      await request(server)
        .post('/api/auth/register')
        .send({ email: strangerEmail, password: PASSWORD, name: 'Stranger' })
    );

    const attempt = await request(server)
      .delete(`/api/sessions/${otherSessionId}`)
      .set('Authorization', `Bearer ${stranger.accessToken}`);
    expect(attempt.status).toBe(404);

    expect((await refresh(otherDevice)).status).toBe(200);

    const strangerUser = await database.collection('users').findOne({ email: strangerEmail });
    if (strangerUser) {
      await database.collection('sessions').deleteMany({ userId: strangerUser._id });
      await database.collection('refresh_tokens').deleteMany({ userId: strangerUser._id });
      await database.collection('users').deleteOne({ _id: strangerUser._id });
    }
  });
});
