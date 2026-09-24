import { Router, type Request, type Response } from 'express';
import type { Db } from 'mongodb';
import {
  SubscriptionRepository,
  PaymentRepository,
  CouponRepository,
  type SubscriptionPlan,
} from '@scholaracle/database';
import {
  AuthenticationError,
  ConflictError,
  NotFoundError,
  ValidationError,
} from '@scholaracle/contracts';
import { asyncHandler } from '../../middleware/asyncHandler';
import { SquareService } from '../../services/SquareService';
import type { RelayBillingClient } from '../../services/billing/RelayBillingClient';
import { syncEntitlementsFromRelay } from '../../services/billing/syncEntitlementsFromRelay';
import { resolveAnnualOrderSku } from '../../services/billing/relayPlanMapping';
import type { IAuthenticatedRequest } from '../../middleware/auth';

export interface IBillingRouterDeps {
  readonly database: Db;
  readonly squareService?: SquareService;
  readonly relayBillingClient?: RelayBillingClient;
}

export function billingRouter(deps: IBillingRouterDeps): Router {
  const router = Router();
  const subscriptionRepo = new SubscriptionRepository(deps.database);
  const paymentRepo = new PaymentRepository(deps.database);
  const couponRepo = new CouponRepository(deps.database);

  router.post(
    '/checkout',
    asyncHandler((req: Request, res: Response) => handleCheckout(req as IAuthenticatedRequest, res))
  );

  router.post(
    '/portal',
    asyncHandler((req: Request, res: Response) => handlePortal(req as IAuthenticatedRequest, res))
  );

  router.post(
    '/sync-entitlements',
    asyncHandler((req: Request, res: Response) =>
      handleSyncEntitlements(req as IAuthenticatedRequest, res)
    )
  );

  router.get(
    '/subscription',
    asyncHandler((req: Request, res: Response) =>
      handleGetSubscription(req as IAuthenticatedRequest, res)
    )
  );

  router.post(
    '/validate-coupon',
    asyncHandler(async (req: Request, res: Response) => {
      const { code } = req.body as { code?: string };
      if (!code) {
        throw new ValidationError('code is required');
      }
      const result = await couponRepo.validateCode(code);
      if (!result.valid || !result.coupon) {
        res.json({ success: true, valid: false, error: result.error });
        return;
      }
      res.json({
        success: true,
        valid: true,
        coupon: {
          code: result.coupon.code,
          type: result.coupon.type,
          value: result.coupon.value,
          plan: result.coupon.plan ?? null,
          duration: result.coupon.duration,
          durationMonths: result.coupon.durationMonths ?? null,
          discountLabel: result.coupon.discountLabel(),
        },
      });
    })
  );

  router.post(
    '/redeem-coupon',
    asyncHandler((req: Request, res: Response) =>
      handleRedeemCoupon(req as IAuthenticatedRequest, res)
    )
  );

  router.get(
    '/invoices',
    asyncHandler((req: Request, res: Response) =>
      handleGetInvoices(req as IAuthenticatedRequest, res)
    )
  );

  async function handleCheckout(req: IAuthenticatedRequest, res: Response): Promise<void> {
    const userId = req.userId;
    const email = req.userEmail;

    if (!userId || !email) {
      throw new AuthenticationError('Authentication required');
    }

    const { plan, billingCycle, successUrl, cancelUrl } = req.body as {
      plan?: SubscriptionPlan;
      billingCycle?: 'monthly' | 'annual';
      successUrl?: string;
      cancelUrl?: string;
    };

    const validPlan: SubscriptionPlan = ['starter', 'premium', 'family', 'enterprise'].includes(
      plan ?? ''
    )
      ? (plan as SubscriptionPlan)
      : 'starter';

    const validCycle: 'monthly' | 'annual' = billingCycle === 'annual' ? 'annual' : 'monthly';

    const origin = req.headers.origin ?? 'http://localhost:2800';
    const redirectUrl = successUrl ?? `${origin}/dashboard/billing?checkout=success`;
    const cancelRedirectUrl = cancelUrl ?? `${origin}/dashboard/billing`;

    if (deps.relayBillingClient) {
      const idempotencyKey = `checkout-${userId}-${validPlan}-${validCycle}`;
      if (validCycle === 'annual') {
        const skus = await deps.relayBillingClient.getSkus();
        const sku = resolveAnnualOrderSku(validPlan, skus);
        const { url, sessionId } = await deps.relayBillingClient.createOrder({
          userId,
          email,
          items: [{ sku, quantity: 1 }],
          redirectUrl,
          idempotencyKey,
        });
        res.json({ success: true, sessionId, url });
        return;
      }

      const { url, sessionId } = await deps.relayBillingClient.createCheckout({
        userId,
        email,
        plan: validPlan,
        redirectUrl,
        idempotencyKey,
      });
      res.json({ success: true, sessionId, url });
      return;
    }

    if (!deps.squareService) {
      throw new ValidationError('Billing is not configured');
    }

    const { url, orderId } = await deps.squareService.createPaymentLink({
      userId,
      email,
      plan: validPlan,
      billingCycle: validCycle,
      successUrl: redirectUrl,
      cancelUrl: cancelRedirectUrl,
    });

    res.json({ success: true, sessionId: orderId, url });
  }

  async function handleSyncEntitlements(req: IAuthenticatedRequest, res: Response): Promise<void> {
    const userId = req.userId;
    if (!userId) {
      throw new AuthenticationError('Authentication required');
    }
    if (!deps.relayBillingClient) {
      throw new ValidationError('Relay billing is not configured');
    }

    const payload = await deps.relayBillingClient.getEntitlements(userId);
    const grants = payload.entitlements ?? payload.grants ?? [];

    const synced = await syncEntitlementsFromRelay(userId, grants, {
      findSubscription: async (uid) => {
        const sub = await subscriptionRepo.findByUserId(uid);
        return sub ? { plan: sub.plan, status: sub.status } : null;
      },
      createSubscription: async (data) => {
        await subscriptionRepo.create(data);
      },
      updateSubscription: async (uid, updates) => {
        await subscriptionRepo.update(uid, updates);
      },
    });

    if (!synced) {
      res.json({ success: true, subscription: { plan: 'free', status: 'active' as const } });
      return;
    }

    res.json({
      success: true,
      subscription: {
        plan: synced.plan,
        status: synced.status,
      },
    });
  }

  async function handlePortal(req: IAuthenticatedRequest, res: Response): Promise<void> {
    const userId = req.userId;
    const email = req.userEmail;

    if (!userId) {
      throw new AuthenticationError('Authentication required');
    }

    const subscription = await subscriptionRepo.findByUserId(userId);
    const customerId = subscription?.stripeCustomerId ?? subscription?.squareCustomerId;
    const origin = req.headers.origin ?? 'http://localhost:2800';
    const redirectUrl = `${origin}/dashboard/billing`;

    if (deps.relayBillingClient && (customerId || email)) {
      const portal = await deps.relayBillingClient.createBillingPortalSession({
        email: email ?? '',
        customerId,
        redirectUrl,
      });
      res.json({
        success: true,
        hasPortal: true,
        url: portal.url,
      });
      return;
    }

    if (!customerId) {
      throw new NotFoundError('No billing account found');
    }

    res.json({
      success: true,
      hasPortal: false,
      manageUrl: redirectUrl,
      url: redirectUrl,
      message: 'Manage your subscription from the billing page.',
    });
  }

  async function handleGetSubscription(req: IAuthenticatedRequest, res: Response): Promise<void> {
    const userId = req.userId;

    if (!userId) {
      throw new AuthenticationError('Authentication required');
    }

    const subscription = await subscriptionRepo.findByUserId(userId);
    if (!subscription) {
      res.json({
        success: true,
        subscription: { plan: 'free', status: 'active' },
      });
      return;
    }

    res.json({
      success: true,
      subscription: {
        plan: subscription.plan,
        status: subscription.status,
        currentPeriodStart: subscription.currentPeriodStart,
        currentPeriodEnd: subscription.currentPeriodEnd,
        billingCycle: subscription.billingCycle,
        cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
        trialEnd: subscription.trialEnd,
      },
    });
  }

  async function handleRedeemCoupon(req: IAuthenticatedRequest, res: Response): Promise<void> {
    const userId = req.userId;
    if (!userId) {
      throw new AuthenticationError('Authentication required');
    }

    const { code, plan } = req.body as { code?: string; plan?: SubscriptionPlan };
    if (!code) {
      throw new ValidationError('code is required');
    }

    const validation = await couponRepo.validateCode(code);
    if (!validation.valid || !validation.coupon) {
      throw new ValidationError(validation.error ?? 'Invalid coupon');
    }

    const coupon = validation.coupon;

    if (coupon.type !== 'trial_extension' && coupon.type !== 'free_plan') {
      throw new ValidationError('This coupon must be applied at checkout, not redeemed directly');
    }

    if (coupon.plan && plan && coupon.plan !== plan) {
      throw new ValidationError(`This coupon is only valid for the ${coupon.plan} plan`);
    }

    const existing = await subscriptionRepo.findByUserId(userId);
    if (existing && existing.isActive()) {
      throw new ConflictError('You already have an active subscription');
    }

    const targetPlan: SubscriptionPlan = coupon.plan ?? plan ?? 'starter';
    const now = new Date();
    const trialEnd = new Date(now);

    if (coupon.type === 'trial_extension') {
      trialEnd.setDate(trialEnd.getDate() + coupon.value);
    } else {
      const months = coupon.value === 0 ? 12 : coupon.value;
      trialEnd.setMonth(trialEnd.getMonth() + months);
    }

    if (existing) {
      await subscriptionRepo.update(userId, {
        plan: targetPlan,
        status: 'trialing',
        currentPeriodStart: now,
        currentPeriodEnd: trialEnd,
        billingCycle: 'monthly',
      } as Parameters<typeof subscriptionRepo.update>[1]);
    } else {
      await subscriptionRepo.create({
        userId,
        plan: targetPlan,
        status: 'trialing',
        currentPeriodStart: now,
        currentPeriodEnd: trialEnd,
        billingCycle: 'monthly',
        trialStart: now,
        trialEnd,
      });
    }

    await couponRepo.recordRedemption(code, userId);

    res.json({
      success: true,
      subscription: {
        plan: targetPlan,
        status: 'trialing',
        trialEnd: trialEnd.toISOString(),
      },
      message: coupon.discountLabel(),
    });
  }

  async function handleGetInvoices(req: IAuthenticatedRequest, res: Response): Promise<void> {
    const userId = req.userId;

    if (!userId) {
      throw new AuthenticationError('Authentication required');
    }

    const limit = parseInt(req.query['limit'] as string) || 10;
    const payments = await paymentRepo.findByUserId(userId);

    const invoices = payments.slice(0, limit).map((p) => ({
      id: p.squarePaymentId ?? p.stripeInvoiceId ?? p._id?.toString(),
      amount: p.amount / 100,
      currency: p.currency,
      status: p.status,
      date: p.createdAt instanceof Date ? p.createdAt.toISOString() : String(p.createdAt),
      pdfUrl: p.receiptUrl,
      hostedUrl: p.receiptUrl,
    }));

    res.json({
      success: true,
      invoices,
    });
  }

  return router;
}
