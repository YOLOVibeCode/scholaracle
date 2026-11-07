/**
 * Registry host matching + publish gate tests (TDD).
 */

import express from 'express';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient, type Db } from 'mongodb';
import { createErrorHandler } from '../../middleware/errorHandler';
import type { IAuthenticatedRequest } from '../../middleware/auth';
import { createScrapersRouter, hostMatches } from './scrapers';

const publishBody = {
  adapterId: 'demo-adapter',
  version: '1.0.0',
  name: 'Demo',
  hosts: ['school.example.com'],
  bundle: 'export default {}',
  bundleHash: 'abc123hash',
};

function mountScrapersApp(
  database: Db,
  publisherUserIds: readonly string[] | undefined
): express.Express {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as IAuthenticatedRequest).userId = 'publisher-user';
    next();
  });
  app.use(
    createScrapersRouter({
      database,
      publisherUserIds,
    })
  );
  app.use(createErrorHandler());
  return app;
}

describe('hostMatches', () => {
  it('should match exact hosts', () => {
    expect(hostMatches('school.instructure.com', 'school.instructure.com')).toBe(true);
    expect(hostMatches('school.instructure.com', 'other.instructure.com')).toBe(false);
  });

  it('should match wildcard *.domain', () => {
    expect(hostMatches('*.instructure.com', 'school.instructure.com')).toBe(true);
    expect(hostMatches('*.instructure.com', 'instructure.com')).toBe(true);
    expect(hostMatches('*.instructure.com', 'evil.com')).toBe(false);
  });

  it('should strip URL scheme/path from host input', () => {
    expect(hostMatches('*.instructure.com', 'https://school.instructure.com/login')).toBe(true);
  });
});

describe('scraper publish allowlist', () => {
  let mongoServer: MongoMemoryServer;
  let mongoClient: MongoClient;
  let database: Db;

  beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    mongoClient = new MongoClient(mongoServer.getUri());
    await mongoClient.connect();
    database = mongoClient.db('scraper_publish_test');
  });

  afterAll(async () => {
    await mongoClient.close();
    await mongoServer.stop();
  });

  it('should forbid publish when allowlist is empty', async () => {
    const app = mountScrapersApp(database, []);
    const res = await request(app).post('/').send(publishBody);
    expect(res.status).toBe(403);
    expect(res.body.error).toContain('not configured');
  });

  it('should forbid publish when user is not on allowlist', async () => {
    const app = mountScrapersApp(database, ['staff-1']);
    const res = await request(app).post('/').send(publishBody);
    expect(res.status).toBe(403);
    expect(res.body.error).toContain('Only Scholaracle');
  });

  it('should allow publish for allowlisted user', async () => {
    const app = mountScrapersApp(database, ['publisher-user']);
    const res = await request(app).post('/').send(publishBody);
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
  });
});
