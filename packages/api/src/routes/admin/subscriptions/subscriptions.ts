import { Router, type Request, type Response } from 'express';
import type { Db } from 'mongodb';
import { SubscriptionRepository, AuditLogRepository } from '@scholaracle/database';
import type { SubscriptionPlan } from '@scholaracle/database';
import { AdminAuthService } from '@scholaracle/auth';
import { adminAuthMiddleware, type IAdminAuthenticatedRequest } from '../../../middleware/adminAuth';

export interface ISubscriptionsRouterConfig {
  readonly database: Db;
  readonly jwtSecret?: string;
}

async function handleGetSubscriptions(
  req: Request,
  res: Response,
  subscriptionRepository: SubscriptionRepository
): Promise<void> {
  try {
    const status = req.query['status'] as string | undefined;
    const plan = req.query['plan'] as string | undefined;
    const userId = req.query['userId'] as string | undefined;

    const filter: Record<string, unknown> = {};
    
    if (status) {
      filter['status'] = status;
    }
    if (plan) {
      filter['plan'] = plan;
    }
    if (userId) {
      filter['userId'] = userId;
    }

    const subscriptions = await subscriptionRepository.findAll(filter);

    res.status(200).json({
      success: true,
      data: subscriptions.map((sub) => ({
        id: sub._id?.toString(),
        userId: sub.userId,
        plan: sub.plan,
        status: sub.status,
        billingCycle: sub.billingCycle,
        currentPeriodStart: sub.currentPeriodStart.toISOString(),
        currentPeriodEnd: sub.currentPeriodEnd.toISOString(),
        cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
        canceledAt: sub.cancelledAt?.toISOString(),
        createdAt: sub.createdAt.toISOString(),
        updatedAt: sub.updatedAt.toISOString(),
      })),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
    });
  }
}

