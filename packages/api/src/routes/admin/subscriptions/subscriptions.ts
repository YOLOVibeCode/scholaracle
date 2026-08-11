import { Router, type Request, type Response } from 'express';
import type { Db } from 'mongodb';
import { SubscriptionRepository, AuditLogRepository } from '@scholaracle/database';
import type { SubscriptionPlan } from '@scholaracle/database';
import { AdminAuthService } from '@scholaracle/auth';
import { NotFoundError, ValidationError } from '@scholaracle/contracts';
import {
  adminAuthMiddleware,
  type IAdminAuthenticatedRequest,
} from '../../../middleware/adminAuth';
import { asyncHandler } from '../../../middleware/asyncHandler';

export interface ISubscriptionsRouterConfig {
  readonly database: Db;
  readonly jwtSecret?: string;
}

async function handleGetSubscriptions(
  req: Request,
  res: Response,
  subscriptionRepository: SubscriptionRepository
): Promise<void> {
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
}

async function handleGetSubscription(
  req: Request,
  res: Response,
  subscriptionRepository: SubscriptionRepository
): Promise<void> {
  const { id } = req.params;
  if (!id) {
    throw new ValidationError('Subscription ID is required');
  }

  const subscription = await subscriptionRepository.findById(id);

  if (!subscription) {
    throw new NotFoundError('Subscription not found');
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
}

async function handleChangePlan(
  req: Request,
  res: Response,
  subscriptionRepository: SubscriptionRepository,
  auditLogRepository: AuditLogRepository,
  adminId: string,
  adminEmail: string
): Promise<void> {
  const { id } = req.params;
  if (!id) {
    throw new ValidationError('User ID is required');
  }

  const { plan } = req.body;
  if (!plan) {
    throw new ValidationError('Plan is required');
  }

  const updated = await subscriptionRepository.changePlan(id, plan as SubscriptionPlan, adminId);

  if (!updated) {
    throw new NotFoundError('Subscription not found');
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
}

async function handleCancelSubscription(
  req: Request,
  res: Response,
  subscriptionRepository: SubscriptionRepository,
  auditLogRepository: AuditLogRepository,
  adminId: string,
  adminEmail: string
): Promise<void> {
  const { id } = req.params;
  if (!id) {
    throw new ValidationError('User ID is required');
  }

  const { reason } = req.body;
  const success = await subscriptionRepository.cancel(id, reason);

  if (!success) {
    throw new NotFoundError('Subscription not found');
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
}

async function handleReactivateSubscription(
  req: Request,
  res: Response,
  subscriptionRepository: SubscriptionRepository,
  auditLogRepository: AuditLogRepository,
  adminId: string,
  adminEmail: string
): Promise<void> {
  const { id } = req.params;
  if (!id) {
    throw new ValidationError('User ID is required');
  }

  const success = await subscriptionRepository.reactivate(id);

  if (!success) {
    throw new NotFoundError('Subscription not found');
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
}

async function handleExtendTrial(
  req: Request,
  res: Response,
  subscriptionRepository: SubscriptionRepository,
  auditLogRepository: AuditLogRepository,
  adminId: string,
  adminEmail: string
): Promise<void> {
  const { id } = req.params;
  if (!id) {
    throw new ValidationError('User ID is required');
  }

  const { days, reason } = req.body as { days?: number; reason?: string };
  if (!reason) {
    throw new ValidationError('reason is required');
  }
  const nDays = Number(days);
  if (!Number.isFinite(nDays) || nDays <= 0) {
    throw new ValidationError('days must be a positive number');
  }

  const updated = await subscriptionRepository.extendTrial(id, nDays, adminId, reason);
  if (!updated) {
    throw new NotFoundError('Subscription not found or not trialing');
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
}

export function subscriptionsRouter(config: ISubscriptionsRouterConfig): Router {
  const router = Router();
  const subscriptionRepository = new SubscriptionRepository(config.database);
  const auditLogRepository = new AuditLogRepository(config.database);
  const adminAuthService = new AdminAuthService(config.database, config.jwtSecret);

  // Apply admin auth middleware to all routes
  router.use(adminAuthMiddleware(adminAuthService));

  router.get(
    '/',
    asyncHandler((req: Request, res: Response) =>
      handleGetSubscriptions(req, res, subscriptionRepository)
    )
  );

  router.get(
    '/:id',
    asyncHandler((req: Request, res: Response) =>
      handleGetSubscription(req, res, subscriptionRepository)
    )
  );

  router.put(
    '/:id/plan',
    asyncHandler((req: Request, res: Response) => {
      const authReq = req as IAdminAuthenticatedRequest;
      return handleChangePlan(
        req,
        res,
        subscriptionRepository,
        auditLogRepository,
        authReq.adminId!,
        authReq.adminEmail!
      );
    })
  );

  router.post(
    '/:id/cancel',
    asyncHandler((req: Request, res: Response) => {
      const authReq = req as IAdminAuthenticatedRequest;
      return handleCancelSubscription(
        req,
        res,
        subscriptionRepository,
        auditLogRepository,
        authReq.adminId!,
        authReq.adminEmail!
      );
    })
  );

  router.post(
    '/:id/reactivate',
    asyncHandler((req: Request, res: Response) => {
      const authReq = req as IAdminAuthenticatedRequest;
      return handleReactivateSubscription(
        req,
        res,
        subscriptionRepository,
        auditLogRepository,
        authReq.adminId!,
        authReq.adminEmail!
      );
    })
  );

  router.post(
    '/:id/extend-trial',
    asyncHandler((req: Request, res: Response) => {
      const authReq = req as IAdminAuthenticatedRequest;
      return handleExtendTrial(
        req,
        res,
        subscriptionRepository,
        auditLogRepository,
        authReq.adminId!,
        authReq.adminEmail!
      );
    })
  );

  return router;
}
