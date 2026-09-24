import { Router, type Request, type Response } from 'express';
import type { Db } from 'mongodb';
import { WebhookEventRepository, type IWebhookEventWriter } from '@scholaracle/database';
import { asyncHandler } from '../../../middleware/asyncHandler';
import { verifyRelayWebhookSignature } from '../../../services/billing/verifyRelayWebhookSignature';
import { applyRelayStripeEvent } from '../../../services/billing/applyRelayStripeEvent';

export interface IRelayWebhookDeps {
  readonly database: Db;
  readonly webhookSecret: string;
  readonly callbackUrl: string;
  readonly webhookEventWriter?: IWebhookEventWriter;
}

export function relayWebhookRouter(deps: IRelayWebhookDeps): Router {
  const router = Router();
  const defaultWebhookRepo = new WebhookEventRepository(deps.database);
  void defaultWebhookRepo.ensureIndexes().catch(() => undefined);
  const webhookEventWriter = deps.webhookEventWriter ?? defaultWebhookRepo;

  router.post(
    '/',
    asyncHandler((req: Request, res: Response) => handleWebhook(req, res))
  );

  async function handleWebhook(req: Request, res: Response): Promise<void> {
    const relaySignature = req.headers['x-relay-signature'] as string | undefined;
    const noctusoftSignature = req.headers['x-noctusoft-signature'] as string | undefined;
    const rawBody = (req as unknown as { body: string | Buffer }).body;
    const body =
      typeof rawBody === 'string'
        ? rawBody
        : Buffer.isBuffer(rawBody)
          ? rawBody.toString('utf8')
          : '';

    if (!relaySignature && !noctusoftSignature) {
      res.status(400).json({ error: 'Missing relay webhook signature header' });
      return;
    }

    const isValid = verifyRelayWebhookSignature({
      rawBody: body,
      relaySignature,
      noctusoftSignature,
      webhookSecret: deps.webhookSecret,
      callbackUrl: deps.callbackUrl,
    });
    if (!isValid) {
      res.status(403).json({ error: 'Invalid webhook signature' });
      return;
    }

    const event = JSON.parse(body) as {
      id?: string;
      type?: string;
      data?: { object?: Record<string, unknown> };
    };

    const eventId = event.id;
    if (eventId) {
      const isNew = await webhookEventWriter.recordIfNew('relay', eventId);
      if (!isNew) {
        res.json({ received: true, deduped: true });
        return;
      }
    }

    if (event.type && event.id) {
      await applyRelayStripeEvent(deps.database, {
        id: event.id,
        type: event.type,
        data: event.data,
      });
    }

    res.json({ received: true });
  }

  return router;
}
