import { Router, type Request, type Response } from 'express';
import type { Db } from 'mongodb';
import {
  SubscriptionRepository,
  PaymentRepository,
  UserRepository,
  WebhookEventRepository,
  PLAN_PRICING,
  type IWebhookEventWriter,
  type SubscriptionPlan,
  type BillingCycle,
} from '@scholaracle/database';
import { SquareService } from '../../../services/SquareService';
import { asyncHandler } from '../../../middleware/asyncHandler';

export interface ISquareWebhookDeps {
  readonly database: Db;
  readonly squareService: SquareService;
  /**
   * Optional override for the webhook idempotency writer (DEF-001 / DEF-007).
   * When omitted, a default WebhookEventRepository(database) is constructed.
   * Useful for tests that want to inject a stub.
   */
  readonly webhookEventWriter?: IWebhookEventWriter;
}

interface IPaymentPayload {
  id?: string;
  orderId?: string;
  payment?: {
    id?: string;
    orderId?: string;
    order_id?: string;
    amountMoney?: { amount?: bigint | number; currency?: string };
    amount_money?: { amount?: bigint | number; currency?: string };
    status?: string;
    note?: string;
  };
}

interface IRefundPayload {
  id?: string;
  paymentId?: string;
  payment_id?: string;
  amountMoney?: { amount?: bigint | number; currency?: string };
  amount_money?: { amount?: bigint | number; currency?: string };
  status?: string;
  reason?: string;
}

function extractUserIdFromNote(note: string | undefined): string | null {
  if (!note) return null;
  const match = note.match(/User ID:\s*([^\s|]+)/);
  return match ? match[1]! : null;
}

function extractPlanFromNote(
  note: string | undefined
): { plan: SubscriptionPlan; cycle: BillingCycle } | null {
  if (!note) return null;
  const planMatch = note.match(/Plan:\s*(\w+)/);
  const cycleMatch = note.match(/Cycle:\s*(\w+)/);
  if (!planMatch) return null;
  const plan = planMatch[1]!.toLowerCase() as SubscriptionPlan;
  const validPlans: SubscriptionPlan[] = ['free', 'starter', 'premium', 'family', 'enterprise'];
  if (!validPlans.includes(plan)) return null;
  const cycle = (
    cycleMatch?.[1]?.toLowerCase() === 'annual' ? 'annual' : 'monthly'
  ) as BillingCycle;
  return { plan, cycle };
}

function resolvePlanFromAmount(amountCents: number): {
  plan: SubscriptionPlan;
  cycle: BillingCycle;
} {
  for (const [plan, pricing] of Object.entries(PLAN_PRICING) as [
    SubscriptionPlan,
    { monthly: number; annual: number },
  ][]) {
    if (plan === 'free') continue;
    if (Math.round(pricing.monthly * 100) === amountCents) return { plan, cycle: 'monthly' };
    if (Math.round(pricing.annual * 100) === amountCents) return { plan, cycle: 'annual' };
  }
  return { plan: 'starter', cycle: 'monthly' };
}

