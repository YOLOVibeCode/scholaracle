import { Router, type Request, type Response } from 'express';
import type { Db } from 'mongodb';
import { AdminAuthService } from '@scholaracle/auth';
import {
  adminAuthMiddleware,
  type IAdminAuthenticatedRequest,
} from '../../../middleware/adminAuth';
import { AdminUserRepository, AuditLogRepository, type AdminRole } from '@scholaracle/database';
import { requireAdminStepUp } from '../../../middleware/adminStepUp';
import { asyncHandler } from '../../../middleware/asyncHandler';

export interface IAdminUsersRouterConfig {
  readonly database: Db;
  readonly jwtSecret?: string;
}

export function adminUsersRouter(config: IAdminUsersRouterConfig): Router {
  const router = Router();
  const adminAuthService = new AdminAuthService(config.database, config.jwtSecret);
  const adminUserRepository = new AdminUserRepository(config.database);
  const auditLogRepository = new AuditLogRepository(config.database);

  router.use(adminAuthMiddleware(adminAuthService));

  // GET /api/admin/users
  router.get(
    '/',
    asyncHandler(async (_req: Request, res: Response) => {
      try {
        const admins = await adminUserRepository.findAll();
        res.status(200).json({
          success: true,
          data: admins.map((a) => ({
            id: a._id?.toString(),
            email: a.email,
            name: a.name,
            role: a.role,
            isActive: a.isActive,
            mfaEnabled: a.mfaEnabled,
            createdAt: a.createdAt.toISOString(),
            updatedAt: a.updatedAt.toISOString(),
          })),
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Internal server error',
        });
      }
    })
  );

  // POST /api/admin/users
  router.post(
    '/',
    requireAdminStepUp({ database: config.database, jwtSecret: config.jwtSecret }),
    asyncHandler(async (req: Request, res: Response) => {
      try {
        const authReq = req as IAdminAuthenticatedRequest;

        const { email, name, role, password } = req.body as {
          email?: string;
          name?: string;
          role?: string;
          password?: string;
        };
        if (!email || !name || !role || !password) {
          res
            .status(400)
            .json({ success: false, error: 'email, name, role, password are required' });
          return;
        }

        const existing = await adminUserRepository.findByEmail(email);
        if (existing) {
          res.status(409).json({ success: false, error: 'Admin user already exists' });
          return;
        }

        const passwordHash = await AdminUserRepository.hashPassword(password);
        const created = await adminUserRepository.create({
          email,
          name,
          role: role as AdminRole,
          passwordHash,
        });

        await auditLogRepository.create({
          adminUserId: authReq.adminId!,
          adminEmail: authReq.adminEmail!,
          action: 'admin:create',
          entityType: 'admin_user',
          entityId: created._id?.toString(),
          reason: 'Created admin user',
          metadata: { email, role },
          ipAddress: req.ip ?? 'unknown',
          userAgent: req.headers['user-agent'] ?? 'unknown',
        });

        res.status(200).json({ success: true, data: { id: created._id?.toString() } });
      } catch (error) {
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Internal server error',
        });
      }
    })
  );

  // PUT /api/admin/users/:id
  router.put(
    '/:id',
    requireAdminStepUp({ database: config.database, jwtSecret: config.jwtSecret }),
    asyncHandler(async (req: Request, res: Response) => {
      try {
        const authReq = req as IAdminAuthenticatedRequest;

        const { id } = req.params;
        if (!id) {
          res.status(400).json({ success: false, error: 'id is required' });
          return;
        }

        const updates = req.body as { name?: string; role?: string; isActive?: boolean };
        const updated = await adminUserRepository.update(id, {
          ...(updates.name ? { name: updates.name } : {}),
          ...(updates.role ? { role: updates.role as AdminRole } : {}),
          ...(updates.isActive !== undefined ? { isActive: updates.isActive } : {}),
        });
        if (!updated) {
          res.status(404).json({ success: false, error: 'Admin user not found' });
          return;
        }

        await auditLogRepository.create({
          adminUserId: authReq.adminId!,
          adminEmail: authReq.adminEmail!,
          action: 'admin:edit',
          entityType: 'admin_user',
          entityId: id,
          reason: 'Updated admin user',
          metadata: updates as Record<string, unknown>,
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
    })
  );

  return router;
}
