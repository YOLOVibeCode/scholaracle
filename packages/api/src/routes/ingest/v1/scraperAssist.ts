import express, { type Router, type Request, type Response } from 'express';
import { z } from 'zod';
import type { Db } from 'mongodb';
import { ConnectorTokenService } from '@scholaracle/auth';
import { ValidationError } from '@scholaracle/contracts';
import { LlmClient, resolveLlmConfig } from '@scholaracle/agents';
import {
  connectorAuthMiddleware,
  type IConnectorAuthenticatedRequest,
} from '../../../middleware/connectorAuth';
import { asyncHandler } from '../../../middleware/asyncHandler';
import { MemoryRateLimiter, rateLimitMiddleware } from '../../../middleware/rateLimit';
import { recordAiUsage } from '../../../services/ai-rate-limit';
import { getScraperSystemPrompt } from './scraperAssistPrompts';

const DEFAULT_DAILY_LIMIT = 40;
const BURST_WINDOW_MS = 60_000;
const DEFAULT_BURST_MAX = 10;
const MAX_INPUT_BYTES = 200 * 1024;
const USAGE_COLLECTION = 'scraper_assist_usage';
const JSON_BODY_LIMIT = '2mb';

const messageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string().min(1),
});

const scraperAssistBodySchema = z
  .object({
    purpose: z.enum(['generate', 'troubleshoot']),
    messages: z.array(messageSchema).min(1).max(50).optional(),
    prompt: z.string().min(1).optional(),
    maxTokens: z.number().int().positive().max(16_000).optional(),
    system: z.string().optional(),
  })
  .superRefine((body, ctx) => {
    const hasMessages = (body.messages?.length ?? 0) > 0;
    const hasPrompt = body.prompt !== undefined;
    if (hasMessages === hasPrompt) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Provide exactly one of messages or prompt',
      });
    }
  });

type IChatMessage = z.infer<typeof messageSchema>;

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

function userInputByteLength(messages: readonly IChatMessage[]): number {
  return messages.reduce((sum, m) => sum + Buffer.byteLength(m.content, 'utf8'), 0);
}

function normalizeBody(body: z.infer<typeof scraperAssistBodySchema>): {
  purpose: 'generate' | 'troubleshoot';
  messages: IChatMessage[];
  maxTokens?: number;
} {
  const messages =
    body.messages ??
    ([{ role: 'user' as const, content: body.prompt ?? '' }] satisfies IChatMessage[]);
  const bytes = userInputByteLength(messages);
  if (bytes > MAX_INPUT_BYTES) {
    throw new ValidationError(`Request is too large (max ${MAX_INPUT_BYTES} bytes of user input)`);
  }
  return { purpose: body.purpose, messages, maxTokens: body.maxTokens };
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
    express.json({ limit: JSON_BODY_LIMIT }),
    connectorAuth,
    burstLimit,
    asyncHandler(async (req: IConnectorAuthenticatedRequest, res: Response) => {
      const parsed = scraperAssistBodySchema.safeParse(req.body);
      if (!parsed.success) {
        throw new ValidationError(parsed.error.message);
      }
      const body = normalizeBody(parsed.data);
      const cfg = resolveLlmConfig('triage');
      if (!cfg) {
        throw new ValidationError('LLM is not configured on the server');
      }
      const userId = req.connectorUserId ?? '';
      const used = await recordDailyUse(params.database, userId);
      if (used > dailyLimit) {
        res.status(429).json({
          success: false,
          error: `Daily AI assist limit reached (${dailyLimit}). Try again tomorrow.`,
          code: 'RATE_LIMIT_EXCEEDED',
        });
        return;
      }
      const llm = new LlmClient(cfg);
      const response = await llm.complete(body.messages, {
        maxTokens: body.maxTokens ?? 4096,
        system: getScraperSystemPrompt(),
      });
      await recordAiUsage(params.database, userId, 'scraper_generation');
      res.status(200).json({
        purpose: body.purpose,
        content: response.content,
        usage: response.usage,
      });
    })
  );

  return router;
}
