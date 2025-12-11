import { Router, type Request, type Response } from 'express';
import type { Db } from 'mongodb';
import { UserRepository, AuditLogRepository } from '@scholaracle/database';
import { AdminAuthService } from '@scholaracle/auth';
import { adminAuthMiddleware, type IAdminAuthenticatedRequest } from '../../../middleware/adminAuth';

export interface ICustomersRouterConfig {
  readonly database: Db;
  readonly jwtSecret?: string;
}

async function handleGetCustomers(
  req: Request,
  res: Response,
  userRepository: UserRepository
): Promise<void> {
  try {
    const page = parseInt((req.query['page'] as string) || '1') || 1;
    const limit = parseInt((req.query['limit'] as string) || '25') || 25;
    const search = req.query['search'] as string | undefined;
    const plan = req.query['plan'] as string | undefined;
    const status = req.query['status'] as string | undefined;

    let filters: Record<string, unknown> = {};

    if (plan) {
      filters['subscription.plan'] = plan;
    }

    if (status === 'suspended') {
      filters['isSuspended'] = true;
    } else if (status === 'active') {
      filters['isSuspended'] = { $ne: true };
    }

    let customers;
    if (search) {
      customers = await userRepository.searchUsers(search);
      res.status(200).json({
        success: true,
        data: customers.map((c: { _id?: { toString: () => string }; email: string; name: string; subscription: unknown; isSuspended: boolean; createdAt: Date }) => ({
          id: c._id?.toString(),
          email: c.email,
          name: c.name,
          subscription: c.subscription,
          isSuspended: c.isSuspended,
          createdAt: c.createdAt.toISOString(),
        })),
        total: customers.length,
        page: 1,
        limit: customers.length,
      });
    } else {
      const result = await userRepository.findWithPagination({
        page,
        limit,
        filters,
        sort: { createdAt: -1 },
      });

      res.status(200).json({
        success: true,
        data: result.data.map((c: { _id?: { toString: () => string }; email: string; name: string; subscription: unknown; isSuspended: boolean; createdAt: Date }) => ({
          id: c._id?.toString(),
          email: c.email,
          name: c.name,
          subscription: c.subscription,
          isSuspended: c.isSuspended,
          createdAt: c.createdAt.toISOString(),
        })),
        total: result.total,
        page: result.page,
        limit: result.limit,
        totalPages: result.totalPages,
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
    });
  }
}

async function handleGetCustomer(
  req: Request,
  res: Response,
  userRepository: UserRepository
): Promise<void> {
  try {
    const { id } = req.params;
    if (!id) {
      res.status(400).json({ success: false, error: 'Customer ID is required' });
      return;
    }
    const customer = await userRepository.findById(id);

    if (!customer) {
      res.status(404).json({
        success: false,
        error: 'Customer not found',
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: {
        id: customer._id?.toString(),
        email: customer.email,
        name: customer.name,
        phone: customer.phone,
        phoneVerified: customer.phoneVerified,
        subscription: customer.subscription,
        isSuspended: customer.isSuspended,
        suspendedReason: customer.suspendedReason,
        suspendedAt: customer.suspendedAt?.toISOString(),
        createdAt: customer.createdAt.toISOString(),
        updatedAt: customer.updatedAt.toISOString(),
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
    });
  }
}

async function handleUpdateCustomer(
  req: Request,
  res: Response,
  userRepository: UserRepository,
  auditLogRepository: AuditLogRepository,
  adminId: string,
  adminEmail: string
): Promise<void> {
  try {
    const { id } = req.params;
    if (!id) {
      res.status(400).json({ success: false, error: 'Customer ID is required' });
      return;
    }
    const updates = req.body;

    const customer = await userRepository.findById(id);
    if (!customer) {
      res.status(404).json({
        success: false,
        error: 'Customer not found',
      });
      return;
    }

    // Track changes for audit log
    const changes: Array<{ field: string; oldValue: unknown; newValue: unknown }> = [];
    if (updates.name && updates.name !== customer.name) {
      changes.push({ field: 'name', oldValue: customer.name, newValue: updates.name });
    }

    const updated = await userRepository.update(id, updates);

    if (!updated) {
      res.status(404).json({
        success: false,
        error: 'Customer not found',
      });
      return;
    }

    // Create audit log
    if (changes.length > 0) {
      await auditLogRepository.create({
        adminUserId: adminId,
        adminEmail,
        action: 'customer:edit',
        entityType: 'customer',
        entityId: id,
        changes,
        ipAddress: req.ip ?? 'unknown',
        userAgent: req.headers['user-agent'] ?? 'unknown',
      });
    }

    res.status(200).json({
      success: true,
      data: {
        id: updated._id?.toString(),
        email: updated.email,
        name: updated.name,
        subscription: updated.subscription,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
    });
  }
}

async function handleDeleteCustomer(
  req: Request,
  res: Response,
  userRepository: UserRepository,
  auditLogRepository: AuditLogRepository,
  adminId: string,
  adminEmail: string
): Promise<void> {
  try {
    const { id } = req.params;
    if (!id) {
      res.status(400).json({ success: false, error: 'Customer ID is required' });
      return;
    }
    const authReq = req as IAdminAuthenticatedRequest;

    // Only super_admin can delete
    if (authReq.adminRole !== 'super_admin') {
      res.status(403).json({
        success: false,
        error: 'Only super_admin can delete customers',
      });
      return;
    }

    const customer = await userRepository.findById(id);
    if (!customer) {
      res.status(404).json({
        success: false,
        error: 'Customer not found',
      });
      return;
    }

    const success = await userRepository.delete(id);

    if (!success) {
      res.status(404).json({
        success: false,
        error: 'Customer not found',
      });
      return;
    }

    // Create audit log
    await auditLogRepository.create({
      adminUserId: adminId,
      adminEmail,
      action: 'customer:delete',
      entityType: 'customer',
      entityId: id,
      reason: req.body.reason,
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

async function handleSuspendCustomer(
  req: Request,
  res: Response,
  userRepository: UserRepository,
  auditLogRepository: AuditLogRepository,
  adminId: string,
  adminEmail: string
): Promise<void> {
  try {
    const { id } = req.params;
    if (!id) {
      res.status(400).json({ success: false, error: 'Customer ID is required' });
      return;
    }
    const { reason } = req.body;

    if (!reason) {
      res.status(400).json({
        success: false,
        error: 'Suspension reason is required',
      });
      return;
    }

    const customer = await userRepository.findById(id);
    if (!customer) {
      res.status(404).json({
        success: false,
        error: 'Customer not found',
      });
      return;
    }

    const success = await userRepository.suspendUser(id, reason);

    if (!success) {
      res.status(404).json({
        success: false,
        error: 'Customer not found',
      });
      return;
    }

    // Create audit log
    await auditLogRepository.create({
      adminUserId: adminId,
      adminEmail,
      action: 'customer:suspend',
      entityType: 'customer',
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

async function handleUnsuspendCustomer(
  req: Request,
  res: Response,
  userRepository: UserRepository,
  auditLogRepository: AuditLogRepository,
  adminId: string,
  adminEmail: string
): Promise<void> {
  try {
    const { id } = req.params;
    if (!id) {
      res.status(400).json({ success: false, error: 'Customer ID is required' });
      return;
    }

    const customer = await userRepository.findById(id);
    if (!customer) {
      res.status(404).json({
        success: false,
        error: 'Customer not found',
      });
      return;
    }

    const success = await userRepository.unsuspendUser(id);

    if (!success) {
      res.status(404).json({
        success: false,
        error: 'Customer not found',
      });
      return;
    }

    // Create audit log
    await auditLogRepository.create({
      adminUserId: adminId,
      adminEmail,
      action: 'customer:unsuspend',
      entityType: 'customer',
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

export function customersRouter(config: ICustomersRouterConfig): Router {
  const router = Router();
  const userRepository = new UserRepository(config.database);
  const auditLogRepository = new AuditLogRepository(config.database);
  const adminAuthService = new AdminAuthService(config.database, config.jwtSecret);

  // Apply admin auth middleware to all routes
  router.use(adminAuthMiddleware(adminAuthService));

  router.get('/', (req: Request, res: Response) => {
    void handleGetCustomers(req, res, userRepository);
  });

  router.get('/:id', (req: Request, res: Response) => {
    void handleGetCustomer(req, res, userRepository);
  });

  router.put('/:id', (req: Request, res: Response) => {
    const authReq = req as IAdminAuthenticatedRequest;
    void handleUpdateCustomer(
      req,
      res,
      userRepository,
      auditLogRepository,
      authReq.adminId!,
      authReq.adminEmail!
    );
  });

  router.delete('/:id', (req: Request, res: Response) => {
    const authReq = req as IAdminAuthenticatedRequest;
    void handleDeleteCustomer(
      req,
      res,
      userRepository,
      auditLogRepository,
      authReq.adminId!,
      authReq.adminEmail!
    );
  });

  router.post('/:id/suspend', (req: Request, res: Response) => {
    const authReq = req as IAdminAuthenticatedRequest;
    void handleSuspendCustomer(
      req,
      res,
      userRepository,
      auditLogRepository,
      authReq.adminId!,
      authReq.adminEmail!
    );
  });

  router.post('/:id/unsuspend', (req: Request, res: Response) => {
    const authReq = req as IAdminAuthenticatedRequest;
    void handleUnsuspendCustomer(
      req,
      res,
      userRepository,
      auditLogRepository,
      authReq.adminId!,
      authReq.adminEmail!
    );
  });

  return router;
}