export function squareWebhookRouter(deps: ISquareWebhookDeps): Router {
  const router = Router();
  const subscriptionRepo = new SubscriptionRepository(deps.database);
  const paymentRepo = new PaymentRepository(deps.database);
  const userRepo = new UserRepository(deps.database);
  const defaultWebhookRepo = new WebhookEventRepository(deps.database);
  // Fire-and-forget: the unique compound index + TTL index are required for
  // recordIfNew to enforce dedup. Without them, duplicate event.ids could both
  // succeed insertion and we'd silently lose the DEF-001 protection.
  void defaultWebhookRepo.ensureIndexes().catch((err: unknown) => {
    // eslint-disable-next-line no-console
    console.error('Failed to ensure webhook_events indexes:', err);
  });
  const webhookEventWriter: IWebhookEventWriter = deps.webhookEventWriter ?? defaultWebhookRepo;

  router.post(
    '/',
    asyncHandler((req: Request, res: Response) => handleWebhook(req, res))
  );

  async function handleWebhook(req: Request, res: Response): Promise<void> {
    const signature = req.headers['x-square-hmacsha256-signature'] as string | undefined;
    const rawBody = (req as unknown as { body: string | Buffer }).body;
    const body =
      typeof rawBody === 'string'
        ? rawBody
        : Buffer.isBuffer(rawBody)
          ? rawBody.toString('utf8')
          : '';

    // Deliberate webhook signature responses — status codes and body shape must
    // stay exactly as Square integration expects (no envelope conversion).
    if (!signature) {
      res.status(400).json({ error: 'Missing x-square-hmacsha256-signature header' });
      return;
    }

    const isValid = await deps.squareService.verifyWebhookSignature(body, signature);
    if (!isValid) {
      res.status(403).json({ error: 'Invalid webhook signature' });
      return;
    }

    const event = JSON.parse(body) as {
      type?: string;
      event_id?: string;
      merchant_id?: string;
      data?: {
        type?: string;
        id?: string;
        object?: {
          payment?: IPaymentPayload['payment'];
          refund?: IRefundPayload;
        };
      };
    };

    // DEF-001 / DEF-007: dedup on the provider's event.id before dispatch.
    // If the event has already been processed (or is currently being processed
    // by a duplicate delivery), short-circuit with a 200 to keep the provider
    // from retrying — the original delivery is the authoritative one.
    const eventId = event.event_id ?? event.data?.id;
    if (eventId) {
      const isNew = await webhookEventWriter.recordIfNew('square', eventId);
      if (!isNew) {
        res.json({ received: true, deduped: true });
        return;
      }
    }

    const eventType = event.type ?? event.data?.type;
    if (
      eventType === 'payment.created' ||
      eventType === 'payment.completed' ||
      eventType === 'payment.updated'
    ) {
      const paymentData = event.data?.object?.payment;
      if (paymentData?.id && paymentData.status === 'COMPLETED') {
        await handlePaymentCompleted(paymentData);
      }
    } else if (eventType === 'refund.created' || eventType === 'refund.updated') {
      // DEF-002: process refund events; previously these silently 200'd.
      const refundData = event.data?.object?.refund;
      if (refundData) {
        await handleRefund(refundData);
      }
    }

    res.json({ received: true });
  }

  async function handlePaymentCompleted(
    payment: NonNullable<IPaymentPayload['payment']>
  ): Promise<void> {
    const paymentId = payment.id;
    const orderId = payment.orderId ?? payment.order_id;
    if (!paymentId) return;

    const existing = await paymentRepo.findBySquarePaymentId(paymentId);
    if (existing) return;

    const userId = extractUserIdFromNote(payment.note) ?? 'unknown';
    const amountMoney =
      payment.amountMoney ??
      (payment as { amount_money?: { amount?: bigint | number; currency?: string } }).amount_money;
    const amount = Number(amountMoney?.amount ?? 0);
    const currency = (amountMoney?.currency ?? 'USD').toLowerCase();

    const noteResolved = extractPlanFromNote(payment.note);
    const amountResolved = resolvePlanFromAmount(amount);
    const resolvedPlan = noteResolved?.plan ?? amountResolved.plan;
    const resolvedCycle = noteResolved?.cycle ?? amountResolved.cycle;

    const periodEnd = new Date();
    if (resolvedCycle === 'annual') {
      periodEnd.setFullYear(periodEnd.getFullYear() + 1);
    } else {
      periodEnd.setMonth(periodEnd.getMonth() + 1);
    }

    await paymentRepo.create({
      userId,
      amount,
      currency,
      status: payment.status === 'COMPLETED' ? 'succeeded' : 'pending',
      paymentMethod: 'card',
      squarePaymentId: paymentId,
      squareOrderId: orderId ?? undefined,
      description: `Square payment ${paymentId} — ${resolvedPlan} (${resolvedCycle})`,
    });

    const subscription = await subscriptionRepo.findByUserId(userId);

    if (subscription) {
      const updates: Record<string, unknown> = {
        plan: resolvedPlan,
        status: 'active',
        billingCycle: resolvedCycle,
        currentPeriodStart: new Date(),
        currentPeriodEnd: periodEnd,
        lastPaymentDate: new Date(),
        lastPaymentAmount: amount,
      };
      if (subscription.squareCustomerId) {
        updates['squareCustomerId'] = subscription.squareCustomerId;
      }
      await subscriptionRepo.update(
        userId,
        updates as Parameters<typeof subscriptionRepo.update>[1]
      );
    } else {
      await subscriptionRepo.create({
        userId,
        plan: resolvedPlan,
        status: 'active',
        currentPeriodStart: new Date(),
        currentPeriodEnd: periodEnd,
        billingCycle: resolvedCycle,
        squareCustomerId: undefined,
        lastPaymentDate: new Date(),
        lastPaymentAmount: amount,
      });
    }

    // Sync plan to user document so AI rate limiter and other services stay in sync
    try {
      await userRepo.updateSubscription(userId, { plan: resolvedPlan, status: 'active' });
    } catch {
      // Best-effort: subscription collection is authoritative
    }
  }

  /**
   * Handle Square refund.created / refund.updated events. Updates the existing
   * payment row to `refunded` (full) or `partially_refunded` (partial) and records
   * the refunded amount. If the refund target payment cannot be found we 200 the
   * webhook so Square does not retry indefinitely — orphan refunds are logged but
   * non-fatal.
   */
  async function handleRefund(refund: IRefundPayload): Promise<void> {
    const paymentId = refund.paymentId ?? refund.payment_id;
    if (!paymentId) return;

    const amountMoney = refund.amountMoney ?? refund.amount_money;
    const refundAmount = Number(amountMoney?.amount ?? 0);
    if (!Number.isFinite(refundAmount) || refundAmount <= 0) return;

    const existing = await paymentRepo.findBySquarePaymentId(paymentId);
    if (!existing) {
      // Square sometimes delivers refunds for payments we never recorded (e.g.
      // refunds initiated outside our integration). Acknowledge silently rather
      // than retry-loop the provider.
      return;
    }

    const paymentDocId = existing._id?.toString();
    if (!paymentDocId) return;
    await paymentRepo.recordRefund(paymentDocId, refundAmount, 'square-webhook', refund.reason);
  }

  return router;
}
