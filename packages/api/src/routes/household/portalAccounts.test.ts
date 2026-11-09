import request from 'supertest';
import express, { type Express } from 'express';
import { MongoClient, ObjectId, type Db } from 'mongodb';
import { AuthService } from '@scholaracle/auth';
import { portalAccountsRouter } from './portalAccounts';
import { createErrorHandler } from '../../middleware/errorHandler';
import { authMiddleware } from '../../middleware/auth';

describe('portal accounts and bindings', () => {
  let app: Express;
  let database: Db;
  let mongoClient: MongoClient;
  let authService: AuthService;
  let token: string;
  let studentId: string;
  let ownerUserId: string;

  beforeAll(async () => {
    mongoClient = new MongoClient(process.env['MONGODB_URI'] ?? 'mongodb://localhost:27017');
    await mongoClient.connect();
    database = mongoClient.db('scholaracle_test_portal_api');
    authService = new AuthService(database, 'test-secret');

    app = express();
    app.use(express.json());
    app.use(
      '/api/portal-accounts',
      authMiddleware(authService),
      portalAccountsRouter({ database })
    );
    app.use(createErrorHandler());

    const reg = await authService.register('parent-pa@test.com', 'password123', 'Parent');
    if (!reg.success || !reg.token || !reg.user?.id) throw new Error('register failed');
    token = reg.token;
    ownerUserId = reg.user.id;
    const childId = new ObjectId();
    studentId = childId.toHexString();
    await database.collection('students').insertOne({
      _id: childId,
      userId: new ObjectId(reg.user!.id),
      name: 'Emma',
      dataSources: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  });

  afterAll(async () => {
    await database.dropDatabase();
    await mongoClient.close();
  });

  beforeEach(async () => {
    await database.collection('slc_portal_accounts').deleteMany({});
    await database.collection('slc_bindings').deleteMany({});
  });

  it('upserts portal account and binding for a student', async () => {
    const pa = await request(app)
      .put('/api/portal-accounts')
      .set('Authorization', `Bearer ${token}`)
      .send({
        provider: 'canvas',
        adapterId: 'canvas',
        portalBaseUrl: 'https://school.instructure.com',
        institutionExternalId: 'school.instructure.com',
        displayName: 'Canvas',
      })
      .expect(200);

    const portalAccountId = pa.body.portalAccount.portalAccountId as string;

    const binding = await request(app)
      .put(`/api/portal-accounts/${portalAccountId}/bindings`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        studentId,
        sourceId: 'src-emma',
        studentExternalId: 'stu-emma',
      })
      .expect(200);

    expect(binding.body.binding.sourceId).toBe('src-emma');
    expect(binding.body.binding.studentExternalId).toBe('stu-emma');
  });

  it('upserts two bindings sharing one portal account', async () => {
    const pa = await request(app)
      .put('/api/portal-accounts')
      .set('Authorization', `Bearer ${token}`)
      .send({
        provider: 'canvas',
        adapterId: 'canvas',
        portalBaseUrl: 'https://school.instructure.com',
        institutionExternalId: 'school.instructure.com',
        displayName: 'Canvas',
      })
      .expect(200);
    const portalAccountId = pa.body.portalAccount.portalAccountId as string;

    const childB = new ObjectId();
    await database.collection('students').insertOne({
      _id: childB,
      userId: new ObjectId(ownerUserId),
      name: 'Liam',
      dataSources: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await request(app)
      .put(`/api/portal-accounts/${portalAccountId}/bindings`)
      .set('Authorization', `Bearer ${token}`)
      .send({ studentId, sourceId: 'src-emma', studentExternalId: 'stu-emma' })
      .expect(200);

    const second = await request(app)
      .put(`/api/portal-accounts/${portalAccountId}/bindings`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        studentId: childB.toHexString(),
        sourceId: 'src-liam',
        studentExternalId: 'stu-liam',
      })
      .expect(200);

    expect(second.body.binding.portalAccountId).toBe(portalAccountId);
    const bindings = await database.collection('slc_bindings').find({ portalAccountId }).toArray();
    expect(bindings).toHaveLength(2);
    expect(bindings.map((b) => b['studentExternalId']).sort()).toEqual(['stu-emma', 'stu-liam']);
  });
});
