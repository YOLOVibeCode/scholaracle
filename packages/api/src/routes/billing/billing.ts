import { Router, type Request, type Response } from 'express';
import type { Db } from 'mongodb';
import {
  SubscriptionRepository,
  PaymentRepository,
  CouponRepository,
  PLAN_FEATURES,
  type BillingCycle,
} from '@scholaracle/database';
import {
  AppError,
  AuthenticationError,
  ConflictError,
  ValidationError,
} from '@scholaracle/contracts';
import { asyncHandler } from '../../middleware/asyncHandler';
import type { INoctusoftStoreClient } from '../../services/noctusoft-store/NoctusoftStoreClient';
import type { IAuthenticatedRequest } from '../../middleware/auth';
import type { SubscriptionPlan } from '@scholaracle/database';
import { planFeatureLines, planFeaturesForApi } from '../../services/billing/planFeatureLines';
import { resolveStoreSku } from '../../services/noctusoft-store/planStoreSkus';
import {
  classifyPlanChange,
  countOwnedStudents,
  isSelfServePurchasablePlan,
  planLimitBlocksDowngrade,
} from '../../services/billing/planChange';

export interface IBillingRouterDeps {
  readonly database: Db;
  readonly storeClient: INoctusoftStoreClient;
  /**
   * The web app's origin, used for store return URLs when a request carries no
   * Origin header (native apps, server callers). The store refuses localhost in live mode.
   */
  readonly webBaseUrl?: string;
}

/** Store subscription states in which a second checkout would double-bill the buyer. */
const RUNNING_STATUSES = new Set(['active', 'trialing', 'past_due', 'paused']);

