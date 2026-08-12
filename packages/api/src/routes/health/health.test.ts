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
    it('should return 200 with health status', async () => {
      // Act
      const response = await request(app).get('/api/health');

      // Assert
      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        status: 'ok',
        timestamp: expect.any(String),
      });
    });

    it('should return timestamp in ISO format', async () => {
      // Act
      const response = await request(app).get('/api/health');

      // Assert
      expect(response.body.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
      expect(() => new Date(response.body.timestamp)).not.toThrow();
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
        timestamp: expect.any(String),
      });
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
