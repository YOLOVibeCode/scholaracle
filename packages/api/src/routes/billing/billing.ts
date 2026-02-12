import { Router, type Request, type Response } from 'express';
import type { Db } from 'mongodb';
import { SubscriptionRepository, PaymentRepository } from '@scholaracle/database';
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

  /**
   * POST /api/billing/checkout
   * Create a Square payment link for subscription purchase.
   */
  router.post('/checkout', (req: Request, res: Response) => {
    void handleCheckout(req as IAuthenticatedRequest, res);
  });

  /**
   * POST /api/billing/portal
   * Square does not have a customer portal. Returns settings URL for managing account.
   */
  router.post('/portal', (req: Request, res: Response) => {
    void handlePortal(req as IAuthenticatedRequest, res);
  });

  /**
   * GET /api/billing/subscription
   * Get current user's subscription details.
   */
  router.get('/subscription', (req: Request, res: Response) => {
    void handleGetSubscription(req as IAuthenticatedRequest, res);
  });

  /**
   * GET /api/billing/invoices
   * Get current user's payment/invoice history (from our DB).
   */
  router.get('/invoices', (req: Request, res: Response) => {
    void handleGetInvoices(req as IAuthenticatedRequest, res);
  });

  async function handleCheckout(req: IAuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.userId;
      const email = req.userEmail;

      if (!userId || !email) {
        res.status(401).json({ success: false, error: 'Authentication required' });
        return;
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
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create checkout session',
      });
    }
  }

  async function handlePortal(req: IAuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.userId;

      if (!userId) {
        res.status(401).json({ success: false, error: 'Authentication required' });
        return;
      }

      const subscription = await subscriptionRepo.findByUserId(userId);
      const customerId = subscription?.squareCustomerId ?? subscription?.stripeCustomerId;
      if (!customerId) {
        res.status(404).json({ success: false, error: 'No billing account found' });
        return;
      }

      const origin = req.headers.origin ?? 'http://localhost:2800';
      const returnUrl = (req.body as { returnUrl?: string }).returnUrl ?? `${origin}/settings`;

      res.json({
        success: true,
        url: returnUrl,
        message:
          'Square does not provide a customer billing portal. Manage your subscription in Settings.',
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create portal session',
      });
    }
  }

  async function handleGetSubscription(req: IAuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.userId;

      if (!userId) {
        res.status(401).json({ success: false, error: 'Authentication required' });
        return;
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
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get subscription',
      });
    }
  }

  async function handleGetInvoices(req: IAuthenticatedRequest, res: Response): Promise<void> {
    try {
      const userId = req.userId;

      if (!userId) {
        res.status(401).json({ success: false, error: 'Authentication required' });
        return;
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
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get invoices',
      });
    }
  }

  return router;
}
