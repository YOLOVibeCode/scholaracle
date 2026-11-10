import request from 'supertest';
import { MongoClient } from 'mongodb';
import { createTestApp, closeTestApp } from './createTestApp';

describe('createTestApp', () => {
  it('returns an app with json, configure hook, and error handler', async () => {
    const harness = await createTestApp({
      configure: ({ app, database }) => {
        app.get('/ping', (_req, res) => {
          res.json({ ok: true, hasDb: Boolean(database) });
        });
      },
    });
    expect(harness).not.toBeNull();
    if (!harness) {
      return;
    }

    const ping = await request(harness.app).get('/ping');
    expect(ping.status).toBe(200);
    expect(ping.body).toEqual({ ok: true, hasDb: true });

    const missing = await request(harness.app).get('/missing-route');
    expect(missing.status).toBe(404);

    await closeTestApp(harness);
  });

  it('returns null when connect fails and skipOnConnectFailure is true', async () => {
    const connectSpy = jest
      .spyOn(MongoClient.prototype, 'connect')
      .mockRejectedValueOnce(new Error('connection refused'));

    const harness = await createTestApp({
      skipOnConnectFailure: true,
      configure: () => {},
    });

    expect(harness).toBeNull();
    connectSpy.mockRestore();
  });
});
