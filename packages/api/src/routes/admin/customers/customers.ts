import { Router, type Request, type Response } from 'express';
import type { Db } from 'mongodb';
import {
  UserRepository,
  AuditLogRepository,
  StudentRepository,
  PaymentRepository,
  SubscriptionRepository,
  type SubscriptionPlan,
} from '@scholaracle/database';
import { AdminAuthService, AuthService } from '@scholaracle/auth';
import { NotFoundError, ValidationError } from '@scholaracle/contracts';
import type { IPasswordChangedEmailSender } from '../../../services/PasswordChangedEmailSender';
import {
  adminAuthMiddleware,
  type IAdminAuthenticatedRequest,
} from '../../../middleware/adminAuth';
import { requireAdminStepUp } from '../../../middleware/adminStepUp';
import { asyncHandler } from '../../../middleware/asyncHandler';

// ---------------------------------------------------------------------------
// Data masking utilities
// ---------------------------------------------------------------------------

/** Mask email: "user@example.com" → "u***@example.com" */
export function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!local || !domain) return '***';
  return `${local[0]}***@${domain}`;
}

/** Mask phone: "+15551234567" → "+1***4567" */
export function maskPhone(phone: string): string {
  if (phone.length <= 4) return '***';
  return `${phone.slice(0, 2)}***${phone.slice(-4)}`;
}

export interface ICustomersRouterConfig {
  readonly database: Db;
  readonly jwtSecret?: string;
  /** When provided, used for admin-triggered password reset email (send-reset). */
  readonly authService?: AuthService;
  /** When provided, used to send "password changed by admin" email after set-password. */
  readonly passwordChangedEmailSender?: IPasswordChangedEmailSender;
  /** Base URL for links in emails (e.g. password reset link after admin set-password). */
  readonly baseUrl?: string;
}

async function handleGetCustomers(
  req: Request,
  res: Response,
  userRepository: UserRepository,
  database: Db
): Promise<void> {
  const page = parseInt((req.query['page'] as string) || '1') || 1;
  const limit = parseInt((req.query['limit'] as string) || '25') || 25;
  const search = req.query['search'] as string | undefined;
  const plan = req.query['plan'] as string | undefined;
  const status = req.query['status'] as string | undefined;
  const isMasked = req.query['masked'] === 'true';

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
      ? (scraperJobsCollection
          .aggregate([
            { $match: { userId: { $in: userIds } } },
            { $group: { _id: '$userId', count: { $sum: 1 } } },
          ])
          .toArray() as Promise<Array<{ _id: string; count: number }>>)
      : Promise.resolve([]),
    userIds.length > 0
      ? (scraperJobsCollection
          .aggregate([
            { $match: { userId: { $in: userIds }, status: 'ready' } },
            { $sort: { updatedAt: -1 } },
            { $group: { _id: '$userId', lastSync: { $first: '$updatedAt' } } },
          ])
          .toArray() as Promise<Array<{ _id: string; lastSync: Date }>>)
      : Promise.resolve([]),
  ]);

  const tokenStatusByUser: Record<string, 'active' | 'none' | 'revoked'> = {};
  for (const uid of userIds) tokenStatusByUser[uid] = 'none';
  for (const doc of tokenDocs as unknown as Array<{ userId: string; revokedAt: Date | null }>) {
    if (doc.revokedAt == null) tokenStatusByUser[doc.userId] = 'active';
    else if (tokenStatusByUser[doc.userId] !== 'active') tokenStatusByUser[doc.userId] = 'revoked';
  }

  const jobCountByUser: Record<string, number> = {};
  for (const g of jobCounts as Array<{ _id: string; count: number }>)
    jobCountByUser[g._id] = g.count;

  const lastSyncByUser: Record<string, string> = {};
  for (const s of lastSyncDocs) {
    if (s.lastSync) lastSyncByUser[s._id] = (s.lastSync as Date).toISOString();
  }

  const mapCustomer = (c: {
    _id?: { toString: () => string };
    email: string;
    name: string;
    subscription: unknown;
    isSuspended: boolean;
    createdAt: Date;
  }) => {
    const id = c._id?.toString();
    return {
      id,
      email: isMasked ? maskEmail(c.email) : c.email,
      name: c.name,
      subscription: c.subscription,
      isSuspended: c.isSuspended,
      createdAt: c.createdAt.toISOString(),
      scraperTokenStatus: id ? (tokenStatusByUser[id] ?? 'none') : 'none',
      scraperJobCount: id ? (jobCountByUser[id] ?? 0) : 0,
      lastScraperSync: id ? (lastSyncByUser[id] ?? null) : null,
    };
  };

  res.status(200).json({
    success: true,
    data: customerList.map(mapCustomer),
    total,
    page: resultPage,
    limit: resultLimit,
    totalPages,
  });
}

