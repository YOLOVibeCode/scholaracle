import { Router, type Request, type Response } from 'express';
import type { Db } from 'mongodb';
import {
  UserRepository,
  WebhookEventRepository,
  type IWebhookEventWriter,
} from '@scholaracle/database';
import { asyncHandler } from '../../../middleware/asyncHandler';
import { verifyNoctusoftWebhookSignature } from '../../../services/noctusoft-store/verifyNoctusoftWebhookSignature';
import type { INoctusoftStoreWebhookEventV1 } from '../../../services/noctusoft-store/types';
import { resolveWebhookBillingContext } from '../../../services/billing/resolveWebhookBillingContext';
import {
  activateOrRenewSubscription,
  recordStoreRefund,
  revokeOrMarkPastDue,
  syncCancelAtPeriodEnd,
} from '../../../services/billing/applyBillingEntitlement';
import { logger } from '../../../logger';

export interface INoctusoftWebhookDeps {
  readonly database: Db;
  readonly webhookSecret: string;
  readonly webhookEventWriter?: IWebhookEventWriter;
}

const PAID_EVENTS = new Set(['purchase.paid', 'subscription.started', 'subscription.renewed']);
const OBJECT_ID_HEX = /^[0-9a-f]{24}$/i;

export function noctusoftWebhookRouter(deps: INoctusoftWebhookDeps): Router {
  const router = Router();
  const userRepo = new UserRepository(deps.database);
  const defaultWebhookRepo = new WebhookEventRepository(deps.database);
  void defaultWebhookRepo.ensureIndexes().catch((err: unknown) => {
    logger.error({ err }, 'Failed to ensure webhook_events indexes');
  });
  const webhookEventWriter: IWebhookEventWriter = deps.webhookEventWriter ?? defaultWebhookRepo;

  router.post(
    '/',
    asyncHandler((req: Request, res: Response) => handleWebhook(req, res))
  );

  async function handleWebhook(req: Request, res: Response): Promise<void> {
    const signature = req.headers['x-noctusoft-signature'] as string | undefined;
    const rawBody = (req as unknown as { body: string | Buffer }).body;
    const body =
      typeof rawBody === 'string'
        ? rawBody
        : Buffer.isBuffer(rawBody)
          ? rawBody.toString('utf8')
          : '';

    if (!signature) {
      res.status(400).json({ error: 'Missing x-noctusoft-signature header' });
      return;
    }

    const isValid = verifyNoctusoftWebhookSignature(body, signature, deps.webhookSecret);
    if (!isValid) {
      res.status(403).json({ error: 'Invalid webhook signature' });
      return;
    }

    const event = JSON.parse(body) as INoctusoftStoreWebhookEventV1;
    const eventId = event.id;
    if (eventId) {
      const isNew = await webhookEventWriter.recordIfNew('noctusoft', eventId);
      if (!isNew) {
        res.json({ received: true, deduped: true });
        return;
      }
    }

    const resolved = resolveWebhookBillingContext(event);
    if (event.type === 'purchase.refunded') {
      await recordStoreRefund(
        { database: deps.database },
        {
          paymentId: event.refs?.paymentId ?? null,
          refundId: event.refs?.refundId ?? null,
          refundedCents: event.money?.refundedCents ?? 0,
        }
      );
    } else if (resolved && !(await isScholarmancyUser(resolved.userId))) {
      logger.warn(
        { eventId, type: event.type },
        'Store event names a buyer who is not a Scholarmancy user; nothing changed'
      );
    } else if (resolved) {
      if (PAID_EVENTS.has(event.type)) {
        if (resolved.plan === null || resolved.billingCycle === null) {
          logger.warn(
            { eventId, type: event.type, item: event.item?.code ?? event.item?.key ?? null },
            'Store event names no Scholarmancy plan; nothing granted'
          );
        } else {
          await activateOrRenewSubscription(
            { database: deps.database },
            {
              userId: resolved.userId,
              plan: resolved.plan,
              billingCycle: resolved.billingCycle,
              amountCents: resolved.amountCents,
              currency: resolved.currency,
              paymentId: resolved.paymentId,
              orderId: resolved.orderId,
              storeSubscriptionId: resolved.subscriptionId,
              recordChargeWithoutPaymentRef:
                event.type === 'subscription.started' && event.subscription?.status === 'active',
              description: `Noctusoft store ${event.type} — ${resolved.plan} (${resolved.billingCycle})`,
            }
          );
        }
      } else if (event.type === 'subscription.changed') {
        const cancelScheduled = event.subscription?.cancelScheduled;
        if (typeof cancelScheduled === 'boolean') {
          await syncCancelAtPeriodEnd(
            { database: deps.database },
            resolved.userId,
            cancelScheduled
          );
        }
      } else if (event.type === 'subscription.canceled') {
        await revokeOrMarkPastDue({ database: deps.database }, resolved.userId, 'cancelled');
      } else if (event.type === 'subscription.payment_failed') {
        await revokeOrMarkPastDue({ database: deps.database }, resolved.userId, 'past_due');
      }
    }

    res.json({ received: true });
  }

  async function isScholarmancyUser(userId: string): Promise<boolean> {
    if (!OBJECT_ID_HEX.test(userId)) return false;
    return (await userRepo.findById(userId)) !== null;
  }

  return router;
}
