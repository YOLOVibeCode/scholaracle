/**
 * Slice 9 — student JWT cannot read another student, parent-only collections,
 * or another household’s assets. Studio queries the owner dataUserId() partition.
 *
 * Sibling assignment (same owner) → 404. Forged studentId claim / parent routes → 403.
 */

import request from 'supertest';
import express, { type Express } from 'express';
import { Readable } from 'node:stream';
import jwt from 'jsonwebtoken';
import type { Db } from 'mongodb';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient } from 'mongodb';
import { AuthService } from '@scholaracle/auth';
import { parseTodayView } from '@scholaracle/contracts';
import { StudentRepository } from '@scholaracle/database';
import { seedRouter } from '../seed/seed';
import { studentsRouter } from '../students/students';
import { createAssetServeRouter } from '../assets/assets';
import { authMiddleware } from '../../middleware/auth';
import { requireParent, requireStudent } from '../../middleware/requireRole';
import { createErrorHandler } from '../../middleware/errorHandler';
import { DEMO_USER, DEMO_STUDENT_USER_EMMA } from '../seed/demo-data';
import { signAssetUrl } from '../../services/assets/signedUrl';
import { studioRouter } from './studio';
import type { IAssetStore } from '../../services/assets/IAssetStore';

const JWT_SECRET = 'studio-idor-secret';
const CELL_DIVISION_ID = 'demo-emma-ap-bio-a5';
const LIAM_ASSIGNMENT_ID = 'demo-liam-math7-a0';
const EMMA_ASSET_ID = 'emma-idor-asset';
const OTHER_ASSIGNMENT_ID = 'other-household-homework';
const OTHER_ASSET_ID = 'other-household-asset';
const DECOY_ASSIGNMENT_ID = 'decoy-student-user-partition';

function memoryAssetStore(): IAssetStore {
  return {
    put: async () => {},
    get: async () => ({
      stream: Readable.from(['x']),
      metadata: { contentType: 'application/pdf', contentLength: 1 },
    }),
    delete: async () => {},
    exists: async () => true,
    getSignedUrl: async () => '',
  };
}

