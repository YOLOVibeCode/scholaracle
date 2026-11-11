import { Router, type Request, type Response } from 'express';
import type { Db } from 'mongodb';
import {
  UserRepository,
  WebhookEventRepository,
  type IWebhookEventWriter,
} from '@scholaracle/database';
import { getErrorReporter } from '@scholaracle/contracts';
import { asyncHandler } from '../../../middleware/asyncHandler';
import { verifyNoctusoftWebhookSignature } from '../../../services/noctusoft-store/verifyNoctusoftWebhookSignature';
import type { INoctusoftStoreWebhookEventV1 } from '../../../services/noctusoft-store/types';
import { resolveWebhookBillingContext } from '../../../services/billing/resolveWebhookBillingContext';
import {
  activateOrRenewSubscription,
  recordStoreRefund,
  revokeOrMarkPastDue,
  syncStoreSubscriptionState,
} from '../../../services/billing/applyBillingEntitlement';
import { logger } from '../../../logger';

export interface INoctusoftWebhookDeps {
  readonly database: Db;
  readonly webhookSecret: string;
  readonly webhookEventWriter?: IWebhookEventWriter;
  /**
   * The store alias this environment sells through. When set, a correctly signed
   * event from any other store is acknowledged and changes nothing.
   */
  readonly storeAlias?: string;
  /**
   * The mode this environment trades in. When set, an event in the other mode
   * (test money reaching production, or live money reaching UAT) is
   * acknowledged and changes nothing.
   */
  readonly storeMode?: 'test' | 'live';
}

/** Events that carry money for a plan. */
const PAID_EVENTS = new Set(['purchase.paid', 'subscription.started', 'subscription.renewed']);
const OBJECT_ID_HEX = /^[0-9a-f]{24}$/i;

/** Money the app took (or gave back) but could not attach to a user or plan. */
interface IOrphan {
  readonly reason: string;
  readonly event: INoctusoftStoreWebhookEventV1;
}

