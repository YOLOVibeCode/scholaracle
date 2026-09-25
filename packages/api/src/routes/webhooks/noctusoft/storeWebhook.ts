import { Router, type Request, type Response } from 'express';
import type { Db } from 'mongodb';
import {
  SubscriptionRepository,
  PaymentRepository,
  UserRepository,
  WebhookEventRepository,
  type IWebhookEventWriter,
} from '@scholaracle/database';
import type { IStoreEventV1 } from '../../../store-client/types';
import { asyncHandler } from '../../../middleware/asyncHandler';
import type { StoreBillingService } from '../../../services/StoreBillingService';
import {
  extractPlanFromNote,
  parsePlanFromMetadata,
  resolvePlanFromAmount,
  resolveUserId,
} from '../billingWebhookHelpers';

export interface IStoreWebhookDeps {
  readonly database: Db;
  readonly storeBillingService: StoreBillingService;
  readonly webhookEventWriter?: IWebhookEventWriter;
}

const WEBHOOK_PROVIDER = 'noctusoft-store';

interface IPaymentPayload {
  readonly id?: string;
  readonly orderId?: string;
  readonly amountCents?: number;
  readonly currency?: string;
  readonly status?: string;
  readonly note?: string;
  readonly metadata?: Readonly<Record<string, string>>;
}

interface IRefundPayload {
  readonly id?: string;
  readonly paymentId?: string;
  readonly payment_id?: string;
  readonly amountCents?: number;
  readonly reason?: string;
}

export function storeWebhookRouter(deps: IStoreWebhookDeps): Router {
  const router = Router();
  const subscriptionRepo = new SubscriptionRepository(deps.database);
  const paymentRepo = new PaymentRepository(deps.database);
  const userRepo = new UserRepository(deps.database);
  const defaultWebhookRepo = new WebhookEventRepository(deps.database);
  void defaultWebhookRepo.ensureIndexes().catch(() => {
    /* index build is best-effort at startup */
  });
  const webhookEventWriter: IWebhookEventWriter = deps.webhookEventWriter ?? defaultWebhookRepo;

  router.post(
    '/',
    asyncHandler((req: Request, res: Response) => handleWebhook(req, res))
  );

  async function handleWebhook(req: Request, res: Response): Promise<void> {
    const signature =
      (req.headers['x-noctusoft-signature'] as string | undefined) ??
      (req.headers['x-relay-signature'] as string | undefined);
    const rawBody = (req as unknown as { body: string | Buffer }).body;
    const body =
      typeof rawBody === 'string'
        ? rawBody
        : Buffer.isBuffer(rawBody)
          ? rawBody.toString('utf8')
          : '';

    if (!signature) {
      res.status(400).json({ error: 'Missing x-noctusoft-signature or x-relay-signature header' });
      return;
    }

    const isValid = deps.storeBillingService.verifyWebhookSignature(body, signature);
    if (!isValid) {
      res.status(403).json({ error: 'Invalid webhook signature' });
      return;
    }

    const event = JSON.parse(body) as IStoreEventV1 & {
      event_id?: string;
      type?: string;
      data?: {
        payment?: IPaymentPayload;
        refund?: IRefundPayload;
        object?: { payment?: IPaymentPayload; refund?: IRefundPayload };
      };
    };

    const eventId = event.id ?? event.event_id;
    if (eventId) {
      const isNew = await webhookEventWriter.recordIfNew(WEBHOOK_PROVIDER, eventId);
      if (!isNew) {
        res.json({ received: true, deduped: true });
        return;
      }
    }

    const eventType = event.type ?? '';
    if (
      eventType === 'payment.completed' ||
      eventType === 'payment.created' ||
      eventType === 'payment.updated'
    ) {
      const paymentData = event.data?.payment ?? event.data?.object?.payment;
      if (paymentData?.id && isCompletedStatus(paymentData.status)) {
        await handlePaymentCompleted(paymentData);
      }
    } else if (eventType === 'refund.created' || eventType === 'refund.updated') {
      const refundData = event.data?.refund ?? event.data?.object?.refund;
      if (refundData) {
        await handleRefund(refundData);
      }
    }

    res.json({ received: true });
  }

  async function handlePaymentCompleted(payment: IPaymentPayload): Promise<void> {
    const paymentId = payment.id;
    if (!paymentId) return;

    const existing = await paymentRepo.findBySquarePaymentId(paymentId);
    if (existing) return;

    const userId = resolveUserId(payment.metadata, payment.note);
    const amount = Number(payment.amountCents ?? 0);
    const currency = (payment.currency ?? 'USD').toLowerCase();

    const metaResolved = parsePlanFromMetadata(payment.metadata);
    const noteResolved = extractPlanFromNote(payment.note);
    const amountResolved = resolvePlanFromAmount(amount);
    const resolvedPlan = metaResolved?.plan ?? noteResolved?.plan ?? amountResolved.plan;
    const resolvedCycle = metaResolved?.cycle ?? noteResolved?.cycle ?? amountResolved.cycle;

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
      status: 'succeeded',
      paymentMethod: 'card',
      squarePaymentId: paymentId,
      squareOrderId: payment.orderId ?? undefined,
      description: `Store payment ${paymentId} — ${resolvedPlan} (${resolvedCycle})`,
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
        lastPaymentDate: new Date(),
        lastPaymentAmount: amount,
      });
    }

    try {
      await userRepo.updateSubscription(userId, { plan: resolvedPlan, status: 'active' });
    } catch {
      /* subscription collection is authoritative */
    }
  }

  async function handleRefund(refund: IRefundPayload): Promise<void> {
    const paymentId = refund.paymentId ?? refund.payment_id;
    if (!paymentId) return;

    const refundAmount = Number(refund.amountCents ?? 0);
    if (!Number.isFinite(refundAmount) || refundAmount <= 0) return;

    const existing = await paymentRepo.findBySquarePaymentId(paymentId);
    if (!existing) return;

    const paymentDocId = existing._id?.toString();
    if (!paymentDocId) return;
    await paymentRepo.recordRefund(
      paymentDocId,
      refundAmount,
      'noctusoft-store-webhook',
      refund.reason
    );
  }

  return router;
}

function isCompletedStatus(status: string | undefined): boolean {
  if (!status) return true;
  const normalized = status.toLowerCase();
  return normalized === 'completed' || normalized === 'succeeded' || normalized === 'paid';
}
