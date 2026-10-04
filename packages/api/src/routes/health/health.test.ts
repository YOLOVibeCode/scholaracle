import request from 'supertest';
import express, { type Express } from 'express';
import { healthRouter } from './health';

describe('Health Router', () => {
  let app: Express;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use('/api/health', healthRouter);
  });

  describe('GET /api/health', () => {
    const savedRailwaySha = process.env['RAILWAY_GIT_COMMIT_SHA'];
    const savedVercelSha = process.env['VERCEL_GIT_COMMIT_SHA'];
    const savedGitCommit = process.env['GIT_COMMIT'];

    afterEach(() => {
      if (savedRailwaySha === undefined) delete process.env['RAILWAY_GIT_COMMIT_SHA'];
      else process.env['RAILWAY_GIT_COMMIT_SHA'] = savedRailwaySha;
      if (savedVercelSha === undefined) delete process.env['VERCEL_GIT_COMMIT_SHA'];
      else process.env['VERCEL_GIT_COMMIT_SHA'] = savedVercelSha;
      if (savedGitCommit === undefined) delete process.env['GIT_COMMIT'];
      else process.env['GIT_COMMIT'] = savedGitCommit;
    });

    it('should return 200 with health status', async () => {
      // Act
      const response = await request(app).get('/api/health');

      // Assert
      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        status: 'ok',
        ok: true,
        service: 'scholarmancy-api',
        commit: expect.any(String),
        env: expect.any(String),
        timestamp: expect.any(String),
        utc: expect.any(String),
      });
    });

    it('should return timestamp in ISO format', async () => {
      // Act
      const response = await request(app).get('/api/health');

      // Assert
      expect(response.body.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
      expect(() => new Date(response.body.timestamp)).not.toThrow();
      expect(response.body.utc).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
      expect(() => new Date(response.body.utc)).not.toThrow();
    });

    it('should return commit from RAILWAY_GIT_COMMIT_SHA when set', async () => {
      process.env['RAILWAY_GIT_COMMIT_SHA'] = 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeef';

      const response = await request(app).get('/api/health');

      expect(response.status).toBe(200);
      expect(response.body.commit).toBe('deadbeefdeadbeefdeadbeefdeadbeefdeadbeef');
    });

    it('should report unknown commit when deploy env vars are absent', async () => {
      delete process.env['RAILWAY_GIT_COMMIT_SHA'];
      delete process.env['VERCEL_GIT_COMMIT_SHA'];
      delete process.env['GIT_COMMIT'];

      const response = await request(app).get('/api/health');

      expect(response.status).toBe(200);
      expect(response.body.commit).toBe('unknown');
    });
  });

  describe('GET /api/health/version', () => {
    const savedSha = process.env['RAILWAY_GIT_COMMIT_SHA'];
    const savedBranch = process.env['RAILWAY_GIT_BRANCH'];

    afterEach(() => {
      if (savedSha === undefined) delete process.env['RAILWAY_GIT_COMMIT_SHA'];
      else process.env['RAILWAY_GIT_COMMIT_SHA'] = savedSha;
      if (savedBranch === undefined) delete process.env['RAILWAY_GIT_BRANCH'];
      else process.env['RAILWAY_GIT_BRANCH'] = savedBranch;
    });

    it('should return the deployed commit from Railway env vars', async () => {
      process.env['RAILWAY_GIT_COMMIT_SHA'] = 'abc123def456';
      process.env['RAILWAY_GIT_BRANCH'] = 'main';

      const response = await request(app).get('/api/health/version');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        status: 'ok',
        commit: 'abc123def456',
        branch: 'main',
        builtAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/),
        uptimeSeconds: expect.any(Number),
        nodeVersion: expect.stringMatching(/^v\d+.\d+.\d+/),
        platform: process.platform,
        timestamp: expect.any(String),
      });
    });

    it('should include nodeVersion matching process.version', async () => {
      const response = await request(app).get('/api/health/version');

      expect(response.status).toBe(200);
      expect(typeof response.body.nodeVersion).toBe('string');
      expect(response.body.nodeVersion).toMatch(/^v\d+.\d+.\d+/);
      expect(response.body.nodeVersion).toBe(process.version);
    });

    it('should include platform matching process.platform', async () => {
      const response = await request(app).get('/api/health/version');

      expect(response.status).toBe(200);
      expect(typeof response.body.platform).toBe('string');
      expect(response.body.platform.length).toBeGreaterThan(0);
      expect(response.body.platform).toBe(process.platform);
    });

    it('should include uptimeSeconds as a non-negative integer', async () => {
      const response = await request(app).get('/api/health/version');

      expect(response.status).toBe(200);
      expect(Number.isInteger(response.body.uptimeSeconds)).toBe(true);
      expect(response.body.uptimeSeconds).toBeGreaterThanOrEqual(0);
    });

    it('should report a stable builtAt across requests', async () => {
      const first = await request(app).get('/api/health/version');
      const second = await request(app).get('/api/health/version');
      expect(first.body.builtAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
      expect(first.body.builtAt).toBe(second.body.builtAt);
    });

    it('should prefer SCHOLARMANCY_BUILT_AT when set', async () => {
      const saved = process.env['SCHOLARMANCY_BUILT_AT'];
      process.env['SCHOLARMANCY_BUILT_AT'] = '2026-08-13T15:04:22Z';
      try {
        const response = await request(app).get('/api/health/version');
        expect(response.body.builtAt).toBe('2026-08-13T15:04:22Z');
      } finally {
        if (saved === undefined) delete process.env['SCHOLARMANCY_BUILT_AT'];
        else process.env['SCHOLARMANCY_BUILT_AT'] = saved;
      }
    });

    it('should report unknown when Railway env vars are absent', async () => {
      delete process.env['RAILWAY_GIT_COMMIT_SHA'];
      delete process.env['RAILWAY_GIT_BRANCH'];

      const response = await request(app).get('/api/health/version');

      expect(response.status).toBe(200);
      expect(response.body.commit).toBe('unknown');
      expect(response.body.branch).toBe('unknown');
    });
  });
});
