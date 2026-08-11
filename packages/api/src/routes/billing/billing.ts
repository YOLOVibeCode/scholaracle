import { Router, type Request, type Response } from 'express';
import type { Db } from 'mongodb';
import { SubscriptionRepository, PaymentRepository, CouponRepository } from '@scholaracle/database';
import {
  AuthenticationError,
  ConflictError,
  NotFoundError,
  ValidationError,
} from '@scholaracle/contracts';
import { asyncHandler } from '../../middleware/asyncHandler';
import { SquareService } from '../../services/SquareService';
import type { IAuthenticatedRequest } from '../../middleware/auth';
import type { SubscriptionPlan } from '@scholaracle/database';

export interface IBillingRouterDeps {
  readonly database: Db;
  readonly squareService: SquareService;
}

export function billingRouter(deps: IBillingRouterDeps): Router {
  const router = Router();
  const subscriptionRepo = new SubscriptionRepository(deps.database);
  const paymentRepo = new PaymentRepository(deps.database);
  const couponRepo = new CouponRepository(deps.database);

  /**
   * POST /api/billing/checkout
   * Create a Square payment link for subscription purchase.
   */
  router.post(
    '/checkout',
    asyncHandler((req: Request, res: Response) => handleCheckout(req as IAuthenticatedRequest, res))
  );

  /**
   * POST /api/billing/portal
   * Square does not have a customer portal. Returns settings URL for managing account.
   */
  router.post(
    '/portal',
    asyncHandler((req: Request, res: Response) => handlePortal(req as IAuthenticatedRequest, res))
  );

  /**
   * GET /api/billing/subscription
   * Get current user's subscription details.
   */
  router.get(
    '/subscription',
    asyncHandler((req: Request, res: Response) =>
      handleGetSubscription(req as IAuthenticatedRequest, res)
    )
  );

  /**
   * POST /api/billing/validate-coupon
   * Validate a coupon code and return discount details.
   */
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

  /**
   * POST /api/billing/redeem-coupon
   * Redeem a free-time coupon (trial_extension or free_plan) to start a trial subscription
   * without going through Square checkout.
   */
  router.post(
    '/redeem-coupon',
    asyncHandler((req: Request, res: Response) =>
      handleRedeemCoupon(req as IAuthenticatedRequest, res)
    )
  );

  /**
   * GET /api/billing/invoices
   * Get current user's payment/invoice history (from our DB).
   */
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
    const { url, orderId } = await deps.squareService.createPaymentLink({
      userId,
      email,
      plan: validPlan,
      billingCycle: validCycle,
      successUrl: successUrl ?? `${origin}/billing/success`,
      cancelUrl: cancelUrl ?? `${origin}/billing/cancel`,
    });

    res.json({ success: true, sessionId: orderId, url });
  }

  async function handlePortal(req: IAuthenticatedRequest, res: Response): Promise<void> {
    const userId = req.userId;

    if (!userId) {
      throw new AuthenticationError('Authentication required');
    }

    const subscription = await subscriptionRepo.findByUserId(userId);
    const customerId = subscription?.squareCustomerId ?? subscription?.stripeCustomerId;
    if (!customerId) {
      throw new NotFoundError('No billing account found');
    }

    const origin = req.headers.origin ?? 'http://localhost:2800';

    res.json({
      success: true,
      hasPortal: false,
      manageUrl: `${origin}/dashboard/billing`,
      url: `${origin}/dashboard/billing`,
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
