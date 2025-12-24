import request from 'supertest';
import express from 'express';
import { rateLimitMiddleware, MemoryRateLimiter } from './rateLimit';

describe('rateLimitMiddleware', () => {
  it('should return 429 after exceeding limit within window', async () => {
    const app = express();
    const limiter = new MemoryRateLimiter();

    app.get(
      '/limited',
      rateLimitMiddleware({
        limiter,
        windowMs: 10_000,
        max: 3,
        keyPrefix: 'test:limited',
      }),
      (_req, res) => res.status(200).json({ ok: true })
    );

    await request(app).get('/limited').expect(200);
    await request(app).get('/limited').expect(200);
    await request(app).get('/limited').expect(200);
    const res = await request(app).get('/limited');
    expect(res.status).toBe(429);
    expect(res.body.success).toBe(false);
    expect(String(res.body.error ?? '')).toMatch(/rate limit/i);
  });
});


