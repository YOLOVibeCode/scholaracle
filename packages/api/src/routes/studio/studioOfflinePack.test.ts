/**
 * GET /api/studio/courses/:courseExternalId/offline-pack
 *
 * Returns all current-term packs + asset refs for a course, keyed by student JWT.
 * IDOR: Emma cannot fetch Liam's course. Wrong student → 404. No student JWT → 403.
 */

import request from 'supertest';
import express, { type Express } from 'express';
import type { Db } from 'mongodb';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient } from 'mongodb';
import { AuthService } from '@scholaracle/auth';
import { seedRouter } from '../seed/seed';
import { authMiddleware } from '../../middleware/auth';
import { requireStudent } from '../../middleware/requireRole';
import { createErrorHandler } from '../../middleware/errorHandler';
import { DEMO_USER, DEMO_STUDENT_USER_EMMA, DEMO_STUDENT_USER_LIAM } from '../seed/demo-data';
import { studioRouter } from './studio';

const JWT_SECRET = 'offline-pack-test-secret';

describe('GET /api/studio/courses/:courseExternalId/offline-pack', () => {
  jest.setTimeout(60_000);

  let app: Express;
  let database: Db;
  let mongoServer: MongoMemoryServer;
  let client: MongoClient;
  let authService: AuthService;
  let emmaToken: string;
  let liamToken: string;
  let parentToken: string;
  let emmaCourseExternalId: string;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    client = new MongoClient(mongoServer.getUri());
    await client.connect();
    database = client.db('studio-offline-pack-test');
    authService = new AuthService(database, JWT_SECRET);

    app = express();
    app.use(express.json());
    app.use('/api/seed', seedRouter({ database, jwtSecret: JWT_SECRET }));
    app.use(
      '/api/studio',
      authMiddleware(authService),
      requireStudent,
      studioRouter({ database, baseUrl: 'http://test.example', jwtSecret: JWT_SECRET })
    );
    app.use(createErrorHandler());

    // Seed demo data
    const seeded = await request(app).post('/api/seed/demo');
    expect(seeded.status).toBe(200);

    // Emma login
    const emmaLogin = await authService.login(
      DEMO_STUDENT_USER_EMMA.email,
      DEMO_STUDENT_USER_EMMA.password
    );
    if (!emmaLogin.success || !emmaLogin.token) throw new Error('Emma login failed');
    emmaToken = emmaLogin.token;

    // Liam login
    const liamLogin = await authService.login(
      DEMO_STUDENT_USER_LIAM.email,
      DEMO_STUDENT_USER_LIAM.password
    );
    if (!liamLogin.success || !liamLogin.token) throw new Error('Liam login failed');
    liamToken = liamLogin.token;

    // Parent login
    const parentLogin = await authService.login(DEMO_USER.email, DEMO_USER.password);
    if (!parentLogin.success || !parentLogin.token) throw new Error('Parent login failed');
    parentToken = parentLogin.token;

    // Discover Emma's first course external id
    const courseDoc = await database
      .collection('slc_courses')
      .findOne({ deletedAt: null, externalId: /demo-emma/ });
    emmaCourseExternalId =
      (courseDoc?.['externalId'] as string | undefined) ?? 'demo-canvas-course-alg2';
  });

  afterAll(async () => {
    await client.close();
    await mongoServer.stop();
  });

  describe('happy path', () => {
    it("returns 200 with packs and assets for Emma's course", async () => {
      const res = await request(app)
        .get(`/api/studio/courses/${emmaCourseExternalId}/offline-pack`)
        .set('Authorization', `Bearer ${emmaToken}`);

      expect(res.status).toBe(200);
      const body = res.body as {
        courseExternalId: string;
        courseName: string;
        assembledAt: string;
        packs: unknown[];
        assets: unknown[];
      };
      expect(body.courseExternalId).toBe(emmaCourseExternalId);
      expect(typeof body.courseName).toBe('string');
      expect(typeof body.assembledAt).toBe('string');
      expect(Array.isArray(body.packs)).toBe(true);
      expect(Array.isArray(body.assets)).toBe(true);
    });

    it('assembledAt is an ISO timestamp', async () => {
      const res = await request(app)
        .get(`/api/studio/courses/${emmaCourseExternalId}/offline-pack`)
        .set('Authorization', `Bearer ${emmaToken}`);

      expect(res.status).toBe(200);
      const { assembledAt } = res.body as { assembledAt: string };
      expect(() => new Date(assembledAt)).not.toThrow();
      expect(new Date(assembledAt).getFullYear()).toBeGreaterThan(2020);
    });

    it('assets array items have required fields', async () => {
      const res = await request(app)
        .get(`/api/studio/courses/${emmaCourseExternalId}/offline-pack`)
        .set('Authorization', `Bearer ${emmaToken}`);

      expect(res.status).toBe(200);
      const { assets } = res.body as {
        assets: Array<{
          assetId?: string;
          contentHash?: string;
          fileName?: string;
          downloadUrl?: string;
        }>;
      };
      for (const asset of assets) {
        expect(typeof asset.assetId).toBe('string');
        expect(typeof asset.contentHash).toBe('string');
        expect(typeof asset.fileName).toBe('string');
        expect(typeof asset.downloadUrl).toBe('string');
      }
    });
  });

  describe("IDOR — Liam cannot read Emma's course", () => {
    it("returns 404 when Liam requests Emma's courseExternalId", async () => {
      const res = await request(app)
        .get(`/api/studio/courses/${emmaCourseExternalId}/offline-pack`)
        .set('Authorization', `Bearer ${liamToken}`);

      // Liam's student partition does not include Emma's course
      expect(res.status).toBe(404);
    });
  });

  describe('auth failures', () => {
    it('returns 401 without Authorization header', async () => {
      const res = await request(app).get(
        `/api/studio/courses/${emmaCourseExternalId}/offline-pack`
      );
      expect(res.status).toBe(401);
    });

    it('returns 403 with a parent JWT (not a student JWT)', async () => {
      const res = await request(app)
        .get(`/api/studio/courses/${emmaCourseExternalId}/offline-pack`)
        .set('Authorization', `Bearer ${parentToken}`);
      expect(res.status).toBe(403);
    });

    it('returns 404 for unknown courseExternalId with valid student JWT', async () => {
      const res = await request(app)
        .get('/api/studio/courses/does-not-exist-999/offline-pack')
        .set('Authorization', `Bearer ${emmaToken}`);
      expect(res.status).toBe(404);
    });
  });
});
