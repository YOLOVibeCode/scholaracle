import { Router, type Request, type Response } from 'express';
import type { Db } from 'mongodb';
import {
  SubscriptionRepository,
  PaymentRepository,
  UserRepository,
  PLAN_PRICING,
  type SubscriptionPlan,
  type BillingCycle,
} from '@scholaracle/database';
import { SquareService } from '../../../services/SquareService';

export interface ISquareWebhookDeps {
  readonly database: Db;
  readonly squareService: SquareService;
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

  router.post('/', (req: Request, res: Response) => {
    void handleWebhook(req, res);
  });

  async function handleWebhook(req: Request, res: Response): Promise<void> {
    const signature = req.headers['x-square-hmacsha256-signature'] as string | undefined;
    const rawBody = (req as unknown as { body: string | Buffer }).body;
    const body =
      typeof rawBody === 'string'
        ? rawBody
        : Buffer.isBuffer(rawBody)
          ? rawBody.toString('utf8')
          : '';

    if (!signature) {
      res.status(400).json({ error: 'Missing x-square-hmacsha256-signature header' });
      return;
    }

    const isValid = await deps.squareService.verifyWebhookSignature(body, signature);
    if (!isValid) {
      res.status(403).json({ error: 'Invalid webhook signature' });
      return;
    }

    try {
      const event = JSON.parse(body) as {
        type?: string;
        merchant_id?: string;
        data?: {
          type?: string;
          id?: string;
          object?: {
            payment?: IPaymentPayload['payment'];
          };
        };
      };

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
      }

      res.json({ received: true });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Square webhook error:', err);
      res.status(500).json({ error: 'Webhook handler failed' });
    }
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

  return router;
}