async function handleGetCustomer(
  req: Request,
  res: Response,
  userRepository: UserRepository,
  database: Db
): Promise<void> {
  const { id } = req.params;
  if (!id) {
    throw new ValidationError('Customer ID is required');
  }
  const customer = await userRepository.findById(id);

  if (!customer) {
    throw new NotFoundError('Customer not found');
  }

  const revokedTokensCollection = database.collection('revoked_connector_tokens');
  const scraperJobsCollection = database.collection('scraper_generation_jobs');

  const [tokenDocs, jobCount, lastSyncDoc] = await Promise.all([
    revokedTokensCollection.find({ userId: id, tokenPurpose: 'scraper' }).toArray(),
    scraperJobsCollection.countDocuments({ userId: id }),
    scraperJobsCollection.findOne(
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
}

async function handleUpdateCustomer(
  req: Request,
  res: Response,
  userRepository: UserRepository,
  auditLogRepository: AuditLogRepository,
  adminId: string,
  adminEmail: string
): Promise<void> {
  const { id } = req.params;
  if (!id) {
    throw new ValidationError('Customer ID is required');
  }
  const updates = req.body;

  const customer = await userRepository.findById(id);
  if (!customer) {
    throw new NotFoundError('Customer not found');
  }

  // Track changes for audit log
  const changes: Array<{ field: string; oldValue: unknown; newValue: unknown }> = [];
  if (updates.name && updates.name !== customer.name) {
    changes.push({ field: 'name', oldValue: customer.name, newValue: updates.name });
  }

  const updated = await userRepository.update(id, updates);

  if (!updated) {
    throw new NotFoundError('Customer not found');
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
}

async function handleDeleteCustomer(
  req: Request,
  res: Response,
  userRepository: UserRepository,
  auditLogRepository: AuditLogRepository,
  adminId: string,
  adminEmail: string
): Promise<void> {
  const { id } = req.params;
  if (!id) {
    throw new ValidationError('Customer ID is required');
  }
  const customer = await userRepository.findById(id);
  if (!customer) {
    throw new NotFoundError('Customer not found');
  }

  const success = await userRepository.delete(id);

  if (!success) {
    throw new NotFoundError('Customer not found');
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
}

async function handleSuspendCustomer(
  req: Request,
  res: Response,
  userRepository: UserRepository,
  auditLogRepository: AuditLogRepository,
  adminId: string,
  adminEmail: string
): Promise<void> {
  const { id } = req.params;
  if (!id) {
    throw new ValidationError('Customer ID is required');
  }
  const { reason } = req.body;

  if (!reason) {
    throw new ValidationError('Suspension reason is required');
  }

  const customer = await userRepository.findById(id);
  if (!customer) {
    throw new NotFoundError('Customer not found');
  }

  const success = await userRepository.suspendUser(id, reason);

  if (!success) {
    throw new NotFoundError('Customer not found');
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
}

async function handleUnsuspendCustomer(
  req: Request,
  res: Response,
  userRepository: UserRepository,
  auditLogRepository: AuditLogRepository,
  adminId: string,
  adminEmail: string
): Promise<void> {
  const { id } = req.params;
  if (!id) {
    throw new ValidationError('Customer ID is required');
  }

  const customer = await userRepository.findById(id);
  if (!customer) {
    throw new NotFoundError('Customer not found');
  }

  const success = await userRepository.unsuspendUser(id);

  if (!success) {
    throw new NotFoundError('Customer not found');
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
}

async function handleBulkAction(
  req: Request,
  res: Response,
  userRepository: UserRepository,
  auditLogRepository: AuditLogRepository,
  adminId: string,
  adminEmail: string,
  database?: Db
): Promise<void> {
  const { action, customerIds, reason, plan } = (req.body ?? {}) as {
    action?: string;
    customerIds?: string[];
    reason?: string;
    plan?: string;
  };

  if (!action || !Array.isArray(customerIds) || customerIds.length === 0) {
    throw new ValidationError(
      'action (suspend | unsuspend | change_plan) and non-empty customerIds array are required'
    );
  }

  if (action === 'suspend' && !reason) {
    throw new ValidationError('reason is required for suspend action');
  }

  if (action === 'change_plan' && !plan) {
    throw new ValidationError('plan is required for change_plan action');
  }

  if (action !== 'suspend' && action !== 'unsuspend' && action !== 'change_plan') {
    throw new ValidationError('action must be suspend, unsuspend, or change_plan');
  }

  const results: { id: string; success: boolean; error?: string }[] = [];

  // Lazy-init subscription repo only when needed
  let subscriptionRepository: SubscriptionRepository | undefined;
  if (action === 'change_plan' && database) {
    subscriptionRepository = new SubscriptionRepository(database);
  }

  for (const id of customerIds) {
    const customer = await userRepository.findById(id);
    if (!customer) {
      results.push({ id, success: false, error: 'Not found' });
      continue;
    }

    let isSuccess = false;

    if (action === 'change_plan' && subscriptionRepository && plan) {
      const updated = await subscriptionRepository.changePlan(
        id,
        plan as SubscriptionPlan,
        adminId
      );
      isSuccess = updated !== null;
    } else if (action === 'suspend' || action === 'unsuspend') {
      isSuccess =
        action === 'suspend'
          ? await userRepository.suspendUser(id, reason ?? 'Bulk suspend')
          : await userRepository.unsuspendUser(id);
    }

    if (isSuccess) {
      const auditAction =
        action === 'change_plan'
          ? 'customer:bulk_change_plan'
          : action === 'suspend'
            ? 'customer:bulk_suspend'
            : 'customer:bulk_unsuspend';
      await auditLogRepository.create({
        adminUserId: adminId,
        adminEmail,
        action: auditAction,
        entityType: 'customer',
        entityId: id,
        changes:
          action === 'change_plan'
            ? [{ field: 'plan', oldValue: undefined, newValue: plan }]
            : undefined,
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
}

const MIN_PASSWORD_LENGTH = 8;

async function handleSetPassword(
  req: Request,
  res: Response,
  userRepository: UserRepository,
  auditLogRepository: AuditLogRepository,
  adminId: string,
  adminEmail: string,
  passwordChangedEmailSender: IPasswordChangedEmailSender | undefined,
  baseUrl: string
): Promise<void> {
  const { id } = req.params;
  if (!id) {
    throw new ValidationError('Customer ID is required');
  }
  const { password } = (req.body ?? {}) as { password?: string };
  if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
    throw new ValidationError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
  }

  const customer = await userRepository.findById(id);
  if (!customer) {
    throw new NotFoundError('Customer not found');
  }

  const passwordHash = await UserRepository.hashPassword(password);
  const updated = await userRepository.update(id, { passwordHash });
  if (!updated) {
    throw new NotFoundError('Customer not found');
  }

  await auditLogRepository.create({
    adminUserId: adminId,
    adminEmail,
    action: 'customer:set_password',
    entityType: 'customer',
    entityId: id,
    ipAddress: req.ip ?? 'unknown',
    userAgent: req.headers['user-agent'] ?? 'unknown',
  });

  if (passwordChangedEmailSender && baseUrl) {
    await passwordChangedEmailSender.sendPasswordChanged({
      to: customer.email,
      baseUrl,
    });
  }

  res.status(200).json({ success: true });
}

async function handleSendReset(
  req: Request,
  res: Response,
  userRepository: UserRepository,
  auditLogRepository: AuditLogRepository,
  authService: AuthService | undefined,
  adminId: string,
  adminEmail: string
): Promise<void> {
  const { id } = req.params;
  if (!id) {
    throw new ValidationError('Customer ID is required');
  }

  const customer = await userRepository.findById(id);
  if (!customer) {
    throw new NotFoundError('Customer not found');
  }

  if (!authService) {
    res.status(503).json({
      success: false,
      error: 'Password reset is not configured',
    });
    return;
  }

  const result = await authService.requestPasswordReset(customer.email);
  if (!result.success) {
    res.status(500).json({
      success: false,
      error: result.error ?? 'Failed to send reset email',
    });
    return;
  }

  await auditLogRepository.create({
    adminUserId: adminId,
    adminEmail,
    action: 'customer:send_reset',
    entityType: 'customer',
    entityId: id,
    ipAddress: req.ip ?? 'unknown',
    userAgent: req.headers['user-agent'] ?? 'unknown',
  });

  res.status(200).json({ success: true });
}

async function handleForceReset(
  req: Request,
  res: Response,
  userRepository: UserRepository,
  auditLogRepository: AuditLogRepository,
  adminId: string,
  adminEmail: string
): Promise<void> {
  const { id } = req.params;
  if (!id) {
    throw new ValidationError('Customer ID is required');
  }

  const customer = await userRepository.findById(id);
  if (!customer) {
    throw new NotFoundError('Customer not found');
  }

  const updated = await userRepository.update(id, { forcePasswordReset: true });
  if (!updated) {
    throw new NotFoundError('Customer not found');
  }

  await auditLogRepository.create({
    adminUserId: adminId,
    adminEmail,
    action: 'customer:force_reset',
    entityType: 'customer',
    entityId: id,
    ipAddress: req.ip ?? 'unknown',
    userAgent: req.headers['user-agent'] ?? 'unknown',
  });

  res.status(200).json({ success: true });
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

  router.get(
    '/',
    asyncHandler((req: Request, res: Response) =>
      handleGetCustomers(req, res, userRepository, config.database)
    )
  );

  router.post(
    '/bulk-action',
    asyncHandler((req: Request, res: Response) => {
      const authReq = req as IAdminAuthenticatedRequest;
      return handleBulkAction(
        req,
        res,
        userRepository,
        auditLogRepository,
        authReq.adminId!,
        authReq.adminEmail!,
        config.database
      );
    })
  );

  router.get(
    '/:id',
    asyncHandler((req: Request, res: Response) =>
      handleGetCustomer(req, res, userRepository, config.database)
    )
  );

  // GET /api/admin/customers/:id/students
  router.get(
    '/:id/students',
    asyncHandler(async (req: Request, res: Response) => {
      const { id } = req.params;
      if (!id) {
        throw new ValidationError('Customer ID is required');
      }

      const customer = await userRepository.findById(id);
      if (!customer) {
        throw new NotFoundError('Customer not found');
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
    })
  );

  // GET /api/admin/customers/:id/activity
  router.get(
    '/:id/activity',
    asyncHandler(async (req: Request, res: Response) => {
      const { id } = req.params;
      if (!id) {
        throw new ValidationError('Customer ID is required');
      }

      const customer = await userRepository.findById(id);
      if (!customer) {
        throw new NotFoundError('Customer not found');
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
    })
  );

  // GET /api/admin/customers/:id/ltv
  router.get(
    '/:id/ltv',
    asyncHandler(async (req: Request, res: Response) => {
      const { id } = req.params;
      if (!id) {
        throw new ValidationError('Customer ID is required');
      }

      const customer = await userRepository.findById(id);
      if (!customer) {
        throw new NotFoundError('Customer not found');
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
    })
  );

  // POST /api/admin/customers/:id/impersonate
  router.post(
    '/:id/impersonate',
    requireAdminStepUp({ database: config.database, jwtSecret: config.jwtSecret }),
    asyncHandler(async (req: Request, res: Response) => {
      const { id } = req.params;
      if (!id) {
        throw new ValidationError('Customer ID is required');
      }

      const authReq = req as IAdminAuthenticatedRequest;

      const customer = await userRepository.findById(id);
      if (!customer) {
        throw new NotFoundError('Customer not found');
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
    })
  );

  // POST /api/admin/customers/:id/set-password
  router.post(
    '/:id/set-password',
    requireAdminStepUp({ database: config.database, jwtSecret: config.jwtSecret }),
    asyncHandler(async (req: Request, res: Response) => {
      const authReq = req as IAdminAuthenticatedRequest;
      await handleSetPassword(
        req,
        res,
        userRepository,
        auditLogRepository,
        authReq.adminId!,
        authReq.adminEmail!,
        config.passwordChangedEmailSender,
        config.baseUrl ?? ''
      );
    })
  );

  // POST /api/admin/customers/:id/send-reset
  router.post(
    '/:id/send-reset',
    requireAdminStepUp({ database: config.database, jwtSecret: config.jwtSecret }),
    asyncHandler(async (req: Request, res: Response) => {
      const authReq = req as IAdminAuthenticatedRequest;
      await handleSendReset(
        req,
        res,
        userRepository,
        auditLogRepository,
        config.authService,
        authReq.adminId!,
        authReq.adminEmail!
      );
    })
  );

  // POST /api/admin/customers/:id/force-reset
  router.post(
    '/:id/force-reset',
    requireAdminStepUp({ database: config.database, jwtSecret: config.jwtSecret }),
    asyncHandler(async (req: Request, res: Response) => {
      const authReq = req as IAdminAuthenticatedRequest;
      await handleForceReset(
        req,
        res,
        userRepository,
        auditLogRepository,
        authReq.adminId!,
        authReq.adminEmail!
      );
    })
  );

  router.put(
    '/:id',
    asyncHandler((req: Request, res: Response) => {
      const authReq = req as IAdminAuthenticatedRequest;
      return handleUpdateCustomer(
        req,
        res,
        userRepository,
        auditLogRepository,
        authReq.adminId!,
        authReq.adminEmail!
      );
    })
  );

  router.delete(
    '/:id',
    asyncHandler((req: Request, res: Response) => {
      const authReq = req as IAdminAuthenticatedRequest;
      return handleDeleteCustomer(
        req,
        res,
        userRepository,
        auditLogRepository,
        authReq.adminId!,
        authReq.adminEmail!
      );
    })
  );

  router.post(
    '/:id/suspend',
    asyncHandler((req: Request, res: Response) => {
      const authReq = req as IAdminAuthenticatedRequest;
      return handleSuspendCustomer(
        req,
        res,
        userRepository,
        auditLogRepository,
        authReq.adminId!,
        authReq.adminEmail!
      );
    })
  );

  router.post(
    '/:id/unsuspend',
    asyncHandler((req: Request, res: Response) => {
      const authReq = req as IAdminAuthenticatedRequest;
      return handleUnsuspendCustomer(
        req,
        res,
        userRepository,
        auditLogRepository,
        authReq.adminId!,
        authReq.adminEmail!
      );
    })
  );

  return router;
}
