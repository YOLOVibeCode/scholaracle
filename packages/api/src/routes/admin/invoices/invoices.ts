import { Router, type Request, type Response } from 'express';
import type { Db } from 'mongodb';
import { PaymentRepository, UserRepository } from '@scholaracle/database';
import { AdminAuthService } from '@scholaracle/auth';
import { NotFoundError, ValidationError } from '@scholaracle/contracts';
import { adminAuthMiddleware } from '../../../middleware/adminAuth';
import { asyncHandler } from '../../../middleware/asyncHandler';
import sgMail from '@sendgrid/mail';

export interface IInvoicesRouterConfig {
  readonly database: Db;
  readonly jwtSecret?: string;
  readonly sendGridApiKey?: string;
  readonly fromEmail?: string;
  readonly fromName?: string;
  readonly baseUrl?: string;
}

/**
 * POST /api/admin/invoices/:id/send
 * Send (resend) invoice to customer by payment/invoice id.
 */
async function handleSendInvoice(
  req: Request,
  res: Response,
  paymentRepository: PaymentRepository,
  config: IInvoicesRouterConfig
): Promise<void> {
  const { id } = req.params;
  if (!id) {
    throw new ValidationError('Invoice ID is required');
  }

  const payment = await paymentRepository.findById(id);
  if (!payment) {
    throw new NotFoundError('Invoice not found');
  }

  const apiKey = config.sendGridApiKey ?? process.env['SENDGRID_API_KEY'] ?? '';
  if (!apiKey) {
    res.status(200).json({
      success: false,
      skipped: true,
      message: 'Invoice send skipped (no email service configured)',
    });
    return;
  }

  const userRepo = new UserRepository(config.database);
  const user = await userRepo.findById(payment.userId);
  if (!user?.email) {
    throw new NotFoundError('User email not found');
  }

  sgMail.setApiKey(apiKey);
  const fromEmail = config.fromEmail ?? process.env['EMAIL_FROM'] ?? 'noreply@scholaracle.com';
  const fromName = config.fromName ?? 'Scholaracle';
  const baseUrl = config.baseUrl ?? process.env['BASE_URL'] ?? 'http://localhost:2800';

  await sgMail.send({
    to: user.email,
    from: { email: fromEmail, name: fromName },
    subject: `Scholaracle Invoice — $${(payment.amount / 100).toFixed(2)}`,
    html: `<p>Hi,</p><p>Here is your invoice for <strong>$${(payment.amount / 100).toFixed(2)}</strong> on ${payment.createdAt.toLocaleDateString()}.</p><p>${payment.description ?? ''}</p><p><a href="${baseUrl}/dashboard/billing">View in Dashboard</a></p><p>— Scholaracle</p>`,
  });

  res.status(200).json({ success: true, message: 'Invoice sent' });
}

export function invoicesRouter(config: IInvoicesRouterConfig): Router {
  const router = Router();
  const paymentRepository = new PaymentRepository(config.database);
  const adminAuthService = new AdminAuthService(config.database, config.jwtSecret);

  router.use(adminAuthMiddleware(adminAuthService));

  router.post(
    '/:id/send',
    asyncHandler((req: Request, res: Response) =>
      handleSendInvoice(req, res, paymentRepository, config)
    )
  );

  return router;
}