export function billingRouter(deps: IBillingRouterDeps): Router {
  const router = Router();
  const subscriptionRepo = new SubscriptionRepository(deps.database);
  const paymentRepo = new PaymentRepository(deps.database);
  const couponRepo = new CouponRepository(deps.database);

  /**
   * POST /api/billing/checkout
   * Create a Noctusoft store checkout session for subscription purchase.
   */
  router.post(
    '/checkout',
    asyncHandler((req: Request, res: Response) => handleCheckout(req as IAuthenticatedRequest, res))
  );

  /**
   * POST /api/billing/portal
   * With a store subscription: the store's page to update the card.
   * Otherwise the in-app billing page.
   */
  router.post(
    '/portal',
    asyncHandler((req: Request, res: Response) => handlePortal(req as IAuthenticatedRequest, res))
  );

  /**
   * POST /api/billing/cancel
   * Cancel the store subscription at the end of the paid period.
   */
  router.post(
    '/cancel',
    asyncHandler((req: Request, res: Response) => handleCancel(req as IAuthenticatedRequest, res))
  );

  /**
   * POST /api/billing/change-plan
   * Switch an active store subscription to another self-serve plan.
   */
  router.post(
    '/change-plan',
    asyncHandler((req: Request, res: Response) =>
      handleChangePlan(req as IAuthenticatedRequest, res)
    )
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
   * without going through store checkout.
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

    const existing = await subscriptionRepo.findByUserId(userId);
    if (existing?.storeSubscriptionId && RUNNING_STATUSES.has(existing.status)) {
      throw new ConflictError(
        'You already have a subscription. Manage it from the billing page instead of buying again.'
      );
    }

    const origin = webOrigin(req);
    const checkout = await deps.storeClient.createCheckout({
      userId,
      email,
      plan: validPlan,
      billingCycle: validCycle,
      successUrl: successUrl ?? `${origin}/dashboard/billing?checkout=success`,
      cancelUrl: cancelUrl ?? `${origin}/dashboard/billing?checkout=cancelled`,
    });

    res.json({ success: true, sessionId: checkout.sessionId, url: checkout.url });
  }

  async function handlePortal(req: IAuthenticatedRequest, res: Response): Promise<void> {
    const userId = req.userId;

    if (!userId) {
      throw new AuthenticationError('Authentication required');
    }

    const billingUrl = `${webOrigin(req)}/dashboard/billing`;

    // Past-due customers need this page most: it is where they fix the card.
    const subscription = await subscriptionRepo.findByUserId(userId);
    if (
      subscription?.storeSubscriptionId &&
      (subscription.isActive() || subscription.status === 'past_due')
    ) {
      const url = await deps.storeClient.updatePaymentMethod(
        subscription.storeSubscriptionId,
        billingUrl
      );
      res.json({ success: true, hasPortal: true, manageUrl: url, url });
      return;
    }

    res.json({
      success: true,
      hasPortal: false,
      manageUrl: billingUrl,
      url: billingUrl,
      message: 'Manage your subscription from the billing page.',
    });
  }

  async function handleChangePlan(req: IAuthenticatedRequest, res: Response): Promise<void> {
    const userId = req.userId;
    if (!userId) {
      throw new AuthenticationError('Authentication required');
    }

    const { plan, billingCycle, confirmed } = req.body as {
      plan?: string;
      billingCycle?: BillingCycle;
      confirmed?: boolean;
    };

    if (confirmed !== true) {
      throw new AppError('Plan change requires confirmation', {
        status: 400,
        code: 'CONFIRMATION_REQUIRED',
      });
    }

    if (!isSelfServePurchasablePlan(plan)) {
      throw new ValidationError('Invalid plan');
    }

    const validCycle: BillingCycle = billingCycle === 'annual' ? 'annual' : 'monthly';

    const subscription = await subscriptionRepo.findByUserId(userId);
    if (
      !subscription?.storeSubscriptionId ||
      !RUNNING_STATUSES.has(subscription.status) ||
      !subscription.isActive()
    ) {
      throw new ConflictError('There is no paid subscription to change');
    }

    if (subscription.cancelAtPeriodEnd) {
      throw new AppError(
        'Cannot change plan while your subscription is set to cancel at period end',
        { status: 409, code: 'SUBSCRIPTION_CANCELING' }
      );
    }

    const currentPlan = subscription.effectivePlan();
    const currentCycle = subscription.billingCycle ?? 'monthly';
    if (currentPlan === plan && currentCycle === validCycle) {
      throw new ValidationError('You are already on this plan and billing cycle');
    }

    const ownedCount = await countOwnedStudents(deps.database, userId);
    if (planLimitBlocksDowngrade(plan, ownedCount)) {
      const maxStudents = PLAN_FEATURES[plan].maxStudents;
      throw new AppError(
        `Your household has ${ownedCount} student${ownedCount === 1 ? '' : 's'}. Remove students down to ${maxStudents} or fewer before switching to ${plan}.`,
        {
          status: 409,
          code: 'PLAN_LIMIT',
          details: { currentCount: ownedCount, maxStudents, targetPlan: plan },
        }
      );
    }

    const { effective } = classifyPlanChange({
      currentPlan,
      currentCycle,
      targetPlan: plan,
      targetCycle: validCycle,
    });

    const sku = resolveStoreSku(plan, validCycle);
    const storeResult = await deps.storeClient.changePlan(subscription.storeSubscriptionId, {
      plan: sku,
      effective,
    });

    const currentPeriodEnd = storeResult.currentPeriodEnd
      ? new Date(storeResult.currentPeriodEnd)
      : subscription.currentPeriodEnd;

    await subscriptionRepo.update(userId, {
      plan,
      billingCycle: validCycle,
      ...(currentPeriodEnd ? { currentPeriodEnd } : {}),
    });

    res.json({
      success: true,
      subscription: {
        plan,
        status: subscription.status,
        effectivePlan: plan,
        billingCycle: validCycle,
        currentPeriodEnd,
        cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
      },
    });
  }

  async function handleCancel(req: IAuthenticatedRequest, res: Response): Promise<void> {
    const userId = req.userId;

    if (!userId) {
      throw new AuthenticationError('Authentication required');
    }

    const subscription = await subscriptionRepo.findByUserId(userId);
    if (!subscription?.storeSubscriptionId || !subscription.isActive()) {
      throw new ConflictError('There is no paid subscription to cancel');
    }

    const result = await deps.storeClient.cancelSubscription(subscription.storeSubscriptionId);
    const currentPeriodEnd = result.currentPeriodEnd
      ? new Date(result.currentPeriodEnd)
      : subscription.currentPeriodEnd;
    await subscriptionRepo.update(userId, { cancelAtPeriodEnd: true, currentPeriodEnd });

    res.json({
      success: true,
      subscription: {
        plan: subscription.plan,
        status: subscription.status,
        billingCycle: subscription.billingCycle,
        currentPeriodEnd,
        cancelAtPeriodEnd: true,
      },
    });
  }

  async function handleGetSubscription(req: IAuthenticatedRequest, res: Response): Promise<void> {
    const userId = req.userId;

    if (!userId) {
      throw new AuthenticationError('Authentication required');
    }

    const subscription = await subscriptionRepo.findByUserId(userId);
    if (!subscription) {
      const effectivePlan = 'free' as SubscriptionPlan;
      res.json({
        success: true,
        subscription: {
          plan: 'free',
          status: 'active',
          effectivePlan,
          maxStudents: PLAN_FEATURES.free.maxStudents,
          features: planFeaturesForApi(effectivePlan),
          featureLines: [...planFeatureLines(effectivePlan)],
        },
      });
      return;
    }

    const effectivePlan = subscription.effectivePlan();
    res.json({
      success: true,
      subscription: {
        plan: subscription.plan,
        status: subscription.status,
        /** The plan whose limits apply now (free once cancelled, paused or lapsed). */
        effectivePlan,
        /** Student cap of effectivePlan; -1 means unlimited. */
        maxStudents: PLAN_FEATURES[effectivePlan].maxStudents,
        features: planFeaturesForApi(effectivePlan),
        featureLines: [...planFeatureLines(effectivePlan)],
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
    if (existing && existing.effectivePlan() !== 'free') {
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
        trialStart: now,
        trialEnd,
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
      id: p.storePaymentId ?? p._id?.toString(),
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

  /** Origin for store return URLs: the caller's Origin, else the configured web app. */
  function webOrigin(req: IAuthenticatedRequest): string {
    const origin = req.headers.origin;
    if (origin && /^https?:\/\//.test(origin)) return origin.replace(/\/$/, '');
    return (deps.webBaseUrl ?? 'http://localhost:2800').replace(/\/$/, '');
  }

  return router;
}
