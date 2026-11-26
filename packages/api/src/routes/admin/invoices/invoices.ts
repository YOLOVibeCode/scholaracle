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
  readonly jwtSecret: string;
  readonly sendGridApiKey?: string;
  readonly fromEmail?: string;
  readonly fromName?: string;
  readonly baseUrl?: string;
}

/** What the invoice email needs from a payment. */
export interface IInvoiceEmailPayment {
  readonly amount: number;
  readonly createdAt: Date;
  readonly description?: string;
}

export interface IInvoiceEmail {
  readonly to: string;
  readonly from: { readonly email: string; readonly name: string };
  readonly subject: string;
  readonly html: string;
}

/**
 * The invoice email. Its sender is the one the server sends every other email from
 * (SENDGRID_FROM_EMAIL and SENDGRID_FROM_NAME), unless the router config names another.
 */
export function buildInvoiceEmail(
  payment: IInvoiceEmailPayment,
  to: string,
  config: Pick<IInvoicesRouterConfig, 'fromEmail' | 'fromName' | 'baseUrl'>,
  env: NodeJS.ProcessEnv = process.env
): IInvoiceEmail {
  const fromEmail =
    config.fromEmail ??
    env['SENDGRID_FROM_EMAIL'] ??
    env['EMAIL_FROM'] ??
    'notifications@scholarmancy.com';
  const fromName = config.fromName ?? env['SENDGRID_FROM_NAME'] ?? 'Scholarmancy';
  const baseUrl = config.baseUrl ?? env['BASE_URL'] ?? 'http://localhost:2800';
  const amount = `$${(payment.amount / 100).toFixed(2)}`;

  return {
    to,
    from: { email: fromEmail, name: fromName },
    subject: `Scholarmancy Invoice — ${amount}`,
    html: `<p>Hi,</p><p>Here is your invoice for <strong>${amount}</strong> on ${payment.createdAt.toLocaleDateString()}.</p><p>${payment.description ?? ''}</p><p><a href="${baseUrl}/dashboard/billing">View in Dashboard</a></p><p>— Scholarmancy</p>`,
  };
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
  const email = buildInvoiceEmail(payment, user.email, config);
  await sgMail.send({
    to: email.to,
    from: { email: email.from.email, name: email.from.name },
    subject: email.subject,
    html: email.html,
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
