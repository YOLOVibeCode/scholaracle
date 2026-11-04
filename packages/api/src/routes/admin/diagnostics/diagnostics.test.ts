import request from 'supertest';
import express, { type Express } from 'express';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient, type Db } from 'mongodb';
import jwt from 'jsonwebtoken';
import { ConnectorTokenService } from '@scholaracle/auth';
import { createDiagnosticsRouter } from './diagnostics';

const JWT_SECRET = 'diagnostics-test-secret';

describe('Admin diagnostics routes', () => {
  let mongod: MongoMemoryServer;
  let client: MongoClient;
  let database: Db;
  let app: Express;

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    client = new MongoClient(mongod.getUri());
    await client.connect();
    database = client.db('diagnostics');
    app = express();
    app.use(express.json());
    app.use('/api/admin/diagnostics', createDiagnosticsRouter({ database, jwtSecret: JWT_SECRET }));
  });

  afterAll(async () => {
    await client.close();
    await mongod.stop();
  });

  it('rejects requests without a token', async () => {
    const res = await request(app).get('/api/admin/diagnostics/student-data/abc123');
    expect(res.status).toBe(401);
  });

  it('rejects a parent session token', async () => {
    const parentToken = jwt.sign(
      { userId: 'user-1', email: 'p@example.com', role: 'parent' },
      JWT_SECRET
    );
    const res = await request(app)
      .post('/api/admin/diagnostics/flush-digests')
      .set('Authorization', `Bearer ${parentToken}`)
      .send({ userId: 'user-1' });
    expect(res.status).toBe(401);
  });

  it('rejects a connector token', async () => {
    const connectorToken = new ConnectorTokenService(JWT_SECRET).createToken('user-1', 'jti-1');
    const res = await request(app)
      .get('/api/admin/diagnostics/student-data/abc123')
      .set('Authorization', `Bearer ${connectorToken}`);
    expect(res.status).toBe(401);
  });
});
