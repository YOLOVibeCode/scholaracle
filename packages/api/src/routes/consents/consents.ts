import { Router, type Response } from 'express';
import { z } from 'zod';
import type { Db } from 'mongodb';
import { SERVER_AI_CONSENT_PURPOSE, SERVER_AI_CONSENT_TEXT_VERSION } from '@scholaracle/contracts';
import { ServerAiConsentRepository } from '@scholaracle/database';
import { asyncHandler } from '../../middleware/asyncHandler';
import type { IAuthenticatedRequest } from '../../middleware/auth';

const serverAiBodySchema = z.object({
  enabled: z.boolean(),
});

export interface IConsentsRouterConfig {
  readonly database: Db;
}

async function handleGetConsents(
  req: IAuthenticatedRequest,
  res: Response,
  database: Db
): Promise<void> {
  const userId = req.userId;
  if (!userId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  const repo = new ServerAiConsentRepository(database);
  const serverAi = await repo.hasActiveConsent(userId, SERVER_AI_CONSENT_PURPOSE);
  res.json({ serverAi });
}

async function handlePutServerAi(
  req: IAuthenticatedRequest,
  res: Response,
  database: Db
): Promise<void> {
  const userId = req.userId;
  if (!userId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  const parsed = serverAiBodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid request', details: parsed.error.flatten() });
    return;
  }
  const repo = new ServerAiConsentRepository(database);
  const source =
    typeof req.headers['x-consent-source'] === 'string'
      ? req.headers['x-consent-source']
      : '/api/consents/server-ai';
  if (parsed.data.enabled) {
    await repo.recordOptIn({
      userId,
      purpose: SERVER_AI_CONSENT_PURPOSE,
      consentTextVersion: SERVER_AI_CONSENT_TEXT_VERSION,
      source,
      ipAddress: req.ip ?? undefined,
      userAgent: req.headers['user-agent'] ?? undefined,
    });
  } else {
    await repo.recordRevoke(userId, SERVER_AI_CONSENT_PURPOSE);
  }
  const serverAi = await repo.hasActiveConsent(userId, SERVER_AI_CONSENT_PURPOSE);
  res.json({ serverAi });
}

export function consentsRouter(config: IConsentsRouterConfig): Router {
  const router = Router();

  router.get(
    '/',
    asyncHandler(async (req, res) => {
      await handleGetConsents(req as IAuthenticatedRequest, res, config.database);
    })
  );

  router.put(
    '/server-ai',
    asyncHandler(async (req, res) => {
      await handlePutServerAi(req as IAuthenticatedRequest, res, config.database);
    })
  );

  return router;
}
