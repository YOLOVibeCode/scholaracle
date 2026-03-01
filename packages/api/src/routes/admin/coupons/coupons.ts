import { Router, type Request, type Response } from 'express';
import type { Db } from 'mongodb';
import { CouponRepository, AuditLogRepository } from '@scholaracle/database';
import type { CouponType, CouponDuration, ICouponData } from '@scholaracle/database';
import type { SubscriptionPlan } from '@scholaracle/database';
import { AdminAuthService } from '@scholaracle/auth';
import {
  adminAuthMiddleware,
  type IAdminAuthenticatedRequest,
} from '../../../middleware/adminAuth';

export interface ICouponsRouterConfig {
  readonly database: Db;
  readonly jwtSecret?: string;
}

export function couponsRouter(config: ICouponsRouterConfig): Router {
  const router = Router();
  const couponRepository = new CouponRepository(config.database);
  const auditLogRepository = new AuditLogRepository(config.database);
  const adminAuthService = new AdminAuthService(config.database, config.jwtSecret);

  router.use(adminAuthMiddleware(adminAuthService));

  router.get('/', async (_req: Request, res: Response) => {
    try {
      const status = _req.query['status'] as string | undefined;
      const filter: Record<string, unknown> = {};
      if (status === 'active') filter['isActive'] = true;
      if (status === 'inactive') filter['isActive'] = false;

      const coupons = await couponRepository.findAll(filter);
      res.json({ success: true, data: coupons.map((c) => c.toJSON()) });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      });
    }
  });

  router.get('/:id', async (req: Request, res: Response) => {
    try {
      const coupon = await couponRepository.findById(req.params['id']!);
      if (!coupon) {
        res.status(404).json({ success: false, error: 'Coupon not found' });
        return;
      }
      res.json({
        success: true,
        data: {
          ...coupon.toJSON(),
          redemptions: coupon.redemptions,
        },
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      });
    }
  });

  router.post('/', async (req: Request, res: Response) => {
    try {
      const adminReq = req as IAdminAuthenticatedRequest;
      const {
        code,
        type,
        value,
        plan,
        duration,
        durationMonths,
        maxRedemptions,
        expiresAt,
        description,
      } = req.body as {
        code: string;
        type: CouponType;
        value: number;
        plan?: SubscriptionPlan;
        duration: CouponDuration;
        durationMonths?: number;
        maxRedemptions?: number;
        expiresAt?: string;
        description?: string;
      };

      if (!code || !type || value == null || !duration) {
        res
          .status(400)
          .json({ success: false, error: 'code, type, value, and duration are required' });
        return;
      }

      const existing = await couponRepository.findByCode(code);
      if (existing) {
        res.status(409).json({ success: false, error: 'Coupon code already exists' });
        return;
      }

      const couponData: ICouponData = {
        code: code.toUpperCase().trim(),
        type,
        value,
        plan: plan ?? undefined,
        duration,
        durationMonths: duration === 'repeating' ? durationMonths : undefined,
        maxRedemptions: maxRedemptions ?? undefined,
        redemptionCount: 0,
        redemptions: [],
        expiresAt: expiresAt ? new Date(expiresAt) : undefined,
        isActive: true,
        description,
        createdBy: adminReq.adminId,
      };

      const coupon = await couponRepository.create(couponData);

      await auditLogRepository.create({
        action: 'coupon:create',
        adminUserId: adminReq.adminId ?? 'system',
        adminEmail: adminReq.adminEmail ?? 'system',
        entityType: 'coupon',
        entityId: coupon.id,
        metadata: { code: coupon.code, type, value, duration },
        ipAddress: req.ip ?? '',
        userAgent: req.headers['user-agent'] ?? '',
      });

      res.status(201).json({ success: true, data: coupon.toJSON() });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      });
    }
  });

  router.put('/:id', async (req: Request, res: Response) => {
    try {
      const adminReq = req as IAdminAuthenticatedRequest;
      const { description, maxRedemptions, expiresAt, plan } = req.body as {
        description?: string;
        maxRedemptions?: number;
        expiresAt?: string | null;
        plan?: SubscriptionPlan | null;
      };

      const updates: Record<string, unknown> = {};
      if (description !== undefined) updates['description'] = description;
      if (maxRedemptions !== undefined) updates['maxRedemptions'] = maxRedemptions;
      if (expiresAt !== undefined)
        updates['expiresAt'] = expiresAt ? new Date(expiresAt) : undefined;
      if (plan !== undefined) updates['plan'] = plan ?? undefined;

      const coupon = await couponRepository.update(req.params['id']!, updates);
      if (!coupon) {
        res.status(404).json({ success: false, error: 'Coupon not found' });
        return;
      }

      await auditLogRepository.create({
        action: 'coupon:update',
        adminUserId: adminReq.adminId ?? 'system',
        adminEmail: adminReq.adminEmail ?? 'system',
        entityType: 'coupon',
        entityId: coupon.id,
        metadata: updates,
        ipAddress: req.ip ?? '',
        userAgent: req.headers['user-agent'] ?? '',
      });

      res.json({ success: true, data: coupon.toJSON() });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      });
    }
  });

  router.post('/:id/toggle', async (req: Request, res: Response) => {
    try {
      const adminReq = req as IAdminAuthenticatedRequest;
      const coupon = await couponRepository.findById(req.params['id']!);
      if (!coupon) {
        res.status(404).json({ success: false, error: 'Coupon not found' });
        return;
      }

      const newState = !coupon.isActive;
      await couponRepository.setActive(req.params['id']!, newState);

      await auditLogRepository.create({
        action: newState ? 'coupon:enable' : 'coupon:disable',
        adminUserId: adminReq.adminId ?? 'system',
        adminEmail: adminReq.adminEmail ?? 'system',
        entityType: 'coupon',
        entityId: coupon.id,
        metadata: { code: coupon.code },
        ipAddress: req.ip ?? '',
        userAgent: req.headers['user-agent'] ?? '',
      });

      res.json({ success: true, isActive: newState });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      });
    }
  });

  return router;
}
