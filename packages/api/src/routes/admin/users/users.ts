import { Router, type Request, type Response } from 'express';
import type { Db } from 'mongodb';
import { AdminAuthService } from '@scholaracle/auth';
import {
  adminAuthMiddleware,
  type IAdminAuthenticatedRequest,
} from '../../../middleware/adminAuth';
import { AdminUserRepository, AuditLogRepository, type AdminRole } from '@scholaracle/database';
import { ConflictError, NotFoundError, ValidationError } from '@scholaracle/contracts';
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
    })
  );

  // POST /api/admin/users
  router.post(
    '/',
    requireAdminStepUp({ database: config.database, jwtSecret: config.jwtSecret }),
    asyncHandler(async (req: Request, res: Response) => {
      const authReq = req as IAdminAuthenticatedRequest;

      const { email, name, role, password } = req.body as {
        email?: string;
        name?: string;
        role?: string;
        password?: string;
      };
      if (!email || !name || !role || !password) {
        throw new ValidationError('email, name, role, password are required');
      }

      const existing = await adminUserRepository.findByEmail(email);
      if (existing) {
        throw new ConflictError('Admin user already exists');
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
    })
  );

  // PUT /api/admin/users/:id
  router.put(
    '/:id',
    requireAdminStepUp({ database: config.database, jwtSecret: config.jwtSecret }),
    asyncHandler(async (req: Request, res: Response) => {
      const authReq = req as IAdminAuthenticatedRequest;

      const { id } = req.params;
      if (!id) {
        throw new ValidationError('id is required');
      }

      const updates = req.body as { name?: string; role?: string; isActive?: boolean };
      const updated = await adminUserRepository.update(id, {
        ...(updates.name ? { name: updates.name } : {}),
        ...(updates.role ? { role: updates.role as AdminRole } : {}),
        ...(updates.isActive !== undefined ? { isActive: updates.isActive } : {}),
      });
      if (!updated) {
        throw new NotFoundError('Admin user not found');
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
    })
  );

  return router;
}
