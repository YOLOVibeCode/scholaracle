import express, { type Router, type Request, type Response } from 'express';
import { z } from 'zod';
import type { Db } from 'mongodb';
import { ConnectorTokenService } from '@scholaracle/auth';
import { ValidationError } from '@scholaracle/contracts';
import { LlmClient, resolveModelForRole } from '@scholaracle/agents';
import {
  connectorAuthMiddleware,
  type IConnectorAuthenticatedRequest,
} from '../../../middleware/connectorAuth';
import { asyncHandler } from '../../../middleware/asyncHandler';
import { MemoryRateLimiter, rateLimitMiddleware } from '../../../middleware/rateLimit';
import { resolveLlmConfig } from '../../../services/llm/resolveLlmConfig';

const DEFAULT_DAILY_LIMIT = 40;
const BURST_WINDOW_MS = 60_000;
const DEFAULT_BURST_MAX = 6;
const MAX_INPUT_CHARS = 200_000;
const USAGE_COLLECTION = 'scraper_assist_usage';

const scraperAssistBodySchema = z
  .object({
    purpose: z.enum(['generate', 'troubleshoot']),
    messages: z
      .array(
        z.object({
          role: z.enum(['user', 'assistant']),
          content: z.string().min(1),
        })
      )
      .min(1)
      .max(50),
    maxTokens: z.number().int().positive().max(16_000).optional(),
    system: z.string().optional(),
  })
  .refine(
    (body) =>
      body.messages.reduce((sum, m) => sum + m.content.length, 0) + (body.system?.length ?? 0) <=
      MAX_INPUT_CHARS,
    { message: `Request is too large (max ${MAX_INPUT_CHARS} characters)` }
  );

interface IScraperAssistUsageDoc {
  _id: string;
  userId: string;
  day: string;
  count: number;
}

function positiveIntFromEnv(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

/** Counts one call against the user's UTC-day allowance; returns the new count. */
async function recordDailyUse(database: Db, userId: string): Promise<number> {
  const day = new Date().toISOString().slice(0, 10);
  const doc = await database
    .collection<IScraperAssistUsageDoc>(USAGE_COLLECTION)
    .findOneAndUpdate(
      { _id: `${userId}:${day}` },
      { $inc: { count: 1 }, $setOnInsert: { userId, day } },
      { upsert: true, returnDocument: 'after' }
    );
  return doc?.count ?? 1;
}

export function createScraperAssistRouter(params: {
  readonly database: Db;
  readonly jwtSecret: string;
  readonly dailyLimit?: number;
  readonly burstMax?: number;
}): Router {
  const router = express.Router();
  const connectorTokenService = new ConnectorTokenService(params.jwtSecret);
  const connectorAuth = connectorAuthMiddleware(connectorTokenService, {
    database: params.database,
  });
  const dailyLimit =
    params.dailyLimit ?? positiveIntFromEnv('SCRAPER_ASSIST_DAILY_LIMIT', DEFAULT_DAILY_LIMIT);
  const burstLimit = rateLimitMiddleware({
    limiter: new MemoryRateLimiter(),
    windowMs: BURST_WINDOW_MS,
    max: params.burstMax ?? DEFAULT_BURST_MAX,
    keyPrefix: 'ingest:scraper-assist',
    keyFn: (req: Request) => (req as IConnectorAuthenticatedRequest).connectorUserId ?? 'unknown',
  });

  router.post(
    '/scraper-assist',
    connectorAuth,
    burstLimit,
    asyncHandler(async (req: IConnectorAuthenticatedRequest, res: Response) => {
      const parsed = scraperAssistBodySchema.safeParse(req.body);
      if (!parsed.success) {
        throw new ValidationError(parsed.error.message);
      }
      const cfg = resolveLlmConfig();
      if (!cfg) {
        throw new ValidationError('LLM is not configured on the server');
      }
      const used = await recordDailyUse(params.database, req.connectorUserId ?? '');
      if (used > dailyLimit) {
        res.status(429).json({
          success: false,
          error: `Daily AI assist limit reached (${dailyLimit}). Try again tomorrow.`,
          code: 'RATE_LIMIT_EXCEEDED',
        });
        return;
      }
      const llm = new LlmClient({
        apiKey: cfg.apiKey,
        baseUrl: cfg.baseUrl,
        model: process.env['AI_MODEL']?.trim() || resolveModelForRole('triage'),
      });
      const response = await llm.complete(parsed.data.messages, {
        maxTokens: parsed.data.maxTokens ?? 4096,
        system: parsed.data.system,
      });
      res.status(200).json({
        purpose: parsed.data.purpose,
        content: response.content,
        usage: response.usage,
      });
    })
  );

  return router;
}