function parseDate(value: string | null | undefined): Date | undefined {
  if (!value) return undefined;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

function receiptUrlFromEvent(event: INoctusoftStoreWebhookEventV1): string | undefined {
  const url = event.action?.url;
  if (url && /^https?:\/\//i.test(url)) {
    return url;
  }
  return undefined;
}

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

    let event: INoctusoftStoreWebhookEventV1;
    try {
      event = JSON.parse(body) as INoctusoftStoreWebhookEventV1;
    } catch {
      res.status(400).json({ error: 'Body is not JSON' });
      return;
    }

    // Operator connectivity test: answer 2xx, grant nothing.
    if (event.type === 'store.ping') {
      res.json({ received: true, ping: true });
      return;
    }

    if (deps.storeAlias && event.store !== deps.storeAlias) {
      logger.warn(
        { eventId: event.id, type: event.type, store: event.store ?? null },
        'Store event is for another store alias; nothing changed'
      );
      res.json({ received: true, ignored: 'store' });
      return;
    }
    if (deps.storeMode && event.mode !== deps.storeMode) {
      logger.warn(
        { eventId: event.id, type: event.type, mode: event.mode ?? null, expected: deps.storeMode },
        'Store event is in the other mode; nothing changed'
      );
      res.json({ received: true, ignored: 'mode' });
      return;
    }

    const eventId = event.id;
    if (eventId) {
      const isNew = await webhookEventWriter.recordIfNew('noctusoft', eventId);
      if (!isNew) {
        res.json({ received: true, deduped: true });
        return;
      }
    }

    try {
      await applyEvent(event);
    } catch (err) {
      // Forget the id so the relay's retry is processed again instead of deduped.
      if (eventId) {
        await webhookEventWriter.forget('noctusoft', eventId).catch((forgetErr: unknown) => {
          logger.error({ err: forgetErr, eventId }, 'Could not forget a failed store event id');
        });
      }
      throw err;
    }

    res.json({ received: true });
  }

  async function applyEvent(event: INoctusoftStoreWebhookEventV1): Promise<void> {
    const eventId = event.id;
    const resolved = resolveWebhookBillingContext(event);
    const subscriptionRef = event.refs?.subscriptionId ?? undefined;

    if (event.type === 'purchase.refunded') {
      const matched = await recordStoreRefund(
        { database: deps.database },
        {
          paymentId: event.refs?.paymentId ?? null,
          refundId: event.refs?.refundId ?? null,
          refundedCents: event.money?.refundedCents ?? 0,
        }
      );
      if (!matched && (event.money?.refundedCents ?? 0) > 0) {
        await reportOrphan({ reason: 'refund matches no recorded payment', event });
      }
      return;
    }

    if (!resolved) {
      if (PAID_EVENTS.has(event.type) || event.type === 'purchase.dispute_lost') {
        await reportOrphan({ reason: 'money event names no buyer', event });
      }
      return;
    }

    if (!(await isScholarmancyUser(resolved.userId))) {
      if (PAID_EVENTS.has(event.type)) {
        await reportOrphan({ reason: 'buyer is not a Scholarmancy user', event });
      } else {
        logger.warn(
          { eventId, type: event.type },
          'Store event names a buyer who is not a Scholarmancy user; nothing changed'
        );
      }
      return;
    }

    const storeStatus = event.subscription?.status ?? null;
    const currentPeriodEnd = parseDate(event.subscription?.currentPeriodEnd);
    const trialEnd = parseDate(event.subscription?.trialEnd);

    if (PAID_EVENTS.has(event.type)) {
      if (resolved.plan === null || resolved.billingCycle === null) {
        await reportOrphan({ reason: 'paid item is not a Scholarmancy plan', event });
        return;
      }
      // A subscription whose first payment has not gone through grants nothing yet;
      // it becomes active through subscription.changed or renewed.
      if (storeStatus === 'incomplete' || storeStatus === 'canceled' || storeStatus === 'paused') {
        logger.info(
          { eventId, type: event.type, status: storeStatus },
          'Store subscription is not paid yet; nothing granted'
        );
        return;
      }
      const receiptUrl = receiptUrlFromEvent(event);
      const outcome = await activateOrRenewSubscription(
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
          status: storeStatus === 'trialing' ? 'trialing' : 'active',
          ...(currentPeriodEnd ? { currentPeriodEnd } : {}),
          ...(trialEnd ? { trialEnd } : {}),
          recordChargeWithoutPaymentRef:
            event.type === 'subscription.started' && storeStatus === 'active',
          ...(receiptUrl ? { receiptUrl } : {}),
          description: `Noctusoft store ${event.type} — ${resolved.plan} (${resolved.billingCycle})`,
        }
      );
      if (outcome === 'revival-refused') {
        logger.warn(
          { eventId, type: event.type },
          'Store event would revive a cancelled subscription; nothing granted'
        );
      }
      return;
    }

    switch (event.type) {
      case 'subscription.changed': {
        const status =
          storeStatus === 'active' ||
          storeStatus === 'trialing' ||
          storeStatus === 'past_due' ||
          storeStatus === 'paused'
            ? storeStatus
            : undefined;
        if (storeStatus === 'canceled') {
          await revokeOrMarkPastDue(
            { database: deps.database },
            resolved.userId,
            'cancelled',
            'free',
            subscriptionRef
          );
          return;
        }
        const synced = await syncStoreSubscriptionState(
          { database: deps.database },
          resolved.userId,
          {
            ...(subscriptionRef ? { storeSubscriptionId: subscriptionRef } : {}),
            ...(status ? { status } : {}),
            ...(currentPeriodEnd ? { currentPeriodEnd } : {}),
            ...(trialEnd ? { trialEnd } : {}),
            ...(typeof event.subscription?.cancelScheduled === 'boolean'
              ? { cancelAtPeriodEnd: event.subscription.cancelScheduled }
              : {}),
            ...(resolved.plan &&
            resolved.billingCycle &&
            (status === 'active' || status === 'trialing')
              ? { plan: resolved.plan, billingCycle: resolved.billingCycle }
              : {}),
          }
        );
        // An incomplete subscription that is now paid arrives as changed/active
        // with no prior row: activate it.
        if (
          !synced &&
          (status === 'active' || status === 'trialing') &&
          resolved.plan &&
          resolved.billingCycle
        ) {
          await activateOrRenewSubscription(
            { database: deps.database },
            {
              userId: resolved.userId,
              plan: resolved.plan,
              billingCycle: resolved.billingCycle,
              amountCents: 0,
              currency: resolved.currency,
              storeSubscriptionId: resolved.subscriptionId,
              status,
              ...(currentPeriodEnd ? { currentPeriodEnd } : {}),
              ...(trialEnd ? { trialEnd } : {}),
              description: `Noctusoft store ${event.type} — ${resolved.plan} (${resolved.billingCycle})`,
            }
          );
        }
        return;
      }
      case 'subscription.canceled':
        await revokeOrMarkPastDue(
          { database: deps.database },
          resolved.userId,
          'cancelled',
          'free',
          subscriptionRef
        );
        return;
      case 'subscription.payment_failed':
        await revokeOrMarkPastDue({ database: deps.database }, resolved.userId, 'past_due');
        return;
      case 'subscription.paused':
        await revokeOrMarkPastDue({ database: deps.database }, resolved.userId, 'paused');
        return;
      case 'subscription.resumed':
        await syncStoreSubscriptionState({ database: deps.database }, resolved.userId, {
          ...(subscriptionRef ? { storeSubscriptionId: subscriptionRef } : {}),
          status: 'active',
          ...(currentPeriodEnd ? { currentPeriodEnd } : {}),
        });
        return;
      case 'purchase.dispute_lost':
        await revokeOrMarkPastDue(
          { database: deps.database },
          resolved.userId,
          'cancelled',
          'free',
          subscriptionRef
        );
        await reportOrphan({ reason: 'dispute lost; access revoked', event });
        return;
      default:
        return;
    }
  }

  /**
   * Records money the app could not attach, alerts through the error reporter
   * (Sentry when configured), and keeps a row for an admin to settle.
   */
  async function reportOrphan(orphan: IOrphan): Promise<void> {
    const e = orphan.event;
    const context = {
      eventId: e.id,
      type: e.type,
      store: e.store ?? null,
      mode: e.mode ?? null,
      item: e.item?.code ?? e.item?.key ?? null,
      amountCents: e.money?.amountCents ?? null,
      refundedCents: e.money?.refundedCents ?? null,
      paymentRef: e.refs?.paymentId ?? null,
      subscriptionRef: e.refs?.subscriptionId ?? null,
    };
    logger.error({ ...context, reason: orphan.reason }, 'Store money event needs attention');
    getErrorReporter().captureMessage(
      `Store money event needs attention: ${orphan.reason}`,
      context
    );
    await deps.database.collection('billing_orphans').insertOne({
      ...context,
      reason: orphan.reason,
      buyerUserId: e.buyer?.userId ?? null,
      buyerEmail: e.buyer?.email ?? null,
      resolved: false,
      createdAt: new Date(),
    });
  }

  async function isScholarmancyUser(userId: string): Promise<boolean> {
    if (!OBJECT_ID_HEX.test(userId)) return false;
    return (await userRepo.findById(userId)) !== null;
  }

  return router;
}
