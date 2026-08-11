/**
 * Admin scrapers API route tests — stats, caches, jobs, reports, test endpoint.
 */
import request from 'supertest';
import express, { type Express } from 'express';
import { MongoClient, ObjectId, type Db } from 'mongodb';
import { scrapersAdminRouter } from './scrapers';
import { createTestAdmin } from '../../../test-utils/admin-test-helper';
import { createErrorHandler } from '../../../middleware/errorHandler';

jest.mock('../../../services/scraper-generator/crawler', () => ({
  connectStep: jest.fn().mockResolvedValue({ ok: true, httpStatus: 200 }),
  crawlStep: jest.fn().mockResolvedValue({
    ok: true,
    title: 'Login',
    loginForm: {},
    navigation: [],
    detectedFramework: 'unknown',
  }),
  authenticateCheckStep: jest.fn().mockResolvedValue({
    ok: true,
    loginFormUsable: true,
    captchaDetected: false,
    mfaRequired: false,
  }),
}));

describe('Admin Scrapers Routes', () => {
  let app: Express;
  let client: MongoClient;
  let database: Db;
  let adminToken: string;

  beforeAll(async () => {
    const uri = process.env['MONGODB_URI'] ?? 'mongodb://localhost:27017';
    client = new MongoClient(uri);
    await client.connect();
    database = client.db('scholaracle_test');

    const result = await createTestAdmin(database, 'test-secret', {
      email: 'scraper-admin@test.com',
      password: 'AdminPass123!',
      name: 'Scraper Admin',
      role: 'admin',
    });
    adminToken = result.token;

    app = express();
    app.use(express.json());
    app.use('/api/admin/scrapers', scrapersAdminRouter({ database, jwtSecret: 'test-secret' }));
    app.use(createErrorHandler());
  });

  afterAll(async () => {
    await client.close();
  });

  beforeEach(async () => {
    await database.collection('generated_scrapers').deleteMany({});
    await database.collection('scraper_generation_jobs').deleteMany({});
    await database.collection('scraper_reports').deleteMany({});
  });

  describe('GET /api/admin/scrapers/stats', () => {
    it('should return 401 without admin token', async () => {
      const res = await request(app).get('/api/admin/scrapers/stats');
      expect(res.status).toBe(401);
    });

    it('should return 200 with aggregate stats', async () => {
      const res = await request(app)
        .get('/api/admin/scrapers/stats')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toMatchObject({
        totalCaches: 0,
        activeJobs: 0,
        failures24h: 0,
        failures7d: 0,
        failures30d: 0,
        uniquePlatforms: 0,
      });
      expect(res.body.data.jobsByStatus).toBeDefined();
    });

    it('should include job status counts when jobs exist', async () => {
      await database.collection('scraper_generation_jobs').insertMany([
        { jobId: 'j1', status: 'completed', userId: 'u1', createdAt: new Date() },
        { jobId: 'j2', status: 'queued', userId: 'u1', createdAt: new Date() },
      ]);
      const res = await request(app)
        .get('/api/admin/scrapers/stats')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.data.totalCaches).toBe(0);
      expect(res.body.data.jobsByStatus.completed).toBe(1);
      expect(res.body.data.jobsByStatus.queued).toBe(1);
    });
  });

  describe('GET /api/admin/scrapers/caches', () => {
    it('should return 401 without admin token', async () => {
      const res = await request(app).get('/api/admin/scrapers/caches');
      expect(res.status).toBe(401);
    });

    it('should return 200 with paginated list', async () => {
      const res = await request(app)
        .get('/api/admin/scrapers/caches')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toEqual([]);
      expect(res.body.total).toBe(0);
      expect(res.body.page).toBe(1);
      expect(res.body.limit).toBeDefined();
      expect(res.body.totalPages).toBe(0);
    });

    it('should return cache entries with metadata', async () => {
      const id = new ObjectId();
      await database.collection('generated_scrapers').insertOne({
        _id: id,
        cacheKey: 'key1',
        platformName: 'Canvas',
        loginUrl: 'https://canvas.example.com',
        scraperCode: '// code',
        transformerCode: '// transform',
        createdAt: new Date(),
      });
      const res = await request(app)
        .get('/api/admin/scrapers/caches')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].id).toBe(id.toString());
      expect(res.body.data[0].platformName).toBe('Canvas');
      expect(res.body.data[0].loginUrl).toBe('https://canvas.example.com');
      expect(res.body.data[0].scraperCodeLength).toBe(7);
    });
  });

  describe('GET /api/admin/scrapers/caches/:id', () => {
    it('should return 401 without admin token', async () => {
      const res = await request(app).get('/api/admin/scrapers/caches/507f1f77bcf86cd799439011');
      expect(res.status).toBe(401);
    });

    it('should return 404 when cache not found', async () => {
      const id = new ObjectId();
      const res = await request(app)
        .get(`/api/admin/scrapers/caches/${id}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(404);
      expect(res.body.error).toContain('not found');
      expect(res.body.code).toBe('NOT_FOUND');
    });

    it('should return 200 with full cache entry including code', async () => {
      const id = new ObjectId();
      await database.collection('generated_scrapers').insertOne({
        _id: id,
        cacheKey: 'key2',
        platformName: 'Skyward',
        loginUrl: 'https://skyward.example.com',
        loginMethod: 'form',
        scraperCode: 'const x = 1;',
        transformerCode: 'export function transform() {}',
        metadata: { version: 1 },
        createdAt: new Date(),
      });
      const res = await request(app)
        .get(`/api/admin/scrapers/caches/${id}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.data.scraperCode).toBe('const x = 1;');
      expect(res.body.data.transformerCode).toBe('export function transform() {}');
      expect(res.body.data.platformName).toBe('Skyward');
    });
  });

  describe('DELETE /api/admin/scrapers/caches/:id', () => {
    it('should return 401 without admin token', async () => {
      const res = await request(app).delete('/api/admin/scrapers/caches/507f1f77bcf86cd799439011');
      expect(res.status).toBe(401);
    });

    it('should return 404 when cache not found', async () => {
      const id = new ObjectId();
      const res = await request(app)
        .delete(`/api/admin/scrapers/caches/${id}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(404);
    });

    it('should return 200 and delete cache', async () => {
      const id = new ObjectId();
      await database.collection('generated_scrapers').insertOne({
        _id: id,
        cacheKey: 'key-del',
        platformName: 'Test',
        loginUrl: 'https://test.com',
        createdAt: new Date(),
      });
      const res = await request(app)
        .delete(`/api/admin/scrapers/caches/${id}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.deleted).toBe(true);
      const remaining = await database.collection('generated_scrapers').countDocuments({ _id: id });
      expect(remaining).toBe(0);
    });
  });

  describe('GET /api/admin/scrapers/jobs', () => {
    it('should return 401 without admin token', async () => {
      const res = await request(app).get('/api/admin/scrapers/jobs');
      expect(res.status).toBe(401);
    });

    it('should return 200 with paginated jobs', async () => {
      const res = await request(app)
        .get('/api/admin/scrapers/jobs')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([]);
      expect(res.body.total).toBe(0);
    });

    it('should return job list with filters', async () => {
      await database.collection('scraper_generation_jobs').insertOne({
        jobId: 'job-abc',
        userId: 'user-1',
        platformName: 'Canvas',
        loginUrl: 'https://canvas.example.com',
        status: 'completed',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      const res = await request(app)
        .get('/api/admin/scrapers/jobs')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].jobId).toBe('job-abc');
      expect(res.body.data[0].status).toBe('completed');
    });
  });

  describe('GET /api/admin/scrapers/jobs/:jobId', () => {
    it('should return 401 without admin token', async () => {
      const res = await request(app).get('/api/admin/scrapers/jobs/job-1');
      expect(res.status).toBe(401);
    });

    it('should return 404 when job not found', async () => {
      const res = await request(app)
        .get('/api/admin/scrapers/jobs/nonexistent-job-id')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(404);
      expect(res.body.error).toContain('not found');
    });

    it('should return 200 with job details', async () => {
      await database.collection('scraper_generation_jobs').insertOne({
        jobId: 'job-detail-1',
        userId: 'u1',
        platformName: 'Canvas',
        loginUrl: 'https://canvas.example.com',
        status: 'completed',
        steps: [{ name: 'connect', ok: true }],
        result: { scraperId: 'sid-1' },
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      const res = await request(app)
        .get('/api/admin/scrapers/jobs/job-detail-1')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.data.jobId).toBe('job-detail-1');
      expect(res.body.data.result.scraperId).toBe('sid-1');
    });
  });

  describe('GET /api/admin/scrapers/reports', () => {
    it('should return 401 without admin token', async () => {
      const res = await request(app).get('/api/admin/scrapers/reports');
      expect(res.status).toBe(401);
    });

    it('should return 200 with paginated reports', async () => {
      const res = await request(app)
        .get('/api/admin/scrapers/reports')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([]);
      expect(res.body.total).toBe(0);
    });

    it('should return report entries', async () => {
      await database.collection('scraper_reports').insertOne({
        cacheKey: 'report-key',
        status: 'failed',
        error: 'Timeout',
        reportedAt: new Date(),
        generatedAt: new Date(),
      });
      const res = await request(app)
        .get('/api/admin/scrapers/reports')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].cacheKey).toBe('report-key');
      expect(res.body.data[0].status).toBe('failed');
    });
  });

  describe('POST /api/admin/scrapers/test', () => {
    it('should return 401 without admin token', async () => {
      const res = await request(app)
        .post('/api/admin/scrapers/test')
        .send({ loginUrl: 'https://example.com' });
      expect(res.status).toBe(401);
    });

    it('should return 400 when loginUrl missing', async () => {
      const res = await request(app)
        .post('/api/admin/scrapers/test')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({});
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('loginUrl');
    });

    it('should return 200 with step results when connect succeeds', async () => {
      const res = await request(app)
        .post('/api/admin/scrapers/test')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ loginUrl: 'https://canvas.example.com/login' });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.connect).toMatchObject({ ok: true });
      expect(res.body.data.crawl).toBeDefined();
      expect(res.body.data.authenticateCheck).toBeDefined();
    });
  });
});
