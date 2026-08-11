import { Router, type Request, type Response } from 'express';
import type { Db } from 'mongodb';
import { PaymentRepository, AuditLogRepository } from '@scholaracle/database';
import { AdminAuthService } from '@scholaracle/auth';
import { ExternalServiceError, NotFoundError, ValidationError } from '@scholaracle/contracts';
import {
  adminAuthMiddleware,
  type IAdminAuthenticatedRequest,
} from '../../../middleware/adminAuth';
import { requireAdminStepUp } from '../../../middleware/adminStepUp';
import { asyncHandler } from '../../../middleware/asyncHandler';
import type { SquareService } from '../../../services/SquareService';

export interface IPaymentsRouterConfig {
  readonly database: Db;
  readonly jwtSecret?: string;
  readonly squareService?: SquareService;
}

async function handleGetPayments(
  req: Request,
  res: Response,
  paymentRepository: PaymentRepository
): Promise<void> {
  const status = req.query['status'] as string | undefined;
  const userId = req.query['userId'] as string | undefined;

  let payments;
  if (userId) {
    payments = await paymentRepository.findByUserId(userId);
  } else {
    // Get all payments (limited)
    const collection = paymentRepository['_collection'];
    const filter: Record<string, unknown> = {};

    if (status) {
      filter['status'] = status;
    }

    const docs = await collection.find(filter).sort({ createdAt: -1 }).limit(100).toArray();
    payments = docs.map((doc: unknown) => doc);
  }

  res.status(200).json({
    success: true,
    data: Array.isArray(payments)
      ? payments.map(
          (payment: {
            _id?: { toString: () => string };
            userId: string;
            amount: number;
            currency: string;
            status: string;
            paymentMethod: string;
            createdAt?: Date;
          }) => ({
            id: payment._id?.toString(),
            userId: payment.userId,
            amount: payment.amount / 100, // Convert to dollars
            currency: payment.currency,
            status: payment.status,
            paymentMethod: payment.paymentMethod,
            createdAt: payment.createdAt?.toISOString(),
          })
        )
      : [],
  });
}

async function handleGetPayment(
  req: Request,
  res: Response,
  paymentRepository: PaymentRepository
): Promise<void> {
  const { id } = req.params;
  if (!id) {
    throw new ValidationError('Payment ID is required');
  }

  const payment = await paymentRepository.findById(id);

  if (!payment) {
    throw new NotFoundError('Payment not found');
  }

  res.status(200).json({
    success: true,
    data: {
      id: payment._id?.toString(),
      userId: payment.userId,
      amount: payment.amount / 100,
      currency: payment.currency,
      status: payment.status,
      paymentMethod: payment.paymentMethod,
      amountRefunded: payment.amountRefunded / 100,
      createdAt: payment.createdAt.toISOString(),
    },
  });
}

async function handleRefundPayment(
  req: Request,
  res: Response,
  paymentRepository: PaymentRepository,
  auditLogRepository: AuditLogRepository,
  adminId: string,
  adminEmail: string,
  config: IPaymentsRouterConfig
): Promise<void> {
  const { id } = req.params;
  if (!id) {
    throw new ValidationError('Payment ID is required');
  }

  const { amount, reason } = req.body;

  if (!amount || !reason) {
    throw new ValidationError('Amount and reason are required');
  }

  const amountInCents = Math.round(amount * 100);

  // Attempt real refund via Square if configured
  const payment = await paymentRepository.findById(id);
  if (!payment) {
    throw new NotFoundError('Payment not found');
  }

  if (config.squareService && payment.squarePaymentId) {
    try {
      await config.squareService.refundPayment(payment.squarePaymentId, amountInCents, reason);
    } catch (err) {
      throw new ExternalServiceError(
        `Square refund failed: ${err instanceof Error ? err.message : 'Unknown error'}`
      );
    }
  }

  const success = await paymentRepository.recordRefund(id, amountInCents, adminId, reason);

  if (!success) {
    throw new NotFoundError('Payment not found');
  }

  // Create audit log
  await auditLogRepository.create({
    adminUserId: adminId,
    adminEmail,
    action: 'payment:refund',
    entityType: 'payment',
    entityId: id,
    reason,
    metadata: { amount: amountInCents },
    ipAddress: req.ip ?? 'unknown',
    userAgent: req.headers['user-agent'] ?? 'unknown',
  });

  res.status(200).json({
    success: true,
  });
}

async function handleRetryPayment(
  req: Request,
  res: Response,
  paymentRepository: PaymentRepository,
  auditLogRepository: AuditLogRepository,
  adminId: string,
  adminEmail: string
): Promise<void> {
  const { id } = req.params;
  if (!id) {
    throw new ValidationError('Payment ID is required');
  }

  const payment = await paymentRepository.findById(id);
  if (!payment) {
    throw new NotFoundError('Payment not found');
  }

  if (payment.status === 'succeeded') {
    throw new ValidationError('Payment already succeeded — cannot retry');
  }

  await paymentRepository.updateStatus(id, 'retry_pending');

  // Create audit log
  await auditLogRepository.create({
    adminUserId: adminId,
    adminEmail,
    action: 'payment:retry',
    entityType: 'payment',
    entityId: id,
    ipAddress: req.ip ?? 'unknown',
    userAgent: req.headers['user-agent'] ?? 'unknown',
  });

  res.status(200).json({
    success: true,
    message: 'Payment marked for retry. Customer will need to complete a new checkout.',
  });
}

export function paymentsRouter(config: IPaymentsRouterConfig): Router {
  const router = Router();
  const paymentRepository = new PaymentRepository(config.database);
  const auditLogRepository = new AuditLogRepository(config.database);
  const adminAuthService = new AdminAuthService(config.database, config.jwtSecret);

  // Apply admin auth middleware to all routes
  router.use(adminAuthMiddleware(adminAuthService));

  router.get(
    '/',
    asyncHandler((req: Request, res: Response) => handleGetPayments(req, res, paymentRepository))
  );

  router.get(
    '/:id',
    asyncHandler((req: Request, res: Response) => handleGetPayment(req, res, paymentRepository))
  );

  router.post(
    '/:id/refund',
    requireAdminStepUp({ database: config.database, jwtSecret: config.jwtSecret }),
    asyncHandler((req: Request, res: Response) => {
      const authReq = req as IAdminAuthenticatedRequest;
      return handleRefundPayment(
        req,
        res,
        paymentRepository,
        auditLogRepository,
        authReq.adminId!,
        authReq.adminEmail!,
        config
      );
    })
  );

  router.post(
    '/:id/retry',
    asyncHandler((req: Request, res: Response) => {
      const authReq = req as IAdminAuthenticatedRequest;
      return handleRetryPayment(
        req,
        res,
        paymentRepository,
        auditLogRepository,
        authReq.adminId!,
        authReq.adminEmail!
      );
    })
  );

  return router;
}
