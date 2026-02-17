import { Router, type Request, type Response } from 'express';
import type { Db } from 'mongodb';
import {
  UserRepository,
  AuditLogRepository,
  StudentRepository,
  PaymentRepository,
} from '@scholaracle/database';
import { AdminAuthService, AuthService } from '@scholaracle/auth';
import {
  adminAuthMiddleware,
  type IAdminAuthenticatedRequest,
} from '../../../middleware/adminAuth';
import { requireAdminStepUp } from '../../../middleware/adminStepUp';
import { asyncHandler } from '../../../middleware/asyncHandler';

export interface ICustomersRouterConfig {
  readonly database: Db;
  readonly jwtSecret?: string;
}

async function handleGetCustomers(
  req: Request,
  res: Response,
  userRepository: UserRepository,
  database: Db
): Promise<void> {
  try {
    const page = parseInt((req.query['page'] as string) || '1') || 1;
    const limit = parseInt((req.query['limit'] as string) || '25') || 25;
    const search = req.query['search'] as string | undefined;
    const plan = req.query['plan'] as string | undefined;
    const status = req.query['status'] as string | undefined;

    const filters: Record<string, unknown> = {};

    if (plan) {
      filters['subscription.plan'] = plan;
    }

    if (status === 'suspended') {
      filters['isSuspended'] = true;
    } else if (status === 'active') {
      filters['isSuspended'] = { $ne: true };
    }

    const revokedTokensCollection = database.collection('revoked_connector_tokens');
    const scraperJobsCollection = database.collection('scraper_generation_jobs');

    let customerList: ReadonlyArray<{
      _id?: { toString: () => string };
      email: string;
      name: string;
      subscription: unknown;
      isSuspended: boolean;
      createdAt: Date;
    }>;
    let total: number;
    let resultPage: number;
    let resultLimit: number;
    let totalPages: number | undefined;

    if (search) {
      customerList = await userRepository.searchUsers(search);
      total = customerList.length;
      resultPage = 1;
      resultLimit = customerList.length;
      totalPages = 1;
    } else {
      const result = await userRepository.findWithPagination({
        page,
        limit,
        filters,
        sort: { createdAt: -1 },
      });
      customerList = result.data;
      total = result.total;
      resultPage = result.page;
      resultLimit = result.limit;
      totalPages = result.totalPages;
    }

    const userIds = customerList.map((c) => c._id?.toString()).filter(Boolean) as string[];

    const [tokenDocs, jobCounts, lastSyncDocs] = await Promise.all([
      userIds.length > 0
        ? revokedTokensCollection
            .find({ userId: { $in: userIds }, tokenPurpose: 'scraper' })
            .toArray()
        : Promise.resolve([]),
      userIds.length > 0
        ? (scraperJobsCollection.aggregate([
            { $match: { userId: { $in: userIds } } },
            { $group: { _id: '$userId', count: { $sum: 1 } } },
          ]).toArray() as Promise<Array<{ _id: string; count: number }>>)
        : Promise.resolve([]),
      userIds.length > 0
        ? (scraperJobsCollection.aggregate([
            { $match: { userId: { $in: userIds }, status: 'ready' } },
            { $sort: { updatedAt: -1 } },
            { $group: { _id: '$userId', lastSync: { $first: '$updatedAt' } } },
          ]).toArray() as Promise<Array<{ _id: string; lastSync: Date }>>)
        : Promise.resolve([]),
    ]);

    const tokenStatusByUser: Record<string, 'active' | 'none' | 'revoked'> = {};
    for (const uid of userIds) tokenStatusByUser[uid] = 'none';
    for (const doc of tokenDocs as unknown as Array<{ userId: string; revokedAt: Date | null }>) {
      if (doc.revokedAt == null) tokenStatusByUser[doc.userId] = 'active';
      else if (tokenStatusByUser[doc.userId] !== 'active') tokenStatusByUser[doc.userId] = 'revoked';
    }

    const jobCountByUser: Record<string, number> = {};
    for (const g of jobCounts as Array<{ _id: string; count: number }>) jobCountByUser[g._id] = g.count;

    const lastSyncByUser: Record<string, string> = {};
    for (const s of lastSyncDocs) {
      if (s.lastSync) lastSyncByUser[s._id] = (s.lastSync as Date).toISOString();
    }

    const mapCustomer = (
      c: {
        _id?: { toString: () => string };
        email: string;
        name: string;
        subscription: unknown;
        isSuspended: boolean;
        createdAt: Date;
      }
    ) => {
      const id = c._id?.toString();
      return {
        id,
        email: c.email,
        name: c.name,
        subscription: c.subscription,
        isSuspended: c.isSuspended,
        createdAt: c.createdAt.toISOString(),
        scraperTokenStatus: id ? tokenStatusByUser[id] ?? 'none' : 'none',
        scraperJobCount: id ? jobCountByUser[id] ?? 0 : 0,
        lastScraperSync: id ? lastSyncByUser[id] ?? null : null,
      };
    };

    if (search) {
      res.status(200).json({
        success: true,
        data: customerList.map(mapCustomer),
        total,
        page: resultPage,
        limit: resultLimit,
        totalPages,
      });
    } else {
      res.status(200).json({
        success: true,
        data: customerList.map(mapCustomer),
        total,
        page: resultPage,
        limit: resultLimit,
        totalPages,
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
  userRepository: UserRepository,
  database: Db
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

    const revokedTokensCollection = database.collection('revoked_connector_tokens');
    const scraperJobsCollection = database.collection('scraper_generation_jobs');

    const [tokenDocs, jobCount, lastSyncDoc] = await Promise.all([
      revokedTokensCollection.find({ userId: id, tokenPurpose: 'scraper' }).toArray(),
      scraperJobsCollection.countDocuments({ userId: id }),
      scraperJobsCollection
        .findOne(
          { userId: id, status: 'ready' },
          { sort: { updatedAt: -1 }, projection: { updatedAt: 1 } }
        ),
    ]);

    let scraperTokenStatus: 'active' | 'none' | 'revoked' = 'none';
    for (const doc of tokenDocs as unknown as Array<{ userId: string; revokedAt: Date | null }>) {
      if (doc.revokedAt == null) scraperTokenStatus = 'active';
      else if (scraperTokenStatus !== 'active') scraperTokenStatus = 'revoked';
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
        scraperTokenStatus,
        scraperJobCount: jobCount,
        lastScraperSync: lastSyncDoc?.['updatedAt']
          ? (lastSyncDoc['updatedAt'] as Date).toISOString()
          : null,
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

async function handleBulkAction(
  req: Request,
  res: Response,
  userRepository: UserRepository,
  auditLogRepository: AuditLogRepository,
  adminId: string,
  adminEmail: string
): Promise<void> {
  try {
    const { action, customerIds, reason } = (req.body ?? {}) as {
      action?: string;
      customerIds?: string[];
      reason?: string;
    };

    if (!action || !Array.isArray(customerIds) || customerIds.length === 0) {
      res.status(400).json({
        success: false,
        error: 'action (suspend | unsuspend) and non-empty customerIds array are required',
      });
      return;
    }

    if (action === 'suspend' && !reason) {
      res.status(400).json({
        success: false,
        error: 'reason is required for suspend action',
      });
      return;
    }

    if (action !== 'suspend' && action !== 'unsuspend') {
      res.status(400).json({
        success: false,
        error: 'action must be suspend or unsuspend',
      });
      return;
    }

    const results: { id: string; success: boolean; error?: string }[] = [];

    for (const id of customerIds) {
      const customer = await userRepository.findById(id);
      if (!customer) {
        results.push({ id, success: false, error: 'Not found' });
        continue;
      }
      const success =
        action === 'suspend'
          ? await userRepository.suspendUser(id, reason ?? 'Bulk suspend')
          : await userRepository.unsuspendUser(id);
      if (success) {
        await auditLogRepository.create({
          adminUserId: adminId,
          adminEmail,
          action: action === 'suspend' ? 'customer:bulk_suspend' : 'customer:bulk_unsuspend',
          entityType: 'customer',
          entityId: id,
          ipAddress: req.ip ?? 'unknown',
          userAgent: req.headers['user-agent'] ?? 'unknown',
        });
        results.push({ id, success: true });
      } else {
        results.push({ id, success: false, error: 'Update failed' });
      }
    }

    res.status(200).json({
      success: true,
      results,
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
  const studentRepository = new StudentRepository(config.database);
  const paymentRepository = new PaymentRepository(config.database);
  const adminAuthService = new AdminAuthService(config.database, config.jwtSecret);
  const userAuthService = new AuthService(config.database, config.jwtSecret);

  // Apply admin auth middleware to all routes
  router.use(adminAuthMiddleware(adminAuthService));

  router.get('/', (req: Request, res: Response) => {
    void handleGetCustomers(req, res, userRepository, config.database);
  });

  router.post('/bulk-action', (req: Request, res: Response) => {
    const authReq = req as IAdminAuthenticatedRequest;
    void handleBulkAction(
      req,
      res,
      userRepository,
      auditLogRepository,
      authReq.adminId!,
      authReq.adminEmail!
    );
  });

  router.get('/:id', (req: Request, res: Response) => {
    void handleGetCustomer(req, res, userRepository, config.database);
  });

  // GET /api/admin/customers/:id/students
  router.get(
    '/:id/students',
    asyncHandler(async (req: Request, res: Response) => {
      try {
        const { id } = req.params;
        if (!id) {
          res.status(400).json({ success: false, error: 'Customer ID is required' });
          return;
        }

        const customer = await userRepository.findById(id);
        if (!customer) {
          res.status(404).json({ success: false, error: 'Customer not found' });
          return;
        }

        const students = await studentRepository.findByUserId(id);
        res.status(200).json({
          success: true,
          data: students.map((s) => ({
            id: s._id?.toString(),
            userId: s.userId.toString(),
            name: s.name,
            grade: s.grade,
            studentId: s.studentId,
            stats: s.stats,
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

  // GET /api/admin/customers/:id/activity
  router.get(
    '/:id/activity',
    asyncHandler(async (req: Request, res: Response) => {
      try {
        const { id } = req.params;
        if (!id) {
          res.status(400).json({ success: false, error: 'Customer ID is required' });
          return;
        }

        const customer = await userRepository.findById(id);
        if (!customer) {
          res.status(404).json({ success: false, error: 'Customer not found' });
          return;
        }

        const limit = Math.min(parseInt((req.query['limit'] as string) || '50') || 50, 100);

        const [notes, payments, subs, auditLogs, students] = await Promise.all([
          config.database
            .collection('admin_notes')
            .find({ userId: id })
            .sort({ createdAt: -1 })
            .limit(20)
            .toArray(),
          config.database
            .collection('payments')
            .find({ userId: id })
            .sort({ createdAt: -1 })
            .limit(20)
            .toArray(),
          config.database
            .collection('subscriptions')
            .find({ userId: id })
            .sort({ updatedAt: -1, createdAt: -1 })
            .limit(5)
            .toArray(),
          config.database
            .collection('audit_logs')
            .find({ entityType: 'customer', entityId: id })
            .sort({ timestamp: -1, createdAt: -1 })
            .limit(20)
            .toArray(),
          config.database
            .collection('students')
            .find({ userId: customer._id })
            .sort({ createdAt: -1 })
            .limit(20)
            .toArray(),
        ]);

        const items = [
          ...notes.map((n) => ({
            id: `note:${n._id?.toString?.() ?? ''}`,
            type: 'note' as const,
            title: 'Admin note added',
            occurredAt: (n['createdAt']
              ? new Date(String(n['createdAt']))
              : new Date()
            ).toISOString(),
            meta: { category: n['category'], isPinned: n['isPinned'] },
          })),
          ...payments.map((p) => ({
            id: `payment:${p._id?.toString?.() ?? ''}`,
            type: 'payment' as const,
            title: `Payment ${p['status'] ?? 'event'}`,
            occurredAt: (p['createdAt']
              ? new Date(String(p['createdAt']))
              : new Date()
            ).toISOString(),
            meta: { amount: p['amount'], currency: p['currency'], status: p['status'] },
          })),
          ...subs.map((s) => ({
            id: `subscription:${s._id?.toString?.() ?? ''}`,
            type: 'subscription' as const,
            title: `Subscription ${s['status'] ?? ''}`.trim(),
            occurredAt: (s['updatedAt']
              ? new Date(String(s['updatedAt']))
              : s['createdAt']
                ? new Date(String(s['createdAt']))
                : new Date()
            ).toISOString(),
            meta: { plan: s['plan'], status: s['status'] },
          })),
          ...students.map((s) => ({
            id: `student:${s._id?.toString?.() ?? ''}`,
            type: 'student' as const,
            title: `Student added: ${s['name'] ?? 'Student'}`,
            occurredAt: (s['createdAt']
              ? new Date(String(s['createdAt']))
              : new Date()
            ).toISOString(),
            meta: { grade: s['grade'], studentId: s['studentId'] },
          })),
          ...auditLogs.map((a) => ({
            id: `audit:${a._id?.toString?.() ?? ''}`,
            type: 'admin_action' as const,
            title: a['action'] ? `Admin action: ${a['action']}` : 'Admin action',
            occurredAt: (a['timestamp']
              ? new Date(String(a['timestamp']))
              : a['createdAt']
                ? new Date(String(a['createdAt']))
                : new Date()
            ).toISOString(),
            meta: { adminEmail: a['adminEmail'], entityType: a['entityType'] },
          })),
        ];

        items.sort((x, y) => y.occurredAt.localeCompare(x.occurredAt));

        res.status(200).json({ success: true, data: items.slice(0, limit) });
      } catch (error) {
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Internal server error',
        });
      }
    })
  );

  // GET /api/admin/customers/:id/ltv
  router.get(
    '/:id/ltv',
    asyncHandler(async (req: Request, res: Response) => {
      try {
        const { id } = req.params;
        if (!id) {
          res.status(400).json({ success: false, error: 'Customer ID is required' });
          return;
        }

        const customer = await userRepository.findById(id);
        if (!customer) {
          res.status(404).json({ success: false, error: 'Customer not found' });
          return;
        }

        const ltvCents = await paymentRepository.getLifetimeValueByUserId(id);
        res.status(200).json({
          success: true,
          data: {
            customerId: id,
            ltv: ltvCents / 100,
            currency: 'usd',
          },
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Internal server error',
        });
      }
    })
  );

  // POST /api/admin/customers/:id/impersonate
  router.post(
    '/:id/impersonate',
    requireAdminStepUp({ database: config.database, jwtSecret: config.jwtSecret }),
    asyncHandler(async (req: Request, res: Response) => {
      try {
        const { id } = req.params;
        if (!id) {
          res.status(400).json({ success: false, error: 'Customer ID is required' });
          return;
        }

        const authReq = req as IAdminAuthenticatedRequest;

        const customer = await userRepository.findById(id);
        if (!customer) {
          res.status(404).json({ success: false, error: 'Customer not found' });
          return;
        }

        const token = userAuthService.issueTokenForUser(customer._id!.toString(), customer.email);

        await auditLogRepository.create({
          adminUserId: authReq.adminId ?? 'unknown',
          adminEmail: authReq.adminEmail ?? 'unknown',
          action: 'customer:impersonate',
          entityType: 'customer',
          entityId: id,
          reason: req.body?.reason,
          ipAddress: req.ip ?? 'unknown',
          userAgent: req.headers['user-agent'] ?? 'unknown',
        });

        res.status(200).json({ success: true, data: { token } });
      } catch (error) {
        res.status(500).json({
          success: false,
          error: error instanceof Error ? error.message : 'Internal server error',
        });
      }
    })
  );

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