describe('student JWT — IDOR / COPPA leftovers', () => {
  jest.setTimeout(60_000);
  let app: Express;
  let database: Db;
  let mongoServer: MongoMemoryServer;
  let client: MongoClient;
  let emmaToken: string;
  let emmaUserId: string;
  let emmaMongoId: string;
  let liamMongoId: string;
  let parentToken: string;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    client = new MongoClient(mongoServer.getUri());
    await client.connect();
    database = client.db('studio-slice9-idor');
    const authService = new AuthService(database, JWT_SECRET);

    app = express();
    app.use(express.json());
    app.use('/api/seed', seedRouter({ database, jwtSecret: JWT_SECRET }));
    app.use(
      '/api/students',
      authMiddleware(authService),
      requireParent,
      studentsRouter({
        database,
        baseUrl: 'http://test.example',
        jwtSecret: JWT_SECRET,
      })
    );
    app.use(
      '/api/studio',
      authMiddleware(authService),
      requireStudent,
      studioRouter({
        database,
        baseUrl: 'http://test.example',
        jwtSecret: JWT_SECRET,
      })
    );
    app.use(
      '/api/assets',
      createAssetServeRouter({
        database,
        jwtSecret: JWT_SECRET,
        assetStore: memoryAssetStore(),
        baseUrl: 'http://test.example',
        authService,
      })
    );
    app.use(createErrorHandler());

    const seeded = await request(app).post('/api/seed/demo');
    expect(seeded.status).toBe(200);

    const emma = await authService.login(
      DEMO_STUDENT_USER_EMMA.email,
      DEMO_STUDENT_USER_EMMA.password
    );
    if (!emma.success || emma.token === undefined || emma.user === undefined) {
      throw new Error('Emma student login failed');
    }
    emmaToken = emma.token;
    emmaUserId = emma.user.id;
    emmaMongoId = emma.user.studentId ?? '';
    if (emmaMongoId === '') {
      throw new Error('Emma JWT is missing studentId');
    }

    const parent = await authService.login(DEMO_USER.email, DEMO_USER.password);
    if (!parent.success || parent.token === undefined || parent.user === undefined) {
      throw new Error('Parent login failed');
    }
    parentToken = parent.token;
    const parentUserId = parent.user.id;

    const list = await request(app)
      .get('/api/students')
      .set('Authorization', `Bearer ${parentToken}`);
    expect(list.status).toBe(200);
    const liamRow = (list.body as { id: string; studentId?: string }[]).find(
      (s) => s.studentId === 'demo-liam'
    );
    if (liamRow === undefined) {
      throw new Error('Liam profile missing');
    }
    liamMongoId = liamRow.id;

    const otherParent = await authService.register(
      'other.idor@example.com',
      'Password123!',
      'Other Parent'
    );
    if (!otherParent.success || otherParent.user === undefined) {
      throw new Error('Other parent register failed');
    }
    const otherOwnerId = otherParent.user.id;
    const otherStudent = await new StudentRepository(database).create({
      userId: otherOwnerId,
      name: 'Other Kid',
      studentId: 'other-kid',
    });
    const due = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    await database.collection('slc_assignments').insertOne({
      userId: otherOwnerId,
      provider: 'demo',
      adapterId: 'com.scholaracle.demo',
      externalId: OTHER_ASSIGNMENT_ID,
      studentExternalId: 'other-kid',
      studentId: otherStudent._id?.toString(),
      courseExternalId: 'other-course',
      deletedAt: null,
      observedAt: new Date(),
      updatedAt: new Date(),
      record: { title: 'Other household homework', dueAt: due, status: 'missing' },
    });
    await database.collection('slc_assets').insertOne({
      assetId: EMMA_ASSET_ID,
      sourceId: 'src-idor',
      userId: parentUserId,
      originalUrl: 'https://example.com/emma.pdf',
      storageKey: 'src-idor/emma',
      fileName: 'emma.pdf',
      mimeType: 'application/pdf',
      fileSize: 1,
      contentHash: 'emma-idor-hash',
      uploadedAt: new Date(),
      lastAccessedAt: new Date(),
      entityType: 'courseMaterial',
      entityExternalId: 'emma-file',
    });
    await database.collection('slc_assets').insertOne({
      assetId: OTHER_ASSET_ID,
      sourceId: 'src-other',
      userId: otherOwnerId,
      originalUrl: 'https://example.com/other.pdf',
      storageKey: 'src-other/other',
      fileName: 'other.pdf',
      mimeType: 'application/pdf',
      fileSize: 1,
      contentHash: 'other-hash',
      uploadedAt: new Date(),
      lastAccessedAt: new Date(),
      entityType: 'courseMaterial',
      entityExternalId: 'other-file',
    });

    await database.collection('slc_assignments').insertOne({
      userId: emmaUserId,
      provider: 'demo',
      adapterId: 'com.scholaracle.demo',
      externalId: DECOY_ASSIGNMENT_ID,
      studentExternalId: 'demo-emma',
      studentId: emmaMongoId,
      courseExternalId: 'demo-emma-ap-bio',
      deletedAt: null,
      observedAt: new Date(),
      updatedAt: new Date(),
      record: { title: 'Decoy should not appear', dueAt: due, status: 'missing' },
    });
  });

  afterAll(async () => {
    await client.close();
    await mongoServer.stop();
  });

  it('Emma Today uses the owner partition and never includes a decoy keyed by her login userId', async () => {
    const res = await request(app)
      .get('/api/studio/today')
      .set('Authorization', `Bearer ${emmaToken}`);
    expect(res.status).toBe(200);
    const view = parseTodayView(res.body);
    const ids = [
      view.next?.assignmentExternalId,
      ...view.alsoToday.map((step) => step.assignmentExternalId),
    ];
    expect(ids).toContain(CELL_DIVISION_ID);
    expect(ids).not.toContain(DECOY_ASSIGNMENT_ID);
    expect(ids).not.toContain(OTHER_ASSIGNMENT_ID);
  });

  it('Emma cannot read Liam’s assignment (same owner, different student) — 404', async () => {
    const res = await request(app)
      .get(`/api/studio/assignments/${LIAM_ASSIGNMENT_ID}`)
      .set('Authorization', `Bearer ${emmaToken}`);
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('NOT_FOUND');
  });

  it('Emma cannot read another household’s assignment by guessing the id', async () => {
    const res = await request(app)
      .get(`/api/studio/assignments/${OTHER_ASSIGNMENT_ID}`)
      .set('Authorization', `Bearer ${emmaToken}`);
    expect(res.status).toBe(404);
  });

  it('a forged studentId claim for Liam is 403 even with Emma’s userId', async () => {
    const forged = jwt.sign(
      {
        userId: emmaUserId,
        email: DEMO_STUDENT_USER_EMMA.email,
        role: 'student',
        studentId: liamMongoId,
      },
      JWT_SECRET,
      { expiresIn: '15m' }
    );
    const res = await request(app)
      .get('/api/studio/today')
      .set('Authorization', `Bearer ${forged}`);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('FORBIDDEN');
  });

  it('Emma cannot read parent-only student collections by guessing ids', async () => {
    const paths = [
      '/api/students',
      `/api/students/${emmaMongoId}`,
      `/api/students/${emmaMongoId}/grades`,
      `/api/students/${emmaMongoId}/action-board`,
      `/api/students/${emmaMongoId}/materials`,
      `/api/students/${emmaMongoId}/login`,
      `/api/students/${liamMongoId}`,
      `/api/students/${liamMongoId}/grades`,
    ];
    for (const path of paths) {
      const res = await request(app).get(path).set('Authorization', `Bearer ${emmaToken}`);
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('FORBIDDEN');
    }

    const nudge = await request(app)
      .post(`/api/students/${emmaMongoId}/assignments/${CELL_DIVISION_ID}/nudge`)
      .set('Authorization', `Bearer ${emmaToken}`);
    expect(nudge.status).toBe(403);
  });

  it('Emma JWT can download her household asset and not another household’s', async () => {
    const own = await request(app)
      .get(`/api/assets/${EMMA_ASSET_ID}`)
      .set('Authorization', `Bearer ${emmaToken}`);
    expect(own.status).toBe(200);

    const other = await request(app)
      .get(`/api/assets/${OTHER_ASSET_ID}`)
      .set('Authorization', `Bearer ${emmaToken}`);
    expect(other.status).toBe(404);
  });

  it('rejects an expired signed asset URL', async () => {
    const expired = signAssetUrl('http://test.example', EMMA_ASSET_ID, JWT_SECRET, -30);
    const path = expired.replace('http://test.example', '');
    const res = await request(app).get(path);
    expect(res.status).toBe(403);
    expect(String(res.body.error)).toMatch(/expired|invalid/i);
  });
});
