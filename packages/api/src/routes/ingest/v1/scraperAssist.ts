import express, { type Router, type Response } from 'express';
import { z } from 'zod';
import type { Db } from 'mongodb';
import { ConnectorTokenService } from '@scholaracle/auth';
import { ValidationError } from '@scholaracle/contracts';
import { LlmClient } from '@scholaracle/agents';
import {
  connectorAuthMiddleware,
  type IConnectorAuthenticatedRequest,
} from '../../../middleware/connectorAuth';
import { asyncHandler } from '../../../middleware/asyncHandler';
import { resolveLlmConfig } from '../../../services/llm/resolveLlmConfig';

const scraperAssistBodySchema = z.object({
  purpose: z.enum(['generate', 'troubleshoot']),
  messages: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string().min(1),
      })
    )
    .min(1),
  maxTokens: z.number().int().positive().max(16_000).optional(),
  system: z.string().optional(),
});

export function createScraperAssistRouter(params: {
  readonly database: Db;
  readonly jwtSecret: string;
}): Router {
  const router = express.Router();
  const connectorTokenService = new ConnectorTokenService(params.jwtSecret);
  const connectorAuth = connectorAuthMiddleware(connectorTokenService, {
    database: params.database,
  });

  router.post(
    '/scraper-assist',
    connectorAuth,
    asyncHandler(async (req: IConnectorAuthenticatedRequest, res: Response) => {
      const parsed = scraperAssistBodySchema.safeParse(req.body);
      if (!parsed.success) {
        throw new ValidationError(parsed.error.message);
      }
      const cfg = resolveLlmConfig();
      if (!cfg) {
        throw new ValidationError('LLM is not configured on the server');
      }
      const llm = new LlmClient({
        apiKey: cfg.apiKey,
        baseUrl: cfg.baseUrl,
        model: cfg.model,
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
