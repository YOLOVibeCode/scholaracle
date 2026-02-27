import type { Request, Response, NextFunction } from 'express';

export interface IRateLimitResult {
  readonly allowed: boolean;
  readonly remaining: number;
  readonly resetAt: number; // epoch ms
}

/**
 * ISP: minimal limiter interface used by middleware.
 */
export interface IRateLimiter {
  consume(key: string, windowMs: number, max: number): IRateLimitResult;
  reset(key: string): void;
}

/**
 * In-memory rate limiter (process-local). Good for dev/test; swap with Redis later.
 */
export class MemoryRateLimiter implements IRateLimiter {
  private readonly buckets = new Map<string, { count: number; resetAt: number }>();

  consume(key: string, windowMs: number, max: number): IRateLimitResult {
    const now = Date.now();
    const existing = this.buckets.get(key);

    if (!existing || existing.resetAt <= now) {
      const resetAt = now + windowMs;
      this.buckets.set(key, { count: 1, resetAt });
      return { allowed: true, remaining: Math.max(0, max - 1), resetAt };
    }

    const nextCount = existing.count + 1;
    existing.count = nextCount;

    const allowed = nextCount <= max;
    const remaining = Math.max(0, max - nextCount);
    return { allowed, remaining, resetAt: existing.resetAt };
  }

  reset(key: string): void {
    this.buckets.delete(key);
  }
}

export interface IRateLimitOptions {
  readonly limiter: IRateLimiter;
  readonly windowMs: number;
  readonly max: number;
  readonly keyPrefix: string;
  readonly enabled?: boolean;
  readonly keyFn?: (req: Request) => string;
}

export function rateLimitMiddleware(options: IRateLimitOptions) {
  const enabled = options.enabled ?? true;
  const keyFn =
    options.keyFn ??
    ((req) => {
      // Prefer forwarded header if present, else fallback to Express IP.
      const xf = (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim();
      return xf || req.ip || 'unknown';
    });

  return (req: Request, res: Response, next: NextFunction): void => {
    if (!enabled) {
      next();
      return;
    }

    const key = `${options.keyPrefix}:${keyFn(req)}`;
    const result = options.limiter.consume(key, options.windowMs, options.max);

    res.setHeader('X-RateLimit-Limit', String(options.max));
    res.setHeader('X-RateLimit-Remaining', String(result.remaining));
    res.setHeader('X-RateLimit-Reset', String(Math.floor(result.resetAt / 1000)));

    if (!result.allowed) {
      res.status(429).json({
        success: false,
        error: 'Rate limit exceeded',
        code: 'RATE_LIMIT_EXCEEDED',
      });
      return;
    }

    next();
  };
}