async function handleGetSubscription(
  req: Request,
  res: Response,
  subscriptionRepository: SubscriptionRepository
): Promise<void> {
  try {
    const { id } = req.params;
    if (!id) {
      res.status(400).json({ success: false, error: 'Subscription ID is required' });
      return;
    }

    const subscription = await subscriptionRepository.findById(id);

    if (!subscription) {
      res.status(404).json({
        success: false,
        error: 'Subscription not found',
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: {
        id: subscription._id?.toString(),
        userId: subscription.userId,
        plan: subscription.plan,
        status: subscription.status,
        billingCycle: subscription.billingCycle,
        currentPeriodStart: subscription.currentPeriodStart.toISOString(),
        currentPeriodEnd: subscription.currentPeriodEnd.toISOString(),
        events: subscription.events,
        createdAt: subscription.createdAt.toISOString(),
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
    });
  }
}

async function handleChangePlan(
  req: Request,
  res: Response,
  subscriptionRepository: SubscriptionRepository,
  auditLogRepository: AuditLogRepository,
  adminId: string,
  adminEmail: string
): Promise<void> {
  try {
    const { id } = req.params;
    if (!id) {
      res.status(400).json({ success: false, error: 'User ID is required' });
      return;
    }

    const { plan } = req.body;
    if (!plan) {
      res.status(400).json({
        success: false,
        error: 'Plan is required',
      });
      return;
    }

    const updated = await subscriptionRepository.changePlan(id, plan as SubscriptionPlan, adminId);

    if (!updated) {
      res.status(404).json({
        success: false,
        error: 'Subscription not found',
      });
      return;
    }

    // Create audit log
    await auditLogRepository.create({
      adminUserId: adminId,
      adminEmail,
      action: 'subscription:upgrade',
      entityType: 'subscription',
      entityId: id,
      changes: [{ field: 'plan', oldValue: '', newValue: plan }],
      ipAddress: req.ip ?? 'unknown',
      userAgent: req.headers['user-agent'] ?? 'unknown',
    });

    res.status(200).json({
      success: true,
      data: {
        id: updated._id?.toString(),
        plan: updated.plan,
        status: updated.status,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
    });
  }
}

async function handleCancelSubscription(
  req: Request,
  res: Response,
  subscriptionRepository: SubscriptionRepository,
  auditLogRepository: AuditLogRepository,
  adminId: string,
  adminEmail: string
): Promise<void> {
  try {
    const { id } = req.params;
    if (!id) {
      res.status(400).json({ success: false, error: 'User ID is required' });
      return;
    }

    const { reason } = req.body;
    const success = await subscriptionRepository.cancel(id, reason);

    if (!success) {
      res.status(404).json({
        success: false,
        error: 'Subscription not found',
      });
      return;
    }

    // Create audit log
    await auditLogRepository.create({
      adminUserId: adminId,
      adminEmail,
      action: 'subscription:cancel',
      entityType: 'subscription',
      entityId: id,
      reason,
      ipAddress: req.ip ?? 'unknown',
      userAgent: req.headers['user-agent'] ?? 'unknown',
    });

    res.status(200).json({
      success: true,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
    });
  }
}

async function handleReactivateSubscription(
  req: Request,
  res: Response,
  subscriptionRepository: SubscriptionRepository,
  auditLogRepository: AuditLogRepository,
  adminId: string,
  adminEmail: string
): Promise<void> {
  try {
    const { id } = req.params;
    if (!id) {
      res.status(400).json({ success: false, error: 'User ID is required' });
      return;
    }

    const success = await subscriptionRepository.reactivate(id);

    if (!success) {
      res.status(404).json({
        success: false,
        error: 'Subscription not found',
      });
      return;
    }

    // Create audit log
    await auditLogRepository.create({
      adminUserId: adminId,
      adminEmail,
      action: 'subscription:reactivate',
      entityType: 'subscription',
      entityId: id,
      ipAddress: req.ip ?? 'unknown',
      userAgent: req.headers['user-agent'] ?? 'unknown',
    });

    res.status(200).json({
      success: true,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
    });
  }
}

async function handleExtendTrial(
  req: Request,
  res: Response,
  subscriptionRepository: SubscriptionRepository,
  auditLogRepository: AuditLogRepository,
  adminId: string,
  adminEmail: string
): Promise<void> {
  try {
    const { id } = req.params;
    if (!id) {
      res.status(400).json({ success: false, error: 'User ID is required' });
      return;
    }

    const { days, reason } = req.body as { days?: number; reason?: string };
    if (!reason) {
      res.status(400).json({ success: false, error: 'reason is required' });
      return;
    }
    const nDays = Number(days);
    if (!Number.isFinite(nDays) || nDays <= 0) {
      res.status(400).json({ success: false, error: 'days must be a positive number' });
      return;
    }

    const updated = await subscriptionRepository.extendTrial(id, nDays, adminId, reason);
    if (!updated) {
      res.status(404).json({ success: false, error: 'Subscription not found or not trialing' });
      return;
    }

    await auditLogRepository.create({
      adminUserId: adminId,
      adminEmail,
      action: 'subscription:extend_trial',
      entityType: 'subscription',
      entityId: updated._id?.toString() ?? id,
      reason,
      metadata: { days: nDays },
      ipAddress: req.ip ?? 'unknown',
      userAgent: req.headers['user-agent'] ?? 'unknown',
    });

    res.status(200).json({ success: true });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
    });
  }
}

export function subscriptionsRouter(config: ISubscriptionsRouterConfig): Router {
  const router = Router();
  const subscriptionRepository = new SubscriptionRepository(config.database);
  const auditLogRepository = new AuditLogRepository(config.database);
  const adminAuthService = new AdminAuthService(config.database, config.jwtSecret);

  // Apply admin auth middleware to all routes
  router.use(adminAuthMiddleware(adminAuthService));

  router.get('/', (req: Request, res: Response) => {
    void handleGetSubscriptions(req, res, subscriptionRepository);
  });

  router.get('/:id', (req: Request, res: Response) => {
    void handleGetSubscription(req, res, subscriptionRepository);
  });

  router.put('/:id/plan', (req: Request, res: Response) => {
    const authReq = req as IAdminAuthenticatedRequest;
    void handleChangePlan(
      req,
      res,
      subscriptionRepository,
      auditLogRepository,
      authReq.adminId!,
      authReq.adminEmail!
    );
  });

  router.post('/:id/cancel', (req: Request, res: Response) => {
    const authReq = req as IAdminAuthenticatedRequest;
    void handleCancelSubscription(
      req,
      res,
      subscriptionRepository,
      auditLogRepository,
      authReq.adminId!,
      authReq.adminEmail!
    );
  });

  router.post('/:id/reactivate', (req: Request, res: Response) => {
    const authReq = req as IAdminAuthenticatedRequest;
    void handleReactivateSubscription(
      req,
      res,
      subscriptionRepository,
      auditLogRepository,
      authReq.adminId!,
      authReq.adminEmail!
    );
  });

  router.post('/:id/extend-trial', (req: Request, res: Response) => {
    const authReq = req as IAdminAuthenticatedRequest;
    void handleExtendTrial(
      req,
      res,
      subscriptionRepository,
      auditLogRepository,
      authReq.adminId!,
      authReq.adminEmail!
    );
  });

  return router;
}

