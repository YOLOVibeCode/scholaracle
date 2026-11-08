/**
 * A source can be bound to a student (portal accounts, #93) before the first ingest
 * adds it to student.dataSources. The runs routes must accept it, or the app's
 * dashboard fails with "Source not found" for a source the list just returned.
 */
import express, { type Express } from 'express';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient, type Db } from 'mongodb';
import { AuthService } from '@scholaracle/auth';
import { studentsRouter } from './students';
import { authMiddleware } from '../../middleware/auth';
import { requireParent } from '../../middleware/requireRole';
import { createErrorHandler } from '../../middleware/errorHandler';
import { seedIngestBinding } from '../../test-utils/seedIngestBinding';

describe('student runs routes accept bound sources', () => {
  let server: MongoMemoryServer;
  let client: MongoClient;
  let database: Db;
  let app: Express;
  let token: string;
  let userId: string;
  let studentId: string;

  beforeAll(async () => {
    server = await MongoMemoryServer.create();
    client = new MongoClient(server.getUri());
    await client.connect();
    database = client.db('bound_source_runs');
    const authService = new AuthService(database);
    app = express();
    app.use(express.json());
    app.use(
      '/api/students',
      authMiddleware(authService),
      requireParent,
      studentsRouter({ database, baseUrl: 'http://test.example' })
    );
    app.use(createErrorHandler());

    const reg = await authService.register(
      'bound-parent@example.com',
      'password123',
      'Bound Parent'
    );
    if (!reg.success || !reg.user?.id || !reg.token) throw new Error('register failed');
    userId = reg.user.id;
    token = reg.token;
    const created = await request(app)
      .post('/api/students')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Test Student A', grade: 9 });
    studentId = (created.body as { id: string }).id;
    await seedIngestBinding(database, userId, {
      sourceId: 'src-bound',
      studentExternalId: 'ext-1',
      studentId,
    });
  }, 60_000);

  afterAll(async () => {
    await client.close();
    await server.stop();
  });

  it('lists runs for a source that is bound but not yet in dataSources', async () => {
    const res = await request(app)
      .get(`/api/students/${studentId}/sources/src-bound/runs`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });

  it('still returns 404 for a source that is neither listed nor bound', async () => {
    const res = await request(app)
      .get(`/api/students/${studentId}/sources/src-unknown/runs`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });
});
